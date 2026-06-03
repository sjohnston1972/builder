import { expect, test } from "vitest";
import { sanitizeName, isValidName } from "../src/names";

test("sanitizes to a valid dns/worker label", () => {
  expect(sanitizeName("My Cool Site!")).toBe("my-cool-site");
  expect(sanitizeName("  Hello__World  ")).toBe("hello-world");
  expect(sanitizeName("a.b.c")).toBe("a-b-c");
});

test("validates labels", () => {
  expect(isValidName("good-name")).toBe(true);
  expect(isValidName("builder")).toBe(false); // reserved
  expect(isValidName("")).toBe(false);
  expect(isValidName("-bad")).toBe(false);
  expect(isValidName("a".repeat(64))).toBe(false); // too long
  expect(isValidName("UPPER")).toBe(false);
});
