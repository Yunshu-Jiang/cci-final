import { CreateMLCEngine } from "../lib/web-llm/index.js";
let engine = null;
export async function ensureAI() {
  if (engine) return engine;
  const hasWebGPU  = ('gpu' in navigator);
  const canUseWasm = crossOriginIsolated;
  if (!hasWebGPU && !canUseWasm) {
    throw new Error(
      "This page isn't cross-origin isolated in your browser. Open the link in Safari/Chrome (system browser), not an in-app browser."
    );
  }
  const runtime = hasWebGPU ? "webgpu" : "wasm";
  const initProgressCallback = (p) => console.log("[WebLLM]", p.text);
  engine = await CreateMLCEngine(
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  { use_web_worker: true, initProgressCallback }
);
  return engine;
}
// ai chat
export async function chatOnce(messages, opts = {}) {
  const { temperature = 0.9, max_tokens = 80 } = opts;
  await ensureAI();
  const result = await engine.chat.completions.create({
    messages,
    temperature,
    max_tokens
  });
  const text = result?.choices?.[0]?.message?.content || "";
  return text.trim();
}
window.AI = { ensureAI, chatOnce };
