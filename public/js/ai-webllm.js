// public/js/ai-webllm.js
// 使用本地的 WebLLM 构建文件（public/lib/web-llm/index.js）
// 提供 ensureAI / chatOnce 给 app.js 使用

// 这里用的是相对路径：ai-webllm.js 在 public/js/ 下
// ../ 回到 public/，再进入 lib/web-llm/index.js
import { CreateMLCEngine } from "../lib/web-llm/index.js";

let engine = null;
let ready  = false;
let initPromise = null;

// 你要用的模型 ID（和 HuggingFace / 模型文件夹名称一致）
const MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

// 懒加载：第一次真正需要 AI 时再去加载模型
export async function ensureAI() {
  if (engine) return engine;

  // 给无 WebGPU 的设备一个明确提示，但不要抛错
  if (!('gpu' in navigator)) {
    console.log("No WebGPU; will try WASM fallback.");
  }
  if (!crossOriginIsolated) {
    console.warn("Page is not crossOriginIsolated; WASM fallback will fail.");
  }

  engine = await CreateMLCEngine(
    {
      model_id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",   // 你的模型 ID
      initProgressCallback: (p) => console.log("[WebLLM]", p.text)
      // 不要写 runtime，让它自动选 webgpu 或 wasm
    },
    {
      // 建议用 worker，WASM/CPU 下更稳
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
