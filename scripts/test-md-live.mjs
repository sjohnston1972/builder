// Functional test of the LIVE markdown editor, bypassing the sandbox's stale DNS
// negative-cache via Chromium host-resolver-rules. Proves react-markdown renders live.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("shots", { recursive: true });
const URL = "https://markdown.clydeford.net";
const IP = process.env.MD_IP || "104.21.14.175";
const pass = [], fail = [];
const check = (n, ok) => { (ok ? pass : fail).push(n); console.log(`${ok ? "PASS" : "FAIL"}: ${n}`); };

const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP markdown.clydeford.net ${IP}`] });
const page = await browser.newPage();
try {
  const r = await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  check("live site 200/TLS", !!r && r.status() === 200);
  check("title 'Markdown Studio' present", /Markdown Studio/i.test(await page.content()));
  const ta = page.locator("textarea").first();
  check("editor textarea exists", await ta.count() > 0);
  if (await ta.count()) {
    await ta.fill("# HeadingTest\n\n**BoldText** and *ItalicText*\n\n- listitem-one\n- listitem-two\n\n`codeword`\n\n[alink](https://example.com)");
    await page.waitForTimeout(900);
    check("preview: heading (react-markdown live)", await page.locator("h1", { hasText: "HeadingTest" }).count() > 0);
    check("preview: bold", await page.locator("strong", { hasText: "BoldText" }).count() > 0);
    check("preview: italic", await page.locator("em", { hasText: "ItalicText" }).count() > 0);
    check("preview: list item", await page.locator("li", { hasText: "listitem-one" }).count() > 0);
    check("preview: inline code", await page.locator("code", { hasText: "codeword" }).count() > 0);
    check("preview: link", await page.locator("a", { hasText: "alink" }).count() > 0);
  }
  await page.screenshot({ path: "shots/md-live.png", fullPage: true });
} catch (e) { fail.push("EXCEPTION: " + e.message); console.log("ERROR:", e.message); await page.screenshot({ path: "shots/md-live-error.png" }).catch(() => {}); }
finally { await browser.close(); }
console.log(`\nLIVE EDITOR: ${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
