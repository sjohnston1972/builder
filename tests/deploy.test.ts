import { afterEach, expect, test, vi } from "vitest";
import { deploySite, deleteSite } from "../src/deploy";

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
