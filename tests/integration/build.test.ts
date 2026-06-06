import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const hasDocker = (() => {
  try { execFileSync("docker", ["info"], { stdio: "ignore" }); return true; } catch { return false; }
})();

const IMAGE = "forge-buildbox-it";
const NAME = "forge-bb-it";
const FIXTURE = join(__dirname, "..", "..", "container", "fixtures", "react-vite");

function readFixture(dir: string): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  function walk(d: string) {
    for (const e of readdirSync(d)) {
      const full = join(d, e);
      if (statSync(full).isDirectory()) walk(full);
      else out.push({ path: relative(dir, full).split(sep).join("/"), content: readFileSync(full, "utf8") });
    }
  }
  walk(dir);
  return out;
}

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

describe.runIf(hasDocker)("container build (integration)", () => {
  let port = 0;
  beforeAll(() => {
    sh("docker", ["build", "-t", IMAGE, "./container"]);
    try { sh("docker", ["rm", "-f", NAME]); } catch { /* none */ }
    sh("docker", ["run", "-d", "-P", "--name", NAME, IMAGE]);
    const mapping = sh("docker", ["port", NAME, "8080"]).trim(); // e.g. "0.0.0.0:49160"
    port = Number(mapping.split(":").pop());
  }, 180_000);

  afterAll(() => { try { sh("docker", ["rm", "-f", NAME]); } catch { /* ignore */ } });

  it("builds the react-vite fixture and returns dist assets", async () => {
    // Wait for the server to accept connections.
    for (let i = 0; i < 20; i++) {
      try { const r = await fetch(`http://localhost:${port}/health`); if (r.ok) break; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }

    const files = readFixture(FIXTURE);
    const res = await fetch(`http://localhost:${port}/build`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteName: "fixture", files }),
    });
    const text = await res.text();
    const lines = text.trim().split("\n").map((l) => JSON.parse(l));
    const result = lines.find((l) => l.type === "result");

    expect(result, `no result line in: ${text.slice(-500)}`).toBeTruthy();
    expect(result.ok, `build failed: ${result?.error}\nlogs tail:\n${text.slice(-800)}`).toBe(true);
    const indexHtml = result.assets.find((a: any) => a.path === "/index.html");
    expect(indexHtml).toBeTruthy();
    expect(Buffer.from(indexHtml.contentBase64, "base64").toString()).toContain("<div id=\"root\">");
    // Vite emits hashed JS into /assets/*.js
    expect(result.assets.some((a: any) => a.path.startsWith("/assets/") && a.path.endsWith(".js"))).toBe(true);
  }, 180_000);
});
