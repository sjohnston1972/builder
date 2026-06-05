import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE || "https://builder.clydeford.net";
const PASS = process.env.APP_PASSWORD;
mkdirSync("shots", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill("#p", PASS);
await page.click("button[type=submit]");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);

// Enter chat view by selecting the first site.
await page.click("#sitesBtn");
await page.waitForTimeout(150);
await page.click("#siteList .site");
await page.waitForTimeout(900);

const m = await page.evaluate(() => {
  const r = {};
  r.innerH = window.innerHeight;
  r.innerW = window.innerWidth;
  r.bodyScrollH = document.body.scrollHeight;
  r.docScrollH = document.documentElement.scrollHeight;
  r.bodyScrollW = document.body.scrollWidth;
  r.docScrollW = document.documentElement.scrollWidth;
  // any element taller/wider than viewport?
  const tall = [];
  document.querySelectorAll("*").forEach((el) => {
    const b = el.getBoundingClientRect();
    if (b.bottom > window.innerHeight + 2 || b.right > window.innerWidth + 2) {
      tall.push({ tag: el.tagName, id: el.id, cls: el.className && el.className.toString().slice(0,30),
        bottom: Math.round(b.bottom), right: Math.round(b.right), h: Math.round(b.height), w: Math.round(b.width) });
    }
  });
  r.overflowing = tall.slice(0, 20);
  return r;
});
console.log(JSON.stringify(m, null, 2));

await page.screenshot({ path: "shots/mobile-chat-full.png", fullPage: true });
console.log("wrote shots/mobile-chat-full.png");
await browser.close();
