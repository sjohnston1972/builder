import { expect, test, vi, afterEach } from "vitest";
import { streamTurn } from "../src/anthropic";

afterEach(() => vi.restoreAllMocks());

test("yields text then tool deploy event", async () => {
  // Minimal canned Anthropic SSE: message_start, text delta, tool_use, stop.
  const chunks = [
    `event: message_start\ndata: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[],"model":"x","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":1}}}\n\n`,
    `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
    `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Building"}}\n\n`,
    `event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n`,
    `event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"deploy_worker","input":{}}}\n\n`,
    `event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"explanation\\":\\"hi\\",\\"script\\":\\"export default{}\\"}"}}\n\n`,
    `event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n`,
    `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":2}}\n\n`,
    `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(chunks.join(""), {
        headers: { "content-type": "text/event-stream" },
      }),
    ),
  );

  const env = { ANTHROPIC_API_KEY: "k" } as any;
  const events: any[] = [];
  for await (const ev of streamTurn(env, [{ role: "user", content: "make a site" }], null, "mysite")) {
    events.push(ev);
  }
  const text = events.filter((e) => e.type === "text").map((e) => e.text).join("");
  const deploy = events.find((e) => e.type === "deploy");
  expect(text).toContain("Building");
  expect(deploy.explanation).toBe("hi");
  expect(deploy.script).toContain("export default");
});

test("yields deploy_project event from a deploy_project tool_use", async () => {
  const toolInput = {
    explanation: "react app",
    files: [{ path: "package.json", content: "{}" }],
    workerEntry: "worker.js",
  };
  // Build the SSE programmatically so nested JSON is escaped correctly.
  const sse = (obj: any, event: string) => `event: ${event}\ndata: ${JSON.stringify(obj)}\n\n`;
  const chunks = [
    sse({ type: "message_start", message: { id: "m", type: "message", role: "assistant", content: [], model: "x", stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } }, "message_start"),
    sse({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "deploy_project", input: {} } }, "content_block_start"),
    sse({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(toolInput) } }, "content_block_delta"),
    sse({ type: "content_block_stop", index: 0 }, "content_block_stop"),
    sse({ type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 2 } }, "message_delta"),
    sse({ type: "message_stop" }, "message_stop"),
  ];
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(chunks.join(""), { headers: { "content-type": "text/event-stream" } })));

  const env = { ANTHROPIC_API_KEY: "k" } as any;
  const events: any[] = [];
  for await (const ev of streamTurn(env, [{ role: "user", content: "build a react app" }], null, "reactsite")) {
    events.push(ev);
  }
  const dp = events.find((e) => e.type === "deploy_project");
  expect(dp).toBeTruthy();
  expect(dp.explanation).toBe("react app");
  expect(dp.files).toHaveLength(1);
  expect(dp.files[0].path).toBe("package.json");
  expect(dp.workerEntry).toBe("worker.js");
});
