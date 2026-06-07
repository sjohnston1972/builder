// Repro the mobile "background mid-build, return" flow and observe whether the
// chat UI recovers or stays stuck on "finishing your build".
// Usage: APP_PASSWORD=... node scripts/diag-mobile-recover.mjs
import { chromium } from "playwright";
const BASE = process.env.BASE || "https://builder.clydeford.net";
const PASS = process.env.APP_PASSWORD;
const NAME = process.env.SITE || "markdown";
if (!PASS) { console.error("APP_PASSWORD not set"); process.exit(2); }
const t0 = Date.now(); const el = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
const log = (m) => console.log(`[${el()}] ${m}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 820 } });
const page = await ctx.newPage();
page.on("console", (m) => { const t = m.text(); if (/recover|poll|building|stream|history/i.test(t)) log("console: " + t); });

const snap = async () => {
  return await page.evaluate(() => {
    const chat = document.getElementById("chat");
    const txt = chat ? chat.innerText.replace(/\s+/g, " ").trim() : "";
    return {
      pill: (document.getElementById("pillTxt") || {}).textContent,
      finishing: /finishing your build/i.test(txt),
      buildFinished: /build finished/i.test(txt),
      stillBuilding: /still building/i.test(txt),
      live: /your site is live|your site is almost live/i.test(txt),
      tail: txt.slice(-160),
    };
  });
};

try {
  log("login (mobile viewport)");
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#p", PASS); await page.click("button[type=submit]"); await page.waitForLoadState("networkidle");
  // open sites list, select the existing site
  await page.click("#sitesBtn").catch(() => {});
  await page.waitForTimeout(400);
  await page.locator("#siteList .site", { hasText: NAME }).first().click();
  await page.waitForTimeout(1200);
  log("selected " + NAME);

  // send a change via the composer, like a human
  await page.fill("#input", "Small change: give the page a subtle light-gray background.");
  await page.click("#send");
  log("change submitted");

  // wait until build is underway
  for (let i = 0; i < 40; i++) { if (await page.locator(".buildlog,.deploy").count()) break; await page.waitForTimeout(1000); }
  log("build underway: " + JSON.stringify(await snap()));

  // ---- simulate mobile background ----
  log(">>> backgrounding: visibility hidden + offline (radio off)");
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await ctx.setOffline(true);
  await page.waitForTimeout(12000); // server keeps building while we're "away"

  // ---- simulate return ----
  log(">>> returning: online + visibility visible");
  await ctx.setOffline(false);
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));

  // ---- observe whether it recovers ----
  let resolved = false;
  for (let i = 0; i < 80; i++) { // up to ~4 min
    await page.waitForTimeout(3000);
    const s = await snap();
    if (i % 3 === 0 || s.live || s.buildFinished) log("state: " + JSON.stringify(s));
    if (s.live || s.buildFinished || s.pill === "live" || s.pill === "ready") { resolved = true; log("✅ RECOVERED"); break; }
  }
  if (!resolved) log("❌ STUCK — never recovered (final: " + JSON.stringify(await snap()) + ")");
} catch (e) { log("ERROR " + e.message); }
finally { await browser.close(); }
