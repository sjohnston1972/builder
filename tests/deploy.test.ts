import { afterEach, expect, test, vi } from "vitest";
import { deploySite, deleteSite, waitUntilLive, deployProject } from "../src/deploy";

const ok = () =>
  new Response("hi", { status: 200, headers: { "content-type": "text/html" } });

const env = {
  CF_ACCOUNT_ID: "acct1",
  ZONE_ID: "zone1",
  SITE_ZONE: "clydeford.net",
  CF_API_TOKEN: "tok",
} as any;

afterEach(() => vi.restoreAllMocks());

test("uploads script then attaches domain, returns url", async () => {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init: any) => {
      calls.push({ url: String(input), method: init?.method });
      return new Response(JSON.stringify({ success: true, result: {} }), {
        headers: { "content-type": "application/json" },
      });
    }),
  );

  const url = await deploySite(
    env,
    "mysite",
    "export default {fetch(){return new Response('hi')}}",
  );

  expect(url).toBe("https://mysite.clydeford.net");
  expect(calls[0].url).toContain("/accounts/acct1/workers/scripts/mysite");
  expect(calls[0].method).toBe("PUT");
  expect(calls[1].url).toContain("/accounts/acct1/workers/domains");
});

test("injects ANTHROPIC_API_KEY as a secret binding into the deployed worker", async () => {
  let metadataText = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init: any) => {
      const url = String(input);
      if (init?.method === "PUT" && url.includes("/workers/scripts/")) {
        metadataText = await (init.body.get("metadata") as Blob).text();
      }
      return new Response(JSON.stringify({ success: true, result: {} }), {
        headers: { "content-type": "application/json" },
      });
    }),
  );

  await deploySite(
    { ...env, ANTHROPIC_API_KEY: "sk-test-123" } as any,
    "aibot",
    "export default {}",
  );

  const meta = JSON.parse(metadataText);
  const binding = (meta.bindings || []).find((b: any) => b.name === "ANTHROPIC_API_KEY");
  expect(binding).toBeTruthy();
  expect(binding.type).toBe("secret_text");
  expect(binding.text).toBe("sk-test-123");
});

test("deleteSite removes the custom domain then the worker script", async () => {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init: any) => {
      const url = String(input);
      calls.push({ url, method: init?.method });
      // GET domains lookup returns one matching domain.
      if (init?.method === "GET" && url.includes("/workers/domains")) {
        return new Response(
          JSON.stringify({ success: true, result: [{ id: "dom1", hostname: "mysite.clydeford.net" }] }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ success: true, result: {} }), {
        headers: { "content-type": "application/json" },
      });
    }),
  );

  await deleteSite(env, "mysite");

  // Looks up the domain, deletes it by id, then deletes the script.
  expect(calls.some((c) => c.method === "GET" && c.url.includes("/workers/domains"))).toBe(true);
  expect(
    calls.some((c) => c.method === "DELETE" && c.url.includes("/workers/domains/dom1")),
  ).toBe(true);
  expect(
    calls.some((c) => c.method === "DELETE" && c.url.includes("/workers/scripts/mysite")),
  ).toBe(true);
});

test("throws with Cloudflare error message on failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({ success: false, errors: [{ message: "Uncaught SyntaxError" }] }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    ),
  );
  await expect(deploySite(env, "mysite", "bad code")).rejects.toThrow("Uncaught SyntaxError");
});

test("waitUntilLive returns true on first hit and never reports pending", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ok()));
  const onPending = vi.fn();
  const live = await waitUntilLive("https://mysite.clydeford.net", { onPending });
  expect(live).toBe(true);
  expect(onPending).not.toHaveBeenCalled();
});

test("waitUntilLive reports pending, then returns true once the cert comes up", async () => {
  let n = 0;
  // First two probes fail the TLS handshake (throw), third succeeds.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (n++ < 2) throw new Error("TLS handshake failed");
      return ok();
    }),
  );
  const onPending = vi.fn();
  const live = await waitUntilLive("https://mysite.clydeford.net", {
    intervalMs: 1,
    onPending,
  });
  expect(live).toBe(true);
  expect(onPending).toHaveBeenCalledTimes(1); // fired once, after the first miss
});

test("waitUntilLive gives up after the budget and reports it never came live", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("TLS handshake failed"); }));
  const onPending = vi.fn();
  const live = await waitUntilLive("https://mysite.clydeford.net", {
    budgetMs: 12,
    intervalMs: 4,
    onPending,
  });
  expect(live).toBe(false);
  expect(onPending).toHaveBeenCalledTimes(1);
});

test("waitUntilLive keeps waiting on Cloudflare SSL 5xx errors (521-526)", async () => {
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (n++ < 1) return new Response("ssl handshake failed", { status: 525 });
      return ok();
    }),
  );
  const live = await waitUntilLive("https://mysite.clydeford.net", { intervalMs: 1 });
  expect(live).toBe(true);
});

test("deployProject uploads assets, PUTs script with assets binding, attaches domain", async () => {
  const calls: { url: string; method: string; metadata?: any }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any, init: any) => {
    const url = String(input);
    const rec: any = { url, method: init?.method };
    calls.push(rec); // record every call, including the assets-upload-session
    if (url.includes("/assets-upload-session"))
      return new Response(JSON.stringify({ success: true, result: { jwt: "J", buckets: [] } }),
        { headers: { "content-type": "application/json" } });
    if (init?.method === "PUT" && url.includes("/workers/scripts/mysite")) {
      rec.metadata = JSON.parse(await (init.body.get("metadata") as Blob).text());
    }
    return new Response(JSON.stringify({ success: true, result: {} }),
      { headers: { "content-type": "application/json" } });
  }));

  const url = await deployProject(
    env, "mysite",
    "export default { fetch(req, env) { return env.ASSETS.fetch(req); } }",
    [{ path: "/index.html", contentBase64: btoa("<h1>hi</h1>"), contentType: "text/html" }],
  );

  expect(url).toBe("https://mysite.clydeford.net");
  expect(calls.some((c) => c.url.includes("/assets-upload-session"))).toBe(true); // upload step ran
  const put = calls.find((c) => c.method === "PUT" && c.url.includes("/workers/scripts/mysite"));
  expect(put?.metadata.assets.jwt).toBe("J");
  expect(put?.metadata.assets.config.not_found_handling).toBe("single-page-application");
  expect(put?.metadata.bindings.some((b: any) => b.type === "assets" && b.name === "ASSETS")).toBe(true);
  expect(calls.some((c) => c.url.includes("/workers/domains"))).toBe(true);
});

test("deployProject injects ANTHROPIC_API_KEY as a secret binding alongside ASSETS", async () => {
  let metadata: any = null;
  vi.stubGlobal("fetch", vi.fn(async (input: any, init: any) => {
    const url = String(input);
    if (url.includes("/assets-upload-session"))
      return new Response(JSON.stringify({ success: true, result: { jwt: "J", buckets: [] } }),
        { headers: { "content-type": "application/json" } });
    if (init?.method === "PUT" && url.includes("/workers/scripts/"))
      metadata = JSON.parse(await (init.body.get("metadata") as Blob).text());
    return new Response(JSON.stringify({ success: true, result: {} }),
      { headers: { "content-type": "application/json" } });
  }));

  await deployProject(
    { ...env, ANTHROPIC_API_KEY: "sk-test-123" } as any,
    "aibot",
    "export default { fetch(req, env) { return env.ASSETS.fetch(req); } }",
    [{ path: "/index.html", contentBase64: btoa("<h1>hi</h1>"), contentType: "text/html" }],
  );

  const secret = (metadata.bindings || []).find((b: any) => b.name === "ANTHROPIC_API_KEY");
  expect(secret).toBeTruthy();
  expect(secret.type).toBe("secret_text");
  expect(secret.text).toBe("sk-test-123");
  // ASSETS binding still present too.
  expect(metadata.bindings.some((b: any) => b.type === "assets" && b.name === "ASSETS")).toBe(true);
});
