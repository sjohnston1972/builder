import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = "https://builder.clydeford.net";
const PASS = process.env.APP_PASSWORD;
mkdirSync("shots", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 800 } });
const page = await ctx.newPage();

await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill("#p", PASS);
await page.click("button[type=submit]");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);

// Simulate a build that is still running, then completes, by intercepting the
// history endpoint: first 2 calls report "building", then "idle" with the result.
let calls = 0;
await page.route("**/api/sites/*/history", (route) => {
  calls++;
  const building = calls <= 2;
  const messages = [{ role: "user", content: "make the hero blue" }];
  if (!building) messages.push({ role: "assistant", content: "Done — the hero is now blue and redeployed." });
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ messages, status: building ? "building" : "idle", url: "https://demo.clydeford.net" }),
  });
});

// Open a site → loadHistory should see "building" and show the finishing state.
await page.click("#sitesBtn");
await page.waitForTimeout(150);
await page.click("#siteList .site");
await page.waitForTimeout(600);
const buildingShown = await page.locator("#chat").innerText();
console.log("after select (call", calls, "):", JSON.stringify(buildingShown).slice(0, 140));
await page.locator("main").screenshot({ path: "shots/recovery-building.png" });

// Polls every 2.5s; after 2 building responses it flips to idle.
await page.waitForTimeout(6500);
const finalText = await page.locator("#chat").innerText();
const inputDisabled = await page.locator("#input").isDisabled();
console.log("final calls:", calls, "inputDisabled:", inputDisabled);
console.log("final chat:", JSON.stringify(finalText).slice(0, 200));
await page.locator("main").screenshot({ path: "shots/recovery-finished.png" });

await browser.close();
