import { DurableObject } from "cloudflare:workers";
import type { Env, StoredMessage } from "./types";
import { streamTurn } from "./anthropic";
import { deploySite, deployProject, waitUntilLive } from "./deploy";
import { runBuild } from "./buildclient";

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

  async getState(): Promise<State> {
    return {
      messages: (await this.ctx.storage.get<StoredMessage[]>("messages")) ?? [],
      currentScript: (await this.ctx.storage.get<string>("script")) ?? null,
      deployedUrl: (await this.ctx.storage.get<string>("url")) ?? null,
      status: (await this.ctx.storage.get<"idle" | "building">("status")) ?? "idle",
    };
  }

  async fetch(req: Request): Promise<Response> {
    const { name, message } = await req.json<{ name: string; message: string }>();
    const state = await this.getState();
    state.messages.push({ role: "user", content: message });
    // Persist the user's message and a "building" flag up front, so a client that
    // reconnects mid-build (mobile app-switch, screen sleep, reload) can see the
    // turn is in progress and poll for the result.
    await this.ctx.storage.put("messages", state.messages);
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
        try {
          for await (const ev of streamTurn(env, state.messages, state.currentScript)) {
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
                send({ type: "build_failed", error: result.error ?? "build failed" });
                // Record the failure so the model can fix it next turn; keep previous deploy live.
                assistantText += `\n[build failed: ${result.error ?? "unknown"}]`;
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
              const live = await waitUntilLive(url, { onPending: () => send({ type: "provisioning" }) });
              send({ type: "deployed", url, explanation: ev.explanation, provisioning: !live });
            }
          }
          state.messages.push({ role: "assistant", content: assistantText || "(deployed)" });
          await ctx.storage.put("messages", state.messages);
        } catch (err: any) {
          send({ type: "error", message: String(err?.message ?? err) });
        } finally {
          // Mark the turn done regardless of how it ended, so reconnecting clients
          // stop polling and render the final state.
          await ctx.storage.put("status", "idle");
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
