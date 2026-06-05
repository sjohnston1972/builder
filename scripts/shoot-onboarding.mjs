import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "https://builder.clydeford.net";
const PASS = process.env.APP_PASSWORD;
const OUT = "shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 320, height: 600 } });
const page = await ctx.newPage();
await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill("#p", PASS);
await page.click("button[type=submit]");
await page.waitForLoadState("networkidle");

// Render STEP 1 onboarding state (what a first-time, zero-sites user sees).
await page.evaluate(() => {
  document.querySelector("#new-site .urlrow").classList.add("pulse-step");
  const h = document.getElementById("stepHint");
  h.classList.add("on");
  h.innerHTML = "Step <b>1</b> — name your site";
});
await page.locator("aside").screenshot({ path: `${OUT}/onboarding-step1.png` });
console.log("wrote onboarding-step1.png");

// Render STEP 2 (name filled, brief pulsing).
await page.evaluate(() => {
  document.querySelector("#new-site .urlrow").classList.remove("pulse-step");
  document.getElementById("name").value = "my-cafe";
  document.getElementById("spec").classList.add("pulse-step");
  const h = document.getElementById("stepHint");
  h.innerHTML = "Step <b>2</b> — describe what to build";
});
await page.locator("aside").screenshot({ path: `${OUT}/onboarding-step2.png` });
console.log("wrote onboarding-step2.png");

await browser.close();
