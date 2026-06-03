import { afterEach, expect, test, vi } from "vitest";
import { deploySite } from "../src/deploy";

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
