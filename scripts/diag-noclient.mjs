// Decisive test (no observer effect): start a build, fully disconnect, then make
// ZERO requests to the DO for a long quiet period, and check status only ONCE.
// If status is still "building" after the quiet period, the server abandoned the
// build when the client left (DO not kept alive) — the real root cause.
// Usage: APP_PASSWORD=... node scripts/diag-noclient.mjs
const BASE = process.env.BASE || "https://builder.clydeford.net";
const PASS = process.env.APP_PASSWORD;
const NAME = process.env.SITE || "markdown";
const QUIET_MS = Number(process.env.QUIET_MS || 150000); // silent window with NO DO requests
if (!PASS) { console.error("APP_PASSWORD not set"); process.exit(2); }
const t0 = Date.now(); const el = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";

const login = await fetch(BASE + "/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: "password=" + encodeURIComponent(PASS), redirect: "manual" });
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
if (!cookie.startsWith("builder_session=")) { console.error("login failed", login.status); process.exit(1); }
console.log(`[${el()}] logged in`);

// Send a modify; abort as soon as the build is underway, then send NOTHING further.
const abort = new AbortController();
let disconnected = false;
try {
  const res = await fetch(`${BASE}/api/sites/${NAME}/chat`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ message: "Small tweak: add a thin top border to the header." }),
    signal: abort.signal,
  });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i).split("\n").find(l => l.startsWith("data:")); buf = buf.slice(i + 2);
      if (!line) continue; let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (["building_project", "build_log", "deploying"].includes(ev.type)) {
        console.log(`[${el()}] build underway (${ev.type}) -> FULL DISCONNECT, going silent for ${QUIET_MS / 1000}s (no DO requests)`);
        disconnected = true; abort.abort(); break;
      }
    }
    if (disconnected) break;
  }
} catch (e) { if (e.name !== "AbortError") console.log(`[${el()}] stream err ${e.message}`); }

if (!disconnected) { console.log("never saw build start; aborting test"); process.exit(2); }

// QUIET: absolutely no requests to the DO during this window.
await new Promise(r => setTimeout(r, QUIET_MS));

// Single check.
const h = await fetch(`${BASE}/api/sites/${NAME}/history`, { headers: { cookie } }).then(r => r.json());
console.log(`[${el()}] single check after silence: status=${h.status} msgs=${h.messages?.length}`);
if (h.status === "idle") console.log("✅ server COMPLETED with no client present — build survives full disconnect");
else console.log("❌ status still 'building' after silence — server ABANDONED the build when the client left (ROOT CAUSE)");
