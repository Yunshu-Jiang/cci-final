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

  // 情况说明：没有 WebGPU -> 尝试 WASM，需要 crossOriginIsolated
  if (!('gpu' in navigator)) {
    console.log("[WebLLM] No WebGPU; will try WASM fallback.");
  }
  if (!crossOriginIsolated) {
    // 不满足隔离，WASM 会失败：给出可操作提示
    throw new Error(
      "This page isn't crossOriginIsolated. Open in your system browser (Safari/Chrome) instead of an in-app browser."
    );
  }

  engine = await CreateMLCEngine(
    {
      model_id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
      initProgressCallback: (p) => console.log("[WebLLM]", p.text)
      // 不设置 runtime，库会自动在 webgpu/wasm 之间选择
    },
    {
      use_web_worker: true
    }
  );
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
