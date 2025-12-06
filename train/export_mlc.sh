#!/usr/bin/env bash
set -e

# 1) merged HF 模型目录
HF_DIR="merged_hf"

# 2) 输出的 MLC 目录名（建议带上量化名）
OUT_DIR="Qwen2.5-1.5B-Instruct-persona-q4f16_1-MLC"

# 3) 量化方式：WebLLM 常用 q4f16_1
QUANT="q4f16_1"

mkdir -p dist

# 转权重
mlc_llm convert_weight "./${HF_DIR}/" \
  --quantization ${QUANT} \
  -o "dist/${OUT_DIR}"

# 生成 mlc-chat-config.json + tokenizer 处理
mlc_llm gen_config "./${HF_DIR}/" \
  --quantization ${QUANT} \
  --conv-template qwen2 \
  -o "dist/${OUT_DIR}/"

echo "MLC ready in dist/${OUT_DIR}"
