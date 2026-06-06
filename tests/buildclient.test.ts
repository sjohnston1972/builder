import { expect, test } from "vitest";
import { runBuild } from "../src/buildclient";

function ndjsonResponse(lines: object[]): Response {
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
}

test("runBuild streams log lines and returns the final result", async () => {
  const stub = { fetch: async () => ndjsonResponse([
    { type: "log", line: "npm install" },
    { type: "log", line: "vite build" },
    { type: "result", ok: true, assets: [{ path: "/index.html", contentBase64: "aGk=", contentType: "text/html" }] },
  ]) };
  const logs: string[] = [];
  const result = await runBuild(stub as any, { siteName: "s", files: [] }, (line) => logs.push(line));
  expect(logs).toEqual(["npm install", "vite build"]);
  expect(result.ok).toBe(true);
  expect(result.assets?.[0].path).toBe("/index.html");
});

test("runBuild surfaces a failed result", async () => {
  const stub = { fetch: async () => ndjsonResponse([
    { type: "log", line: "boom" },
    { type: "result", ok: false, error: "build failed (exit 1)" },
  ]) };
  const result = await runBuild(stub as any, { siteName: "s", files: [] }, () => {});
  expect(result.ok).toBe(false);
  expect(result.error).toContain("build failed");
});
