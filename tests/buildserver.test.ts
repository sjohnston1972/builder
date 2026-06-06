import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { writeFiles, collectAssets, contentType } from "../container/build-lib.mjs";

let dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "bb-")); dirs.push(d); return d; };
afterEach(() => { dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })); });

test("writeFiles writes nested files safely under root", async () => {
  const root = tmp();
  await writeFiles(root, [
    { path: "package.json", content: "{}" },
    { path: "src/main.tsx", content: "x" },
  ]);
  expect(readFileSync(join(root, "package.json"), "utf8")).toBe("{}");
  expect(readFileSync(join(root, "src/main.tsx"), "utf8")).toBe("x");
});

test("writeFiles rejects path traversal", async () => {
  const root = tmp();
  await expect(writeFiles(root, [{ path: "../escape.txt", content: "x" }])).rejects.toThrow(/path/i);
});

test("collectAssets returns base64 + content type for every file", async () => {
  const root = tmp();
  await writeFiles(root, [
    { path: "dist/index.html", content: "<h1>hi</h1>" },
    { path: "dist/assets/app.js", content: "console.log(1)" },
  ]);
  const assets = await collectAssets(join(root, "dist"));
  const html = assets.find((a) => a.path === "/index.html");
  const js = assets.find((a) => a.path === "/assets/app.js");
  expect(Buffer.from(html.contentBase64, "base64").toString()).toBe("<h1>hi</h1>");
  expect(html.contentType).toBe("text/html");
  expect(js.contentType).toBe("text/javascript");
});

test("contentType maps common extensions", () => {
  expect(contentType("a.css")).toBe("text/css");
  expect(contentType("a.svg")).toBe("image/svg+xml");
  expect(contentType("a.unknown")).toBe("application/octet-stream");
});

test("writeFiles rejects sibling-prefix escape", async () => {
  const root = tmp();
  // A path that, after resolve, lands outside root but shares its string prefix.
  // e.g. root = /tmp/bb-abc123  →  sibling = /tmp/bb-abc123x/evil.txt
  await expect(writeFiles(root, [{ path: "../" + basename(root) + "x/evil.txt", content: "x" }]))
    .rejects.toThrow(/path|unsafe/i);
});
