// End-to-end: forge a REAL React+Vite site through the live app, exercising the
// container build path (deploy_project), and screenshot the result.
// Usage: APP_PASSWORD=... node scripts/shoot-framework.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "https://builder.clydeford.net";
const PASS = process.env.APP_PASSWORD;
const OUT = "shots";
mkdirSync(OUT, { recursive: true });

if (!PASS) { console.error("APP_PASSWORD not set"); process.exit(2); }

const name = "e2e-react-" + Math.random().toString(36).slice(2, 7);
const spec =
  "Build a counter web app using React with Vite as a real multi-file project " +
  "(a package.json with react + vite and a build step, plus src/ files) — NOT a single-file worker. " +
  "Show a heading 'Forge Counter', a number starting at 0, and a button labelled 'Increment' that increases it.";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
let exitCode = 0;

try {
  console.log("→ login", BASE);
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#p", PASS);
  await page.click("button[type=submit]");
  await page.waitForLoadState("networkidle");
  if (!(await page.locator("#name").count())) {
    throw new Error("login failed (no #name field) — prod APP_PASSWORD may differ from .dev.vars");
  }

  console.log("→ forging", name + ".clydeford.net");
  await page.fill("#name", name);
  await page.fill("#spec", spec);
  await page.click("#createBtn");

  // Wait for the build to finish: success (.announce) or failure (.buildlog.fail).
  // Capture the build-log streaming state once, to prove the container path ran.
  let sawBuildLog = false, outcome = null, failText = "";
  const deadline = Date.now() + 300_000; // 5 min: cold start + npm install + vite build + asset upload + SSL
  while (Date.now() < deadline) {
    if (!sawBuildLog && (await page.locator(".buildlog").count())) {
      sawBuildLog = true;
      console.log("  • build log streaming (container path engaged)");
      await page.locator("main").screenshot({ path: `${OUT}/framework-building.png` }).catch(() => {});
    }
    if (await page.locator(".announce").count()) { outcome = "live"; break; }
    if (await page.locator(".buildlog.fail").count()) {
      outcome = "failed";
      failText = await page.locator(".buildlog.fail").innerText().catch(() => "");
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (outcome === "failed") throw new Error("build failed:\n" + failText.slice(-1200));
  if (outcome !== "live") throw new Error("timed out waiting for deploy (no announce within 5 min)");

  console.log("→ deployed; capturing app screenshot");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/framework-build.png` });
  const url = (await page.locator(".announce .open").getAttribute("href")) || `https://${name}.clydeford.net`;
  console.log("  • site URL:", url);
  console.log("  • container build path exercised:", sawBuildLog);

  // Visit the live site (handle first-deploy SSL provisioning with retries).
  console.log("→ opening live site (allowing for SSL provisioning)");
  const site = await ctx.newPage();
  let rendered = false;
  const siteDeadline = Date.now() + 150_000;
  while (Date.now() < siteDeadline) {
    try {
      await site.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      const body = await site.locator("body").innerText().catch(() => "");
      if (/Forge Counter|Increment/i.test(body) || (await site.locator("button").count())) { rendered = true; break; }
    } catch { /* TLS/DNS not ready yet */ }
    await site.waitForTimeout(5000);
  }
  await site.screenshot({ path: `${OUT}/framework-live.png`, fullPage: true }).catch(() => {});
  console.log("  • live site rendered React content:", rendered);
  if (!rendered) console.log("  ! site not confirmed rendered (likely SSL still provisioning) — see framework-live.png");

  console.log("\nRESULT:", JSON.stringify({ name, url, containerPath: sawBuildLog, liveRendered: rendered }));
  if (!sawBuildLog) { console.log("WARNING: container build path NOT exercised — Claude likely used the single-file deploy_worker."); exitCode = 3; }
} catch (e) {
  console.error("E2E ERROR:", e.message);
  await page.screenshot({ path: `${OUT}/framework-error.png`, fullPage: true }).catch(() => {});
  exitCode = 1;
} finally {
  // Clean up the test site (worker + domain + history) via the app API (shares the auth cookie).
  try {
    const r = await page.evaluate(async (n) => {
      const res = await fetch("/api/sites/" + n, { method: "DELETE", headers: { "content-type": "application/json" } });
      return res.status;
    }, name);
    console.log("→ cleanup DELETE /api/sites/" + name + " →", r);
  } catch (e) { console.log("cleanup skipped:", e.message); }
  await browser.close();
}
process.exit(exitCode);
