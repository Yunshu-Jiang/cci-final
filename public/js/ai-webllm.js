// public/js/ai-webllm.js
// 使用本地的 WebLLM 构建文件（public/lib/web-llm/index.js）
// 提供 ensureAI / chatOnce 给 app.js 使用

// 这里用的是相对路径：ai-webllm.js 在 public/js/ 下
// ../ 回到 public/，再进入 lib/web-llm/index.js
// public/js/ai-webllm.js
import { CreateMLCEngine } from "../lib/web-llm/index.js";

let engine = null;

export async function ensureAI() {
  if (engine) return engine;

  const hasWebGPU = ('gpu' in navigator);
  const canUseWasm = crossOriginIsolated;  // WASM 需要 cross-origin isolation

  if (!hasWebGPU && !canUseWasm) {
    // 不满足 WASM 的前置条件，直接给用户清晰提示
    throw new Error(
      "This page isn't cross-origin isolated in your browser. Open the link in Safari/Chrome (system browser), not an in-app browser."
    );
  }

  // 让引擎自动选：有 WebGPU 用 WebGPU；否则用 WASM
  const runtime = hasWebGPU ? "webgpu" : "wasm";

  // 有些版本把 runtime 放在第二个参数，也有版本读第一个参数；两处都传，向后兼容
  const appCfg = {
    model_id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    initProgressCallback: (p) => console.log("[WebLLM]", p.text),
    runtime
  };
  const engCfg = { runtime, use_web_worker: true };

  engine = await CreateMLCEngine(appCfg, engCfg);
  return engine;
}
  // 可选：加载过程中的进度回调，只打印到 console
  const initProgressCallback = (report) => {
    console.log("[WebLLM init]", report.text);
  };

  initPromise = CreateMLCEngine(
    MODEL_ID,                   // ✅ 正确：第一个参数是字符串 ID
    { initProgressCallback }    // 第二个参数是配置对象
  )
    .then((e) => {
      engine = e;
      ready  = true;
      return e;
    })
    .catch((err) => {
      console.error("WebLLM init error:", err);
      engine = null;
      ready  = false;
      initPromise = null;
      throw err; // 继续往外抛，让 app.js 去做兜底（offline）
    });

  return initPromise;


// 单轮对话：OpenAI 风格 messages
export async function chatOnce(messages, opts = {}) {
  await ensureAI();

  const {
    temperature = 0.8,
    max_tokens  = 160
  } = opts;

  const result = await engine.chat.completions.create({
    messages,
    temperature,
    max_tokens
  });

  const text = result?.choices?.[0]?.message?.content || "…";
  return text.trim();
}

// 方便在控制台调试
window.AI = { ensureAI, chatOnce };
