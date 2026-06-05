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

// Open a chat surface: select the first site so #chat is active.
await page.evaluate(() => {
  document.getElementById("welcome")?.remove();
  document.body.classList.add("show-chat");
});

// 1) Building state: spinner + a cycling verb.
await page.evaluate(() => {
  const chat = document.getElementById("chat");
  const d = document.createElement("div");
  d.className = "deploy";
  d.innerHTML = '<span class="spin"></span> <span class="verb">Shipping to the edge…</span>';
  chat.appendChild(d);
});
await page.locator("main").screenshot({ path: `${OUT}/build-spinner.png` });
console.log("wrote build-spinner.png");

// 2) Announcement card + confetti.
await page.evaluate(() => {
  const chat = document.getElementById("chat");
  chat.querySelector(".deploy")?.remove();
  const a = document.createElement("div");
  a.className = "announce";
  a.innerHTML = '<span class="spark">✦</span><div class="body"><div class="title">Your site is live</div>'
    + '<div class="url">my-cafe.clydeford.net</div></div>'
    + '<a class="open" href="#" target="_blank">Open ↗</a>';
  chat.appendChild(a);
  // confetti burst
  const colors = ['#ff8a3d','#ffd6a0','#7ee0a8','#e9e5db'];
  const box = document.createElement('div'); box.className = 'confetti';
  for (let i=0;i<26;i++){ const p=document.createElement('i');
    p.style.background=colors[i%colors.length];
    p.style.setProperty('--x',((Math.random()*2-1)*260)+'px');
    p.style.setProperty('--y',((Math.random()*2-1)*220-40)+'px');
    p.style.setProperty('--r',(Math.random()*540-270)+'deg');
    box.appendChild(p); }
  document.body.appendChild(box);
});
// Capture mid-confetti.
await page.waitForTimeout(280);
await page.screenshot({ path: `${OUT}/build-announce.png`, fullPage: false });
console.log("wrote build-announce.png");

await browser.close();
