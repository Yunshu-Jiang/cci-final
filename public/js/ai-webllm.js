// public/js/ai-webllm.js
// 使用本地的 WebLLM 构建（public/lib/web-llm/index.js）
// 暴露 ensureAI / chatOnce 给 app.js 使用

engine = await CreateMLCEngine(
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  { use_web_worker: true, initProgressCallback }
);

let engine = null;

export async function ensureAI() {
  if (engine) return engine;

  const hasWebGPU  = ('gpu' in navigator);
  const canUseWasm = crossOriginIsolated;   // WASM 需要 cross-origin isolation（COOP/COEP）

  if (!hasWebGPU && !canUseWasm) {
    // 在内置浏览器/iframe 打开时通常不满足隔离；给出可操作提示
    throw new Error(
      "This page isn't cross-origin isolated in your browser. Open the link in Safari/Chrome (system browser), not an in-app browser."
    );
  }

  const runtime = hasWebGPU ? "webgpu" : "wasm";
  const initProgressCallback = (p) => console.log("[WebLLM]", p.text);

  // 0.2+ 版本：CreateMLCEngine(appConfig, engineConfig)
  engine = await CreateMLCEngine(
    { model_id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC" }, // 只放模型 ID
    { runtime, use_web_worker: true, initProgressCallback } // 这里指定 runtime & 进度
  );

  return engine;
}

// 单轮对话：OpenAI 风格 messages
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

// 为了在控制台自检（typeof AI === "object"; await AI.ensureAI()）
window.AI = { ensureAI, chatOnce };
