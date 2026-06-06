import Anthropic from "@anthropic-ai/sdk";
import type { Env, StoredMessage } from "./types";
import { MODEL, SYSTEM_PROMPT, DEPLOY_TOOL, DEPLOY_PROJECT_TOOL } from "./prompts";

export type TurnEvent =
  | { type: "text"; text: string }
  | { type: "deploy"; explanation: string; script: string }
  | {
      type: "deploy_project";
      explanation: string;
      files: { path: string; content: string }[];
      installCommand?: string;
      buildCommand?: string;
      outputDir?: string;
      workerEntry?: string;
    };

export async function* streamTurn(
  env: Env,
  history: StoredMessage[],
  currentScript: string | null,
): AsyncGenerator<TurnEvent> {
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    // Delegate to the current global fetch (lets tests stub it, and uses the
    // Workers runtime fetch in production).
    fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
  });

  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ];
  if (currentScript) {
    system.push({
      type: "text",
      text: `CURRENT DEPLOYED SCRIPT:\n\n${currentScript}`,
      cache_control: { type: "ephemeral" },
    });
  }

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    system,
    tools: [DEPLOY_TOOL, DEPLOY_PROJECT_TOOL],
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    }
  }

  const final = await stream.finalMessage();
  for (const block of final.content) {
    if (block.type === "tool_use" && block.name === "deploy_worker") {
      const input = block.input as { explanation: string; script: string };
      yield { type: "deploy", explanation: input.explanation, script: input.script };
    }
    if (block.type === "tool_use" && block.name === "deploy_project") {
      const i = block.input as any;
      yield {
        type: "deploy_project",
        explanation: i.explanation,
        files: i.files,
        installCommand: i.installCommand,
        buildCommand: i.buildCommand,
        outputDir: i.outputDir,
        workerEntry: i.workerEntry,
      };
    }
  }
}
