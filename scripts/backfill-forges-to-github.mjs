// One-time backfill: mirror every existing forge's current source to GitHub.
// The worker holds the GITHUB_TOKEN secret and does the actual commit; this script just
// logs in and hits POST /api/sites/<name>/backup for each forge. Re-runnable (idempotent).
//
//   node scripts/backfill-forges-to-github.mjs
//
// Auth: APP_PASSWORD is read from .env (prod password lives there, per project convention).
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "https://builder.clydeford.net";

function envVar(key) {
  if (process.env[key]) return process.env[key];
  const line = readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} not found in environment or .env`);
  return line.slice(key.length + 1).replace(/^["']|["']$/g, "").trim();
}

const PASS = envVar("APP_PASSWORD");

// Log in and capture the session cookie (login responds 302 + Set-Cookie).
const loginRes = await fetch(`${BASE}/login`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ password: PASS }),
  redirect: "manual",
});
const setCookie = loginRes.headers.get("set-cookie");
if (!setCookie) {
  console.error(`Login failed (HTTP ${loginRes.status}). Check APP_PASSWORD in .env.`);
  process.exit(1);
}
const cookie = setCookie.split(";")[0];

const sites = await (await fetch(`${BASE}/api/sites`, { headers: { cookie } })).json();
console.log(`Backing up ${sites.length} forge(s) to GitHub…\n`);

let ok = 0;
let failed = 0;
for (const s of sites.sort((a, b) => a.name.localeCompare(b.name))) {
  const res = await fetch(`${BASE}/api/sites/${s.name}/backup`, { method: "POST", headers: { cookie } });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.ok) {
    ok++;
    console.log(`  ✓ ${s.name.padEnd(24)} → ${body.repo} (${String(body.commit).slice(0, 7)})`);
  } else {
    failed++;
    console.log(`  ✗ ${s.name.padEnd(24)} → ${body.error || `HTTP ${res.status}`}`);
  }
}

console.log(`\nDone: ${ok} backed up, ${failed} failed.`);
process.exit(failed ? 1 : 0);
