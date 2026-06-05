import { SELF, env, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { SiteSession } from "../src/session";

async function login(): Promise<string> {
  const res = await SELF.fetch("https://builder.clydeford.net/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "password=test-pass",
    redirect: "manual",
  });
  return res.headers.get("set-cookie")!.split(";")[0];
}

test("unauthed root redirects to login", async () => {
  const res = await SELF.fetch("https://builder.clydeford.net/", { redirect: "manual" });
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/login");
});

test("login then create + list site", async () => {
  const cookie = await login();
  const create = await SELF.fetch("https://builder.clydeford.net/api/sites", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Test Site" }),
  });
  expect(create.status).toBe(200);
  const rec = await create.json<any>();
  expect(rec.name).toBe("test-site");

  const list = await SELF.fetch("https://builder.clydeford.net/api/sites", {
    headers: { cookie },
  });
  const sites = await list.json<any[]>();
  expect(sites.some((s) => s.name === "test-site")).toBe(true);
});

test("history returns the DO's stored messages", async () => {
  const cookie = await login();
  await SELF.fetch("https://builder.clydeford.net/api/sites", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "hist-site" }),
  });

  // Seed the site's Durable Object with a prior conversation.
  const stub = env.SITE_SESSION.get(env.SITE_SESSION.idFromName("hist-site"));
  await runInDurableObject(stub, async (_i: SiteSession, ctx) => {
    await ctx.storage.put("messages", [
      { role: "user", content: "make a landing page" },
      { role: "assistant", content: "(deployed)" },
    ]);
  });

  const res = await SELF.fetch(
    "https://builder.clydeford.net/api/sites/hist-site/history",
    { headers: { cookie } },
  );
  expect(res.status).toBe(200);
  const { messages } = await res.json<any>();
  expect(messages).toHaveLength(2);
  expect(messages[0]).toEqual({ role: "user", content: "make a landing page" });
  expect(messages[1].content).toBe("(deployed)");
});

test("history is empty for a site that was never chatted", async () => {
  const cookie = await login();
  const res = await SELF.fetch(
    "https://builder.clydeford.net/api/sites/never-chatted/history",
    { headers: { cookie } },
  );
  expect(res.status).toBe(200);
  const { messages } = await res.json<any>();
  expect(messages).toEqual([]);
});

test("history requires auth", async () => {
  const res = await SELF.fetch(
    "https://builder.clydeford.net/api/sites/hist-site/history",
  );
  expect(res.status).toBe(401);
});

test("rejects reserved name", async () => {
  const cookie = await login();
  const res = await SELF.fetch("https://builder.clydeford.net/api/sites", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "builder" }),
  });
  expect(res.status).toBe(400);
});
