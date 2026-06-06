import { env, runInDurableObject } from "cloudflare:test";
import { expect, test, vi, afterEach, beforeEach } from "vitest";
import type { SiteSession } from "../src/session";

// Configurable mocks: each test sets what the turn yields and how runBuild behaves.
const turn: { events: any[] } = { events: [] };
vi.mock("../src/anthropic", () => ({
  async *streamTurn() { for (const e of turn.events) yield e; },
}));
vi.mock("../src/buildclient", () => ({ runBuild: vi.fn() }));
import { runBuild } from "../src/buildclient";

const okJson = () =>
  new Response(JSON.stringify({ success: true, result: {} }), { headers: { "content-type": "application/json" } });

beforeEach(() => {
  // Default: single-file deploy turn (used by the first test).
  turn.events = [
    { type: "text", text: "Building your site. " },
    { type: "deploy", explanation: "init", script: "export default {fetch(){return new Response('hi')}}" },
  ];
  (runBuild as any).mockReset();
});
afterEach(() => vi.restoreAllMocks());

async function runTurn(name: string, message: string): Promise<string> {
  const stub = env.SITE_SESSION.get(env.SITE_SESSION.idFromName(name));
  const res = await stub.fetch("https://do/turn", { method: "POST", body: JSON.stringify({ name, message }) });
  return res.text();
}

test("turn streams text and deploys (single-file path), persisting url", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => okJson()));
  const text = await runTurn("mysite", "make a hello site");
  expect(text).toContain("Building your site");
  expect(text).toContain("mysite.clydeford.net");
  const stub = env.SITE_SESSION.get(env.SITE_SESSION.idFromName("mysite"));
  await runInDurableObject(stub, async (instance: SiteSession) => {
    const state = await instance.getState();
    expect(state.deployedUrl).toBe("https://mysite.clydeford.net");
    expect(state.messages.length).toBeGreaterThanOrEqual(2);
  });
});

test("deploy_project builds in the container then deploys assets", async () => {
  turn.events = [
    { type: "text", text: "Building a React app. " },
    { type: "deploy_project", explanation: "init", files: [{ path: "package.json", content: "{}" }] },
  ];
  (runBuild as any).mockImplementation(async (_c: any, _req: any, onLog: (l: string) => void) => {
    onLog("npm install"); onLog("vite build");
    return { ok: true, assets: [{ path: "/index.html", contentBase64: btoa("<h1>hi</h1>"), contentType: "text/html" }] };
  });
  // Stub CF deploy calls (assets-upload-session, asset upload, script PUT, domain) + waitUntilLive probe → all success.
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = String(input);
    if (url.includes("/assets-upload-session"))
      return new Response(JSON.stringify({ success: true, result: { jwt: "J", buckets: [] } }), { headers: { "content-type": "application/json" } });
    return okJson(); // covers PUT script, domains, and the waitUntilLive GET (status 200 → live)
  }));

  const text = await runTurn("reactsite", "build a react app");
  expect(text).toContain("build_log");
  expect(text).toContain("deployed");
  const stub = env.SITE_SESSION.get(env.SITE_SESSION.idFromName("reactsite"));
  await runInDurableObject(stub, async (instance: SiteSession) => {
    const state = await instance.getState();
    expect(state.deployedUrl).toBe("https://reactsite.clydeford.net");
  });
});

test("deploy_project build failure does not deploy and reports build_failed", async () => {
  turn.events = [
    { type: "deploy_project", explanation: "init", files: [{ path: "package.json", content: "{}" }] },
  ];
  (runBuild as any).mockImplementation(async (_c: any, _req: any, onLog: (l: string) => void) => {
    onLog("npm ERR!");
    return { ok: false, error: "install failed (exit 1)" };
  });
  const fetchSpy = vi.fn(async () => okJson());
  vi.stubGlobal("fetch", fetchSpy);

  const text = await runTurn("failsite", "build a broken app");
  expect(text).toContain("build_failed");
  expect(text).toContain("install failed");
  // No deploy happened → deployedUrl stays null, and no CF script PUT was attempted.
  const stub = env.SITE_SESSION.get(env.SITE_SESSION.idFromName("failsite"));
  await runInDurableObject(stub, async (instance: SiteSession) => {
    const state = await instance.getState();
    expect(state.deployedUrl).toBe(null);
  });
  expect(fetchSpy.mock.calls.every((c) => !String((c as any[])[0]).includes("/workers/scripts/"))).toBe(true);
});

test("clear() wipes all stored state", async () => {
  const stub = env.SITE_SESSION.get(env.SITE_SESSION.idFromName("wipe-me"));
  await runInDurableObject(stub, async (_i: SiteSession, ctx) => {
    await ctx.storage.put("messages", [{ role: "user", content: "hi" }]);
    await ctx.storage.put("url", "https://wipe-me.clydeford.net");
  });
  await stub.clear();
  await runInDurableObject(stub, async (instance: SiteSession) => {
    const s = await instance.getState();
    expect(s.messages.length).toBe(0);
    expect(s.deployedUrl).toBe(null);
    expect(s.currentScript).toBe(null);
  });
});
