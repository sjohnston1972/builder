import { DurableObject } from "cloudflare:workers";
import type { Env, StoredMessage } from "./types";
import { streamTurn } from "./anthropic";
import { deploySite, deployProject, waitUntilLive } from "./deploy";
import { runBuild, probeLive } from "./buildclient";
import { syncForgeToGitHub } from "./github";
import { logEvent } from "./logstore";

// Authoritative liveness/SSL check: probe the deployed URL from inside an ephemeral
// container (a real external HTTPS request — public DNS + TLS handshake), which a
// same-zone Workers subrequest can't faithfully reproduce. Falls back to the in-runtime
// fetch poll if the container is unavailable, so a probe outage never blocks a deploy.
async function checkLive(
  env: Env,
  name: string,
  url: string,
  send: (obj: unknown) => void,
): Promise<boolean> {
  try {
    const container = env.BUILD_BOX.get(env.BUILD_BOX.idFromName(name));
    const r = await probeLive(container, url, { onPending: () => send({ type: "provisioning" }) });
    await logEvent(
      env,
      name,
      "info",
      "provision",
      `liveness probe (container): ${r.live ? "LIVE" : "not live within budget"} — HTTP ${r.status || "—"} in ${r.ms}ms over ${r.attempts} attempt(s)`,
    );
    return r.live;
  } catch (e: any) {
    await logEvent(env, name, "error", "provision", `container probe failed: ${String(e?.message ?? e)} — falling back to runtime fetch`);
    return waitUntilLive(url, { onPending: () => send({ type: "provisioning" }) });
  }
}

// Default Worker module when a project has no custom workerEntry: serve the built SPA.
const DEFAULT_ASSETS_WORKER =
  `export default { fetch(request, env) { return env.ASSETS.fetch(request); } };`;

interface State {
  messages: StoredMessage[];
  currentScript: string | null;
  deployedUrl: string | null;
  status: "idle" | "building";
}

export class SiteSession extends DurableObject<Env> {
  // Wipe all stored chat history + script for this site (used on delete).
  async clear(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  // Mirror this forge's current source to GitHub on demand (used by the backup endpoint
  // and the one-time backfill). Unlike the post-deploy auto-sync this is NOT best-effort:
  // it throws on failure so the caller can report which forge failed.
  async syncToGitHub(name: string): Promise<{ repo: string; commit: string }> {
    const script = await this.ctx.storage.get<string>("script");
    if (!script) throw new Error(`forge "${name}" has no deployed source to back up yet`);
    const url =
      (await this.ctx.storage.get<string>("url")) ?? `https://${name}.${this.env.SITE_ZONE}`;
    return syncForgeToGitHub(this.env, name, script, url);
  }

  async getState(): Promise<State> {
    const messages = (await this.ctx.storage.get<StoredMessage[]>("messages")) ?? [];
    let status = (await this.ctx.storage.get<"idle" | "building">("status")) ?? "idle";
    // Self-heal a stuck "building" flag so reconnecting clients never hang forever on
    // "finishing your build". A client disconnect can interrupt the finally that resets
    // status. Two cases:
    //  1. The turn finished — its assistant reply is appended only after the work
    //     completes, so a trailing assistant message means we're done.
    //  2. The turn died mid-flight before replying (e.g. an abandoned/stalled build) —
    //     bound it by wall-clock: longer than any legitimate turn (model + capped
    //     build + SSL wait, ~11 min worst case) means it's dead.
    if (status === "building") {
      const last = messages[messages.length - 1];
      const startedAt = (await this.ctx.storage.get<number>("buildStartedAt")) ?? 0;
      // idle if: the turn replied (assistant last); OR no start timestamp (a legacy/dead
      // turn — new turns always write buildStartedAt before status); OR it's been longer
      // than any legitimate turn.
      if ((last && last.role === "assistant") || !startedAt || Date.now() - startedAt > 720_000) {
        status = "idle";
      }
    }
    return {
      messages,
      currentScript: (await this.ctx.storage.get<string>("script")) ?? null,
      deployedUrl: (await this.ctx.storage.get<string>("url")) ?? null,
      status,
    };
  }

  async fetch(req: Request): Promise<Response> {
    const { name, message } = await req.json<{ name: string; message: string }>();
    const state = await this.getState();
    state.messages.push({ role: "user", content: message, at: Date.now() });
    // Persist the user's message and a "building" flag up front, so a client that
    // reconnects mid-build (mobile app-switch, screen sleep, reload) can see the
    // turn is in progress and poll for the result.
    await this.ctx.storage.put("messages", state.messages);
    // Write buildStartedAt BEFORE status so a reader can never observe status="building"
    // without a timestamp (which getState treats as a dead/legacy turn).
    await this.ctx.storage.put("buildStartedAt", Date.now());
    await this.ctx.storage.put("status", "building");
    await logEvent(this.env, name, "info", "turn", `turn started — prompt: ${message.slice(0, 240)}`);

    const env = this.env;
    const ctx = this.ctx;
    const encoder = new TextEncoder();

    // If the client navigates away (mobile app-switch, tab close), the response
    // stream is cancelled. We keep building and persisting regardless — `send`
    // becomes a no-op once the client is gone — so the deploy completes and the
    // conversation is saved. The user sees the result when they reopen the site.
    let clientGone = false;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          if (clientGone) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch {
            clientGone = true;
          }
        };
        let assistantText = "";
        let deployedThisTurn = false;
        try {
          for await (const ev of streamTurn(env, state.messages, state.currentScript, name)) {
            if (ev.type === "text") {
              assistantText += ev.text;
              send({ type: "text", text: ev.text });
            } else if (ev.type === "deploy") {
              send({ type: "deploying" });
              await logEvent(env, name, "info", "deploy", "deploying single-file worker");
              const url = await deploySite(env, name, ev.script);
              state.currentScript = ev.script;
              state.deployedUrl = url;
              await ctx.storage.put("script", ev.script);
              await ctx.storage.put("url", url);
              deployedThisTurn = true;
              // Don't claim "live" until the URL actually responds. On a first deploy the
              // edge TLS cert is still provisioning; the container probe waits it out and
              // reports authoritatively whether the public URL is serving.
              const live = await checkLive(env, name, url, send);
              await logEvent(env, name, "info", "deployed", `${live ? "live" : "deployed (still provisioning)"}: ${url}`);
              send({ type: "deployed", url, explanation: ev.explanation, provisioning: !live });
            } else if (ev.type === "deploy_project") {
              send({ type: "building_project" });
              await logEvent(
                env,
                name,
                "info",
                "build",
                `framework build started — ${ev.files.length} files, output ${ev.outputDir ?? "dist"}`,
              );
              const container = env.BUILD_BOX.get(env.BUILD_BOX.idFromName(name));
              let buildLog = "";
              const result = await runBuild(
                container,
                {
                  siteName: name,
                  files: ev.files,
                  installCommand: ev.installCommand,
                  buildCommand: ev.buildCommand,
                  outputDir: ev.outputDir,
                },
                (line) => {
                  buildLog = (buildLog + line + "\n").slice(-18000); // keep the tail (capped)
                  send({ type: "build_log", line });
                },
              );
              if (!result.ok || !result.assets) {
                const errMsg = result.error ?? "build failed";
                send({ type: "build_failed", error: errMsg });
                await logEvent(env, name, "error", "build", `build failed: ${errMsg}\n\n--- build output ---\n${buildLog}`);
                // Record the failure so the model can fix it next turn; keep previous deploy live.
                assistantText += `${assistantText ? "\n" : ""}[build failed: ${errMsg}]`;
                continue;
              }
              await logEvent(env, name, "info", "build", `build succeeded\n\n--- build output ---\n${buildLog}`);
              const workerScript = ev.workerEntry
                ? (ev.files.find((f: { path: string; content: string }) => f.path === ev.workerEntry)?.content ?? DEFAULT_ASSETS_WORKER)
                : DEFAULT_ASSETS_WORKER;
              const url = await deployProject(env, name, workerScript, result.assets);
              state.currentScript = JSON.stringify({ files: ev.files });
              state.deployedUrl = url;
              await ctx.storage.put("script", state.currentScript);
              await ctx.storage.put("url", url);
              deployedThisTurn = true;
              const live = await checkLive(env, name, url, send);
              await logEvent(env, name, "info", "deployed", `${live ? "live" : "deployed (still provisioning)"}: ${url}`);
              send({ type: "deployed", url, explanation: ev.explanation, provisioning: !live });
            }
          }
          await logEvent(env, name, "info", "model", assistantText ? `reply: ${assistantText.slice(0, 400)}` : "turn finished (deploy only)");
          state.messages.push({ role: "assistant", content: assistantText || "(deployed)", at: Date.now() });
          await ctx.storage.put("messages", state.messages);
        } catch (err: any) {
          const msg = String(err?.message ?? err);
          // Durable error capture — write the error to the log BEFORE anything else so it can
          // never silently vanish (the SSE 'error' is transient; a hard turn death loses it).
          await logEvent(env, name, "error", "error", msg);
          send({ type: "error", message: msg });
          // Persist an assistant turn so the conversation reflects a finished (failed)
          // turn. This also lets getState() derive "idle" if the status write below is
          // interrupted by a client disconnect.
          state.messages.push({ role: "assistant", content: assistantText ? `${assistantText}\n[error: ${msg}]` : `[error: ${msg}]`, at: Date.now() });
          await ctx.storage.put("messages", state.messages);
        } finally {
          // Mark the turn done regardless of how it ended, so reconnecting clients
          // stop polling and render the final state.
          await ctx.storage.put("status", "idle");
          // Best-effort: mirror the freshly deployed source to GitHub. Runs via waitUntil
          // so it never blocks the response, and any failure is logged, never thrown — a
          // GitHub outage must not affect the deploy. Skipped entirely if no token is set.
          if (deployedThisTurn && env.GITHUB_TOKEN && state.currentScript && state.deployedUrl) {
            ctx.waitUntil(
              syncForgeToGitHub(env, name, state.currentScript, state.deployedUrl)
                .then((r) => logEvent(env, name, "info", "github", `mirrored to ${r.repo}`))
                .catch((e) => {
                  console.error(`[github] backup failed for ${name}:`, e);
                  return logEvent(env, name, "error", "github", `GitHub backup failed: ${String(e?.message ?? e)}`);
                }),
            );
          }
          try {
            controller.close();
          } catch {
            /* already closed by client cancel */
          }
        }
      },
      cancel() {
        clientGone = true; // stop streaming, but the build above runs to completion
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }
}
