import argparse
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

def merge_one(base_id: str, lora_dir: str, out_dir: str, dtype: str, device: str):
    torch_dtype = {
        "fp16": torch.float16,
        "bf16": torch.bfloat16,
        "fp32": torch.float32,
    }[dtype]

    print(f"[merge] base={base_id}")
    print(f"[merge] lora={lora_dir}")
    print(f"[merge] out ={out_dir}")
    print(f"[merge] dtype={dtype} device={device}")

    tok = AutoTokenizer.from_pretrained(base_id, use_fast=True, trust_remote_code=True)
    base = AutoModelForCausalLM.from_pretrained(
        base_id,
        torch_dtype=torch_dtype,
        device_map=device,
        trust_remote_code=True,
    )

    model = PeftModel.from_pretrained(base, lora_dir)
    model = model.merge_and_unload()
    model.save_pretrained(out_dir, safe_serialization=True)
    tok.save_pretrained(out_dir)
    print("[ok] merged ->", out_dir)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="Qwen/Qwen2.5-1.5B-Instruct")
    ap.add_argument("--lora", required=True, help="path to LoRA adapter dir, e.g. public/training_model/lora_abstract")
    ap.add_argument("--out", required=True, help="output dir for merged HF model")
    ap.add_argument("--dtype", choices=["fp16", "bf16", "fp32"], default="fp16")
    ap.add_argument("--device", default="cpu", help='usually "cpu" for merge, or "auto"')
    args = ap.parse_args()

    merge_one(args.base, args.lora, args.out, args.dtype, args.device)

if __name__ == "__main__":
    main()
