import { DurableObject } from "cloudflare:workers";
import type { Env, StoredMessage } from "./types";
import { streamTurn } from "./anthropic";
import { deploySite, deployProject, waitUntilLive } from "./deploy";
import { runBuild } from "./buildclient";
import { syncForgeToGitHub } from "./github";

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
              const url = await deploySite(env, name, ev.script);
              state.currentScript = ev.script;
              state.deployedUrl = url;
              await ctx.storage.put("script", ev.script);
              await ctx.storage.put("url", url);
              deployedThisTurn = true;
              // Don't claim "live" until the URL actually responds. On a first
              // deploy the edge TLS cert is still provisioning; tell the client
              // it's pending, and report whether it came up within our window.
              const live = await waitUntilLive(url, {
                onPending: () => send({ type: "provisioning" }),
              });
              send({ type: "deployed", url, explanation: ev.explanation, provisioning: !live });
            } else if (ev.type === "deploy_project") {
              send({ type: "building_project" });
              const container = env.BUILD_BOX.get(env.BUILD_BOX.idFromName(name));
              const result = await runBuild(
                container,
                {
                  siteName: name,
                  files: ev.files,
                  installCommand: ev.installCommand,
                  buildCommand: ev.buildCommand,
                  outputDir: ev.outputDir,
                },
                (line) => send({ type: "build_log", line }),
              );
              if (!result.ok || !result.assets) {
                const errMsg = result.error ?? "build failed";
                send({ type: "build_failed", error: errMsg });
                // Record the failure so the model can fix it next turn; keep previous deploy live.
                assistantText += `${assistantText ? "\n" : ""}[build failed: ${errMsg}]`;
                continue;
              }
              const workerScript = ev.workerEntry
                ? (ev.files.find((f: { path: string; content: string }) => f.path === ev.workerEntry)?.content ?? DEFAULT_ASSETS_WORKER)
                : DEFAULT_ASSETS_WORKER;
              const url = await deployProject(env, name, workerScript, result.assets);
              state.currentScript = JSON.stringify({ files: ev.files });
              state.deployedUrl = url;
              await ctx.storage.put("script", state.currentScript);
              await ctx.storage.put("url", url);
              deployedThisTurn = true;
              const live = await waitUntilLive(url, { onPending: () => send({ type: "provisioning" }) });
              send({ type: "deployed", url, explanation: ev.explanation, provisioning: !live });
            }
          }
          state.messages.push({ role: "assistant", content: assistantText || "(deployed)", at: Date.now() });
          await ctx.storage.put("messages", state.messages);
        } catch (err: any) {
          const msg = String(err?.message ?? err);
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
              syncForgeToGitHub(env, name, state.currentScript, state.deployedUrl).catch((e) =>
                console.error(`[github] backup failed for ${name}:`, e),
              ),
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
