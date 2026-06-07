// Deterministic repro: when the server stays "building" longer than the client's
// ~150s poll budget, does the UI recover when it finally flips to "idle"?
// Mocks /history (building until T, then idle) and drives reload-recovery.
// Usage: APP_PASSWORD=... node scripts/diag-poll-budget.mjs
import { chromium } from "playwright";
const BASE = process.env.BASE || "https://builder.clydeford.net";
const PASS = process.env.APP_PASSWORD;
const NAME = "markdown";
const BUILDING_MS = Number(process.env.BUILDING_MS || 175000); // > 150s client budget
if (!PASS) { console.error("APP_PASSWORD not set"); process.exit(2); }
const t0 = Date.now(); const el = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 820 } });
const page = await ctx.newPage();

// login (real) to get the session cookie
await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill("#p", PASS); await page.click("button[type=submit]"); await page.waitForLoadState("networkidle");

// mark this site as the last-open one so maybeRecoverOnLoad triggers on reload
await page.addInitScript((n) => { try { localStorage.setItem("forge_active", n); } catch (e) {} }, NAME);

// Mock the sites list + a history endpoint whose status is time-controlled.
let mockStart = 0, historyPolls = 0;
await page.route("**/api/sites", (r) => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify([{ name: NAME, url: `https://${NAME}.clydeford.net`, updatedAt: Date.now() }]) }));
await page.route("**/api/sites/" + NAME + "/history", (r) => {
  if (!mockStart) mockStart = Date.now();
  historyPolls++;
  const building = Date.now() - mockStart < BUILDING_MS;
  const messages = [{ role: "user", content: "make a change" }];
  if (!building) messages.push({ role: "assistant", content: "Done — change applied and redeployed." });
  r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ messages, status: building ? "building" : "idle", url: `https://${NAME}.clydeford.net` }) });
});

console.log(`[${el()}] reload -> recovery should start; server stays 'building' for ${BUILDING_MS / 1000}s`);
await page.reload({ waitUntil: "networkidle" });

let lastPollAt = 0, recovered = false, gaveUp = false;
const snap = async () => page.evaluate(() => {
  const t = (document.getElementById("chat") || {}).innerText || "";
  return { finishing: /finishing your build/i.test(t), tapRefresh: /tap a site again|still building/i.test(t),
           done: /build finished|Done — change applied|change applied and redeployed/i.test(t), pill: (document.getElementById("pillTxt") || {}).textContent };
});
for (let i = 0; i < 90; i++) { // ~4.5 min
  await page.waitForTimeout(3000);
  const s = await snap();
  if (historyPolls > lastPollAt) lastPollAt = historyPolls;
  if (i % 5 === 0) console.log(`[${el()}] polls=${historyPolls} ${JSON.stringify(s)}`);
  if (s.tapRefresh && Date.now() - mockStart < BUILDING_MS) { gaveUp = true; console.log(`[${el()}] ⚠️ client GAVE UP at ~${el()} while server still 'building' (polls=${historyPolls})`); }
  if (s.done) { recovered = true; console.log(`[${el()}] ✅ recovered with final result (polls=${historyPolls})`); break; }
}
console.log(`\nRESULT: recovered=${recovered} gaveUp=${gaveUp} totalPolls=${historyPolls}`);
console.log(recovered ? "PASS: UI recovered when server reached idle" : "FAIL: UI never showed the completed result (hung)");
await browser.close();
process.exit(recovered ? 0 : 1);
