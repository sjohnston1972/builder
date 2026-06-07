// Forge markdown.clydeford.net through the REAL chat UI (as a human would),
// verify the chat history persists, and functionally test the live editor.
// Leaves the site live. Usage: APP_PASSWORD=... node scripts/forge-markdown.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "https://builder.clydeford.net";
const PASS = process.env.APP_PASSWORD;
const NAME = "markdown";
const OUT = "shots";
mkdirSync(OUT, { recursive: true });
if (!PASS) { console.error("APP_PASSWORD not set"); process.exit(2); }

const BRIEF =
  "Build a Markdown editor called 'Markdown Studio'. Layout: a <textarea> on the left where I type " +
  "Markdown, and a live preview on the right that renders it using the react-markdown npm package " +
  "(with remark-gfm). Support headings, bold, italic, lists, links, and inline code. " +
  "Use React + Vite + Tailwind as a real multi-file project with a build step.";

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const pass = [], fail = [];
const check = (name, ok, detail = "") => { (ok ? pass : fail).push(name + (detail ? ` — ${detail}` : "")); log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1320, height: 900 } });
const page = await ctx.newPage();

try {
  // --- Login ---
  log("login " + BASE);
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#p", PASS);
  await page.click("button[type=submit]");
  await page.waitForLoadState("networkidle");
  check("login", await page.locator("#name").count() > 0);

  // --- Clean slate: remove any prior 'markdown' site (the earlier failed forge) ---
  const delStatus = await page.evaluate(async (n) => (await fetch("/api/sites/" + n, { method: "DELETE" })).status, NAME);
  log(`pre-clean DELETE /api/sites/${NAME} -> ${delStatus}`);
  await page.reload({ waitUntil: "networkidle" });

  // --- Forge via the chat UI, exactly as a human: name + brief, click "Forge it" ---
  log(`forging ${NAME}.clydeford.net via the UI`);
  await page.fill("#name", NAME);
  await page.fill("#spec", BRIEF);
  await page.click("#createBtn");

  // The user's brief should appear immediately as a chat bubble (human-driven turn).
  await page.waitForTimeout(1500);
  const briefShown = (await page.locator("#chat").innerText().catch(() => "")).includes("Markdown Studio");
  check("brief posted to chat", briefShown);

  // --- Watch the build, capture the streaming build-log, wait for completion ---
  let sawBuildLog = false, outcome = null, failText = "";
  const deadline = Date.now() + 420_000;
  while (Date.now() < deadline) {
    if (!sawBuildLog && (await page.locator(".buildlog").count())) {
      sawBuildLog = true;
      log("build log streaming (container path engaged)");
      await page.locator("main").screenshot({ path: `${OUT}/md-building.png` }).catch(() => {});
    }
    if (await page.locator(".buildlog.fail").count()) {
      outcome = "failed";
      failText = await page.locator(".buildlog.fail").innerText().catch(() => "");
      break;
    }
    const hist = await page.evaluate(async (n) => {
      try { return await (await fetch("/api/sites/" + n + "/history")).json(); } catch { return null; }
    }, NAME);
    if (hist && hist.status === "idle" && hist.url) { outcome = "live"; break; }
    await page.waitForTimeout(3000);
  }
  check("container build path engaged (build-log streamed)", sawBuildLog);
  check("build completed without failure", outcome === "live", outcome === "failed" ? failText.slice(-300) : outcome ?? "timeout");
  if (outcome !== "live") throw new Error("build did not complete live: " + (failText || outcome));

  const url = `https://${NAME}.clydeford.net`;
  log("deployed: " + url);
  await page.screenshot({ path: `${OUT}/md-deployed.png` });

  // --- Verify chat history PERSISTS: reload, reselect the site, history loads from the DO ---
  log("verifying chat history persistence (reload + reselect)");
  await page.reload({ waitUntil: "networkidle" });
  // open sites list and click the 'markdown' row
  await page.click("#sitesBtn").catch(() => {});
  await page.waitForTimeout(400);
  const row = page.locator("#siteList .site", { hasText: NAME }).first();
  check("site appears in sites list after reload", await row.count() > 0);
  await row.click();
  await page.waitForTimeout(1500);
  const chatText = await page.locator("#chat").innerText().catch(() => "");
  check("history persisted: user brief present after reload", /Markdown Studio/.test(chatText));
  check("history persisted: forge assistant reply present", (await page.locator("#chat .msg.bot .bub").count()) > 0);
  check("history persisted: deploy marker present", /deployed/i.test(chatText));
  await page.locator("main").screenshot({ path: `${OUT}/md-chat-history.png` }).catch(() => {});

  // --- Functionally test the LIVE editor with Playwright (proves react-markdown works in the bundle) ---
  log("opening live site + functional editor test");
  const site = await ctx.newPage();
  let reachable = false;
  for (let i = 0; i < 24; i++) {
    try { const r = await site.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 }); if (r && r.status() < 500) { reachable = true; break; } }
    catch { /* SSL provisioning */ }
    await site.waitForTimeout(5000);
  }
  check("live site reachable (200, TLS ready)", reachable);

  const ta = site.locator("textarea").first();
  check("editor has a textarea input", await ta.count() > 0);
  if (await ta.count()) {
    const md = "# HeadingTest\n\n**BoldText** and *ItalicText*\n\n- listitem-one\n- listitem-two\n\n`codeword`\n\n[alink](https://example.com)";
    await ta.fill(md);
    await site.waitForTimeout(800);
    check("preview renders heading (react-markdown live)", await site.locator("h1", { hasText: "HeadingTest" }).count() > 0);
    check("preview renders bold", await site.locator("strong", { hasText: "BoldText" }).count() > 0);
    check("preview renders italic", await site.locator("em", { hasText: "ItalicText" }).count() > 0);
    check("preview renders list item", await site.locator("li", { hasText: "listitem-one" }).count() > 0);
    check("preview renders inline code", await site.locator("code", { hasText: "codeword" }).count() > 0);
    check("preview renders link", await site.locator("a", { hasText: "alink" }).count() > 0);
  }
  await site.screenshot({ path: `${OUT}/md-live.png`, fullPage: true }).catch(() => {});

} catch (e) {
  fail.push("EXCEPTION: " + e.message);
  log("ERROR: " + e.message);
  await page.screenshot({ path: `${OUT}/md-error.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

console.log("\n===== TEST PLAN RESULTS =====");
console.log(`PASSED (${pass.length}):`); pass.forEach((p) => console.log("  ✓ " + p));
console.log(`FAILED (${fail.length}):`); fail.forEach((f) => console.log("  ✗ " + f));
console.log(`\nSite left LIVE at https://${NAME}.clydeford.net`);
process.exit(fail.length ? 1 : 0);
