// public/js/ai-webllm.js
import * as webllm from "../lib/web-llm/index.js";

let engine = null;

// 你自定义的“模型ID”，随便取，但要唯一
const MODEL_ID = "Persona-Qwen2.5-1.5B-FT-q4f16_1-MLC";

// 用一个已知的基座条目去“借” wasm model_lib（避免自己编 wasm）
const BASE_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

// 关键：WebLLM 会按 HF 风格取文件，所以这里必须是 /resolve/main/
const REMOTE_MODEL =
  "https://pub-8ec30651c6f941b78efffd6f0f5181b0.r2.dev/Persona-Qwen2.5-1.5B-FT-q4f16_1-MLC-v2/resolve/main/";


function toAbsURL(u) {
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${location.origin}${u}`;
  return new URL(u, location.href).href;
}

function getBaseRecord() {
  const list = webllm.prebuiltAppConfig?.model_list || [];
  const rec = list.find((m) => m.model_id === BASE_ID);
  if (!rec?.model_lib) throw new Error("Cannot find model_lib for " + BASE_ID);
  return rec;
}

export async function ensureAI() {
  if (engine) return engine;

  const hasWebGPU = "gpu" in navigator;
  const canUseWasm = self.crossOriginIsolated;

  if (!hasWebGPU && !canUseWasm) {
    throw new Error(
      "This page isn't cross-origin isolated in your browser. Open in Safari/Chrome, not an in-app browser."
    );
  }

  const base = getBaseRecord();
  const initProgressCallback = (p) => console.log("[WebLLM]", p.text);

  const appConfig = {
    model_list: [
      {
        model_id: MODEL_ID,
        model: REMOTE_MODEL,                 // ✅ 指向 R2 的 /resolve/main/
        model_lib: toAbsURL(base.model_lib), // ✅ 复用官方 wasm
        required_features: base.required_features || []
      }
    ]
  };

  engine = await webllm.CreateMLCEngine(MODEL_ID, {
    use_web_worker: true,
    initProgressCallback,
    appConfig
  });

  return engine;
}

export async function chatOnce(messages, opts = {}) {
  await ensureAI();

  const payload = {
    messages,
    temperature: opts.temperature ?? 0.9,
    max_tokens: opts.max_tokens ?? 120,
    // 可选：如果支持就生效
    top_p: opts.top_p,
    repetition_penalty: opts.repetition_penalty,
    presence_penalty: opts.presence_penalty,
    frequency_penalty: opts.frequency_penalty,
    // 可选：stop
    stop: opts.stop,
  };

  // 删掉 undefined，避免某些版本严格校验
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

  try {
    const result = await engine.chat.completions.create(payload);
    const text = result?.choices?.[0]?.message?.content || "";
    return text.trim();
  } catch (e) {
    // 降级重试：移除可能不支持的字段
    const fallback = { ...payload };
    delete fallback.top_p;
    delete fallback.repetition_penalty;
    delete fallback.presence_penalty;
    delete fallback.frequency_penalty;
    delete fallback.stop;

    const result = await engine.chat.completions.create(fallback);
    const text = result?.choices?.[0]?.message?.content || "";
    return text.trim();
  }
}

window.AI = { ensureAI, chatOnce };
