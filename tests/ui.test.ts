import { expect, test } from "vitest";
import { loginPage, appPage } from "../src/ui";

test("login page has a password field", () => {
  expect(loginPage()).toContain('name="password"');
});
test("login page shows error when provided", () => {
  expect(loginPage("Wrong password")).toContain("Wrong password");
});
test("app page has chat + preview + new-site form", () => {
  const html = appPage();
  expect(html).toContain('id="chat"');
  expect(html).toContain('id="preview"');
  expect(html).toContain('id="new-site"');
});
test("appPage never auto-restores the last site on load (always lands on forge)", () => {
  const html = appPage();
  // The 'restore last site on reload' feature is gone: no recover-on-load helper,
  // and no forge_active persistence to drive it. A fresh visit must land on forge.
  expect(html).not.toContain("maybeRecoverOnLoad");
  expect(html).not.toContain("forge_active");
});
test("appPage handles framework build SSE events", () => {
  const html = appPage();
  expect(html).toContain("building_project");
  expect(html).toContain("build_log");
  expect(html).toContain("build_failed");
  expect(html).toContain("buildlog");
});
