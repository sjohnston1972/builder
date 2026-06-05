import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "https://builder.clydeford.net";
const PASS = process.env.APP_PASSWORD;
const OUT = "shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await ctx.newPage();
await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill("#p", PASS);
await page.click("button[type=submit]");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400); // let sites load

await page.screenshot({ path: `${OUT}/sites-closed.png`, fullPage: false });
console.log("wrote sites-closed.png");

await page.click("#sitesBtn");
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/sites-open.png`, fullPage: false });
console.log("wrote sites-open.png");

await browser.close();
