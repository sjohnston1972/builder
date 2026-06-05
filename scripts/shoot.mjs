import { chromium } from "playwright";

const BASE = process.env.BASE || "https://builder.clydeford.net";
const OUT = process.argv[2] || "shots";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function shot(name, { width, height, path, cookie }) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  if (cookie) {
    await ctx.addCookies([{ name: "builder_session", value: cookie, domain: new URL(BASE).hostname, path: "/" }]);
  }
  const page = await ctx.newPage();
  await page.goto(BASE + (path || "/"), { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await ctx.close();
  console.log("wrote", `${OUT}/${name}.png`);
}

// Landing page = logged out (no cookie)
await shot("landing-desktop", { width: 1280, height: 860 });
await shot("landing-mobile", { width: 390, height: 844 });

await browser.close();
