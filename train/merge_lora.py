import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE = "Qwen/Qwen2.5-1.5B-Instruct"
LORA_DIR = "lora_out"
OUT = "merged_hf"

def main():
    tok = AutoTokenizer.from_pretrained(BASE, use_fast=True)
    base = AutoModelForCausalLM.from_pretrained(
        BASE, torch_dtype=torch.float16, device_map="cpu"
    )

    model = PeftModel.from_pretrained(base, LORA_DIR)
    model = model.merge_and_unload()

    model.save_pretrained(OUT, safe_serialization=False)  # 兼容性更强
    tok.save_pretrained(OUT)
    print("merged ->", OUT)

if __name__ == "__main__":
    main()
