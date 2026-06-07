// Faithful repro of the user's case: modify an EXISTING site, then "navigate away
// and return" (reload mid-build = dead stream + recover-from-history), observe.
// Usage: APP_PASSWORD=... node scripts/diag-modify-navaway.mjs
import { chromium } from "playwright";
const BASE = process.env.BASE || "https://builder.clydeford.net";
const PASS = process.env.APP_PASSWORD;
const NAME = process.env.SITE || "markdown";
if (!PASS) { console.error("APP_PASSWORD not set"); process.exit(2); }
const t0 = Date.now(); const el = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";
const log = (m) => console.log(`[${el()}] ${m}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 820 } });
const page = await ctx.newPage();
const snap = () => page.evaluate(() => ({
  finishing: /finishing your build/i.test((document.getElementById("chat") || {}).innerText || ""),
  inputDisabled: !!(document.getElementById("input") || {}).disabled,
  pill: (document.getElementById("pillTxt") || {}).textContent,
  title: (document.getElementById("hTitle") || {}).textContent,
}));

try {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#p", PASS); await page.click("button[type=submit]"); await page.waitForLoadState("networkidle");
  await page.click("#sitesBtn").catch(() => {});
  await page.waitForTimeout(400);
  await page.locator("#siteList .site", { hasText: NAME }).first().click();
  await page.waitForTimeout(1200);
  log("selected " + NAME + "; sending a modify");
  await page.fill("#input", "Tiny tweak: add a small footer that says 'updated'.");
  await page.click("#send");

  // wait until the build is underway
  for (let i = 0; i < 60; i++) { if (await page.locator(".buildlog,.deploy").count()) break; await page.waitForTimeout(1000); }
  log("build underway: " + JSON.stringify(await snap()));

  // ---- navigate away + return: reload mid-build (kills the SSE; forces recovery) ----
  log(">>> RELOAD (simulating return to a reloaded/backgrounded tab)");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  log("after reload: " + JSON.stringify(await snap()));

  // ---- observe recovery ----
  // Success = back on the site with a usable composer and the turn resolved:
  // a site is active, input is enabled, and the pill reached ready/live (not stuck
  // on 'idle'+disabled = blank app, nor 'building' forever = old hang).
  let sawFinishing = false, recovered = false;
  for (let i = 0; i < 100; i++) { // up to ~5 min
    await page.waitForTimeout(3000);
    const s = await snap();
    if (s.finishing) sawFinishing = true;
    if (i % 4 === 0) log("state: " + JSON.stringify(s) + (sawFinishing ? " (sawFinishing)" : ""));
    const usable = !s.inputDisabled && s.title !== "No site selected" && (s.pill === "ready" || s.pill === "live");
    if (usable) { recovered = true; log(`✅ RECOVERED — usable (pill=${s.pill}, sawFinishing=${sawFinishing})`); break; }
  }
  if (!recovered) log("❌ STUCK (sawFinishing=" + sawFinishing + ", final: " + JSON.stringify(await snap()) + ")");
} catch (e) { log("ERROR " + e.message); }
finally { await browser.close(); }
