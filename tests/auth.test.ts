import { expect, test } from "vitest";
import { signSession, verifySession, checkPassword } from "../src/auth";

const SECRET = "test-secret-0123456789";

test("round-trips a signed session", async () => {
  const token = await signSession(SECRET);
  expect(await verifySession(token, SECRET)).toBe(true);
});

test("rejects tampered or wrong-secret tokens", async () => {
  const token = await signSession(SECRET);
  expect(await verifySession(token + "x", SECRET)).toBe(false);
  expect(await verifySession(token, "other-secret")).toBe(false);
  expect(await verifySession("", SECRET)).toBe(false);
});

test("checkPassword compares constant-time-ish", () => {
  expect(checkPassword("hunter2", "hunter2")).toBe(true);
  expect(checkPassword("nope", "hunter2")).toBe(false);
});
