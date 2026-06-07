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
test("appPage handles framework build SSE events", () => {
  const html = appPage();
  expect(html).toContain("building_project");
  expect(html).toContain("build_log");
  expect(html).toContain("build_failed");
  expect(html).toContain("buildlog");
});
