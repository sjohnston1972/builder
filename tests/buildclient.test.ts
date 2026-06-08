import { expect, test } from "vitest";
import { runBuild, probeLive } from "../src/buildclient";

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

test("runBuild reassembles lines split across stream chunks", async () => {
  // Build NDJSON then slice it at an awkward byte boundary (mid-line) into two chunks.
  const text =
    JSON.stringify({ type: "log", line: "compiling" }) + "\n" +
    JSON.stringify({ type: "result", ok: true, assets: [{ path: "/i.html", contentBase64: "aGk=", contentType: "text/html" }] }) + "\n";
  const bytes = new TextEncoder().encode(text);
  const cut = 20; // mid first line
  const body = new ReadableStream({
    start(c) { c.enqueue(bytes.slice(0, cut)); c.enqueue(bytes.slice(cut)); c.close(); },
  });
  const stub = { fetch: async () => new Response(body, { headers: { "content-type": "application/x-ndjson" } }) };
  const logs: string[] = [];
  const result = await runBuild(stub as any, { siteName: "s", files: [] }, (l) => logs.push(l));
  expect(logs).toEqual(["compiling"]);
  expect(result.ok).toBe(true);
  expect(result.assets?.[0].path).toBe("/i.html");
});

test("runBuild parses a result on the final line with no trailing newline", async () => {
  const text = JSON.stringify({ type: "result", ok: true, assets: [] }); // no trailing \n
  const stub = { fetch: async () => new Response(text, { headers: { "content-type": "application/x-ndjson" } }) };
  const result = await runBuild(stub as any, { siteName: "s", files: [] }, () => {});
  expect(result.ok).toBe(true);
});

test("probeLive forwards a pending then returns a live result", async () => {
  const stub = { fetch: async () => ndjsonResponse([
    { type: "pending", status: 0, attempts: 1 },
    { type: "result", live: true, status: 200, ms: 240, attempts: 3 },
  ]) };
  let pendings = 0;
  const r = await probeLive(stub as any, "https://x.clydeford.net", { onPending: () => pendings++ });
  expect(pendings).toBe(1);
  expect(r).toMatchObject({ live: true, status: 200, attempts: 3 });
});

test("probeLive returns not-live when the budget expires", async () => {
  const stub = { fetch: async () => ndjsonResponse([
    { type: "pending", status: 522, attempts: 1 },
    { type: "result", live: false, status: 522, ms: 150000, attempts: 50 },
  ]) };
  const r = await probeLive(stub as any, "https://x.clydeford.net", {});
  expect(r.live).toBe(false);
  expect(r.status).toBe(522);
});

test("probeLive throws on a bodyless transport failure (so caller can fall back)", async () => {
  const stub = { fetch: async () => new Response(null, { status: 503 }) };
  await expect(probeLive(stub as any, "https://x.clydeford.net", {})).rejects.toThrow(/probe server/);
});
