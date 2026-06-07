import { expect, test } from "vitest";
import { signSession, verifySession, checkPassword, checkAnyPassword } from "../src/auth";

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

test("checkAnyPassword accepts a match against any configured password", () => {
  expect(checkAnyPassword("frankiscool", ["primary", "frankiscool"])).toBe(true);
  expect(checkAnyPassword("primary", ["primary", "frankiscool"])).toBe(true);
  expect(checkAnyPassword("nope", ["primary", "frankiscool"])).toBe(false);
});

test("checkAnyPassword ignores unset/empty passwords (no blank-password bypass)", () => {
  expect(checkAnyPassword("", [undefined, ""])).toBe(false);
  expect(checkAnyPassword("", ["primary", undefined])).toBe(false);
  expect(checkAnyPassword("primary", ["primary", undefined, ""])).toBe(true);
});
