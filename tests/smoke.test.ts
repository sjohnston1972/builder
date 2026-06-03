import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";

test("worker responds", async () => {
  const res = await SELF.fetch("https://builder.clydeford.net/healthz");
  expect(res.status).toBe(200);
});
