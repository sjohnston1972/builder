import { expect, test, vi, afterEach } from "vitest";
import { hashAsset, buildManifest } from "../src/assets";

afterEach(() => vi.restoreAllMocks());

test("hashAsset returns a 32-hex-char hash", async () => {
  const h = await hashAsset(new TextEncoder().encode("hello"));
  expect(h).toMatch(/^[0-9a-f]{32}$/);
});

test("buildManifest maps each asset path to hash + byte size", async () => {
  const assets = [
    { path: "/index.html", contentBase64: Buffer.from("<h1>hi</h1>").toString("base64"), contentType: "text/html" },
  ];
  const { manifest, byHash } = await buildManifest(assets);
  expect(Object.keys(manifest)).toEqual(["/index.html"]);
  expect(manifest["/index.html"].size).toBe("<h1>hi</h1>".length);
  expect(manifest["/index.html"].hash).toMatch(/^[0-9a-f]{32}$/);
  expect(byHash.get(manifest["/index.html"].hash)).toBeTruthy();
});
