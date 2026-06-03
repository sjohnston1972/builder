import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";

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

test("rejects reserved name", async () => {
  const cookie = await login();
  const res = await SELF.fetch("https://builder.clydeford.net/api/sites", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "builder" }),
  });
  expect(res.status).toBe(400);
});
