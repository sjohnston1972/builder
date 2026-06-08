import { env, runInDurableObject } from "cloudflare:test";
import { expect, test, describe } from "vitest";
import type { LogEntry } from "../src/logstore";

// Drive the singleton LogStore DO directly.
function store() {
  const id = env.LOG_STORE.idFromName("global");
  return env.LOG_STORE.get(id);
}

async function append(stub: any, e: Partial<LogEntry>) {
  await stub.append({
    ts: e.ts ?? 1,
    site: e.site ?? "demo",
    level: e.level ?? "info",
    stage: e.stage ?? "turn",
    msg: e.msg ?? "hello",
  });
}

describe("LogStore", () => {
  test("append then query returns entries newest-first", async () => {
    const s = store();
    await append(s, { ts: 100, site: "alpha", msg: "first" });
    await append(s, { ts: 200, site: "alpha", msg: "second" });
    const out = await s.query({ site: "alpha" });
    expect(out.map((e: LogEntry) => e.msg)).toEqual(["second", "first"]);
  });

  test("filters by site, level and free-text query", async () => {
    const s = store();
    await append(s, { ts: 300, site: "beta", level: "error", stage: "build", msg: "npm OOM killed" });
    await append(s, { ts: 301, site: "beta", level: "info", stage: "deploy", msg: "deployed ok" });
    await append(s, { ts: 302, site: "gamma", level: "error", stage: "build", msg: "syntax error" });

    expect((await s.query({ site: "beta" })).length).toBe(2);
    expect((await s.query({ site: "beta", level: "error" })).map((e: LogEntry) => e.msg)).toEqual(["npm OOM killed"]);
    // free-text matches across msg/stage/site, case-insensitive
    const oom = await s.query({ q: "oom" });
    expect(oom.map((e: LogEntry) => e.msg)).toEqual(["npm OOM killed"]);
    expect((await s.query({ q: "ERROR" })).some((e: LogEntry) => e.site === "gamma")).toBe(true);
  });

  test("ring-buffers: never keeps more than the cap, dropping oldest", async () => {
    const id = env.LOG_STORE.idFromName("cap-test");
    const s = env.LOG_STORE.get(id);
    for (let i = 0; i < 650; i++) await append(s, { ts: 1000 + i, site: "cap", msg: "m" + i });
    const all = await s.query({ site: "cap", limit: 5000 });
    expect(all.length).toBeLessThanOrEqual(600);
    // newest survived, oldest dropped
    expect(all[0].msg).toBe("m649");
    expect(all.some((e: LogEntry) => e.msg === "m0")).toBe(false);
  });
});
