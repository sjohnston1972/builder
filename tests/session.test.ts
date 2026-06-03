import { env, runInDurableObject } from "cloudflare:test";
import { expect, test, vi, afterEach } from "vitest";
import type { SiteSession } from "../src/session";

// Mock the anthropic stream so the DO turn is deterministic.
vi.mock("../src/anthropic", () => ({
  async *streamTurn() {
    yield { type: "text", text: "Building your site. " };
    yield {
      type: "deploy",
      explanation: "init",
      script: "export default {fetch(){return new Response('hi')}}",
    };
  },
}));

afterEach(() => vi.restoreAllMocks());

test("turn streams text and deploys, persisting url", async () => {
  // Mock the Cloudflare deploy API calls.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ success: true, result: {} }), {
        headers: { "content-type": "application/json" },
      }),
    ),
  );

  const id = env.SITE_SESSION.idFromName("mysite");
  const stub = env.SITE_SESSION.get(id);

  const res = await stub.fetch("https://do/turn", {
    method: "POST",
    body: JSON.stringify({ name: "mysite", message: "make a hello site" }),
  });
  const text = await res.text();
  expect(text).toContain("Building your site");
  expect(text).toContain("mysite.clydeford.net");

  await runInDurableObject(stub, async (instance: SiteSession) => {
    const state = await instance.getState();
    expect(state.deployedUrl).toBe("https://mysite.clydeford.net");
    expect(state.messages.length).toBeGreaterThanOrEqual(2);
  });
});

test("clear() wipes all stored state", async () => {
  const id = env.SITE_SESSION.idFromName("wipe-me");
  const stub = env.SITE_SESSION.get(id);
  await runInDurableObject(stub, async (_i: SiteSession, ctx) => {
    await ctx.storage.put("messages", [{ role: "user", content: "hi" }]);
    await ctx.storage.put("url", "https://wipe-me.clydeford.net");
  });

  await stub.clear();

  await runInDurableObject(stub, async (instance: SiteSession) => {
    const s = await instance.getState();
    expect(s.messages.length).toBe(0);
    expect(s.deployedUrl).toBe(null);
    expect(s.currentScript).toBe(null);
  });
});
