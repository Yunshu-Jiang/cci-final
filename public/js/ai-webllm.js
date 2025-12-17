import * as webllm from "../lib/web-llm/index.js";

const BASE_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
const MODEL_ID_ABSTRACT = "QwenNPC-Abstract-q4f16_1-MLC";
const MODEL_ID_LITERARY = "QwenNPC-Literary-q4f16_1-MLC";
const REMOTE_MODEL_ABSTRACT =
  "https://pub-8ec30651c6f941b78efffd6f0f5181b0.r2.dev/QwenNPC-Abstract-q4f16_1-MLC/resolve/main/QwenNPC-Abstract-q4f16_1-MLC/";

const REMOTE_MODEL_LITERARY =
  "https://pub-8ec30651c6f941b78efffd6f0f5181b0.r2.dev/QwenNPC-Literary-q4f16_1-MLC/resolve/main/QwenNPC-Literary-q4f16_1-MLC/";


function pickModel(persona) {
  if (persona === "abstract") {
    return { modelId: MODEL_ID_ABSTRACT, modelUrl: REMOTE_MODEL_ABSTRACT };
  }
  return { modelId: MODEL_ID_LITERARY, modelUrl: REMOTE_MODEL_LITERARY };
}

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

const engineMap = new Map();

export async function ensureAI(persona = "literary") {
  const { modelId, modelUrl } = pickModel(persona);

  if (engineMap.has(modelId)) return engineMap.get(modelId);

  const hasWebGPU = "gpu" in navigator;
  const canUseWasm = self.crossOriginIsolated;

  if (!hasWebGPU && !canUseWasm) {
    throw new Error(
      "This page isn't cross-origin isolated in your browser. Open in Safari/Chrome, not an in-app browser."
    );
  }

  const base = getBaseRecord();
  const initProgressCallback = (p) => console.log(`[WebLLM:${modelId}]`, p.text);

  const appConfig = {
    model_list: [
      {
        model_id: MODEL_ID_ABSTRACT,
        model: REMOTE_MODEL_ABSTRACT,
        model_lib: toAbsURL(base.model_lib),
        required_features: base.required_features || [],
      },
      {
        model_id: MODEL_ID_LITERARY,
        model: REMOTE_MODEL_LITERARY,
        model_lib: toAbsURL(base.model_lib),
        required_features: base.required_features || [],
      },
    ],
  };

  const engine = await webllm.CreateMLCEngine(modelId, {
    use_web_worker: true,
    initProgressCallback,
    appConfig,
  });

  engineMap.set(modelId, engine);
  return engine;
}

export async function chatOnce(messages, opts = {}, persona = "literary") {
  const engine = await ensureAI(persona);

  const payload = {
    messages,
    temperature: opts.temperature ?? 0.9,
    max_tokens: opts.max_tokens ?? 120,
    top_p: opts.top_p,
    repetition_penalty: opts.repetition_penalty,
    presence_penalty: opts.presence_penalty,
    frequency_penalty: opts.frequency_penalty,
    stop: opts.stop,
  };

  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

  try {
    const result = await engine.chat.completions.create(payload);
    const text = result?.choices?.[0]?.message?.content || "";
    return text.trim();
  } catch (e) {
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
