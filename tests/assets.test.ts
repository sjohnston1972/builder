import { expect, test, vi, afterEach } from "vitest";
import { hashAsset, buildManifest, uploadAssets } from "../src/assets";

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

test("uploadAssets registers manifest, uploads buckets, returns completion jwt", async () => {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: any, init: any) => {
    const url = String(input);
    calls.push(`${init?.method} ${url}`);
    if (url.includes("/assets-upload-session")) {
      return new Response(JSON.stringify({
        success: true,
        result: { jwt: "UPLOAD_JWT", buckets: [["HASHPLACEHOLDER"]] },
      }), { headers: { "content-type": "application/json" } });
    }
    if (url.includes("/workers/assets/upload")) {
      return new Response(JSON.stringify({ success: true, result: { jwt: "COMPLETION_JWT" } }),
        { headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: false }), { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);

  const assets = [{ path: "/index.html", contentBase64: btoa("hi"), contentType: "text/html" }];
  const env = { CF_ACCOUNT_ID: "acct1", CF_API_TOKEN: "tok" } as any;
  const jwt = await uploadAssets(env, "mysite", assets);

  expect(jwt).toBe("COMPLETION_JWT");
  expect(calls[0]).toContain("POST");
  expect(calls[0]).toContain("/workers/scripts/mysite/assets-upload-session");
  expect(calls.some((c) => c.includes("/workers/assets/upload"))).toBe(true);
});

test("uploadAssets returns the session jwt directly when no buckets need upload", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ success: true, result: { jwt: "ONLY_JWT", buckets: [] } }),
      { headers: { "content-type": "application/json" } })));
  const env = { CF_ACCOUNT_ID: "a", CF_API_TOKEN: "t" } as any;
  const jwt = await uploadAssets(env, "s", []);
  expect(jwt).toBe("ONLY_JWT");
});
