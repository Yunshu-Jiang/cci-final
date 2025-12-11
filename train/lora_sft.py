from typing import List, Dict, Any
import torch
from datasets import load_dataset
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    TrainingArguments,
    Trainer,
)
from peft import LoraConfig, get_peft_model

MODEL_NAME = "Qwen/Qwen2.5-1.5B-Instruct"
DATA_PATH = "data_train.jsonl"
OUT_DIR = "lora_out"

# 你的任务是一句话回复，训练不用太长上下文
MAX_SEQ_LEN = 512

# 先测速：50；正式训练改成 -1
MAX_STEPS = -1

DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"

def split_messages(messages: List[Dict[str, str]]):
    prompt = []
    answer = None
    for m in messages:
        role = m.get("role")
        if role == "assistant":
            answer = m.get("content", "")
            break
        prompt.append({"role": role, "content": m.get("content", "")})
    if answer is None:
        raise ValueError("Each sample must contain an assistant message.")
    return prompt, str(answer)

def build_example(tokenizer: AutoTokenizer, messages: List[Dict[str, str]]):
    prompt_msgs, answer_text = split_messages(messages)

    # prompt：system+user，并加 generation prompt（让模型知道接下来该轮到 assistant）
    prompt_text = tokenizer.apply_chat_template(
        prompt_msgs,
        tokenize=False,
        add_generation_prompt=True,
    )

    # full：prompt + assistant answer（不再加 generation prompt）
    full_text = prompt_text + answer_text

    # 分别 tokenize，方便做 labels mask
    prompt_ids = tokenizer(
        prompt_text,
        truncation=True,
        max_length=MAX_SEQ_LEN,
        add_special_tokens=False,
    )["input_ids"]

    full = tokenizer(
        full_text,
        truncation=True,
        max_length=MAX_SEQ_LEN,
        add_special_tokens=False,
    )
    input_ids = full["input_ids"]
    attention_mask = full["attention_mask"]

    # labels：prompt 部分 -100，只训练 answer 部分
    labels = [-100] * len(input_ids)
    prompt_len = min(len(prompt_ids), len(input_ids))
    for i in range(prompt_len, len(input_ids)):
        labels[i] = input_ids[i]

    return {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "labels": labels,
    }

class DataCollatorForCausalLMWithMask:
    def __init__(self, tokenizer: AutoTokenizer):
        self.tokenizer = tokenizer

    def __call__(self, features: List[Dict[str, Any]]) -> Dict[str, torch.Tensor]:
        max_len = max(len(f["input_ids"]) for f in features)

        def pad(seq, pad_value):
            return seq + [pad_value] * (max_len - len(seq))

        batch_input_ids = [pad(f["input_ids"], self.tokenizer.pad_token_id) for f in features]
        batch_attention = [pad(f["attention_mask"], 0) for f in features]
        batch_labels = [pad(f["labels"], -100) for f in features]

        return {
            "input_ids": torch.tensor(batch_input_ids, dtype=torch.long),
            "attention_mask": torch.tensor(batch_attention, dtype=torch.long),
            "labels": torch.tensor(batch_labels, dtype=torch.long),
        }

def main():
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, use_fast=True)

    # ✅ 很关键：确保 pad_token 存在（有些 tokenizer 没有显式 pad token）
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    ds = load_dataset("json", data_files=DATA_PATH, split="train")

    def map_fn(ex):
        return build_example(tokenizer, ex["messages"])

    ds = ds.map(map_fn, remove_columns=ds.column_names)

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        torch_dtype=torch.float16,
        device_map={"": DEVICE} if DEVICE != "cpu" else "cpu",
    )

    # ✅ MPS 更稳
    model.gradient_checkpointing_enable()
    model.config.use_cache = False

    lora = LoraConfig(
        r=8,
        lora_alpha=16,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"],
    )
    model = get_peft_model(model, lora)
    model.print_trainable_parameters()

    collator = DataCollatorForCausalLMWithMask(tokenizer)

    args = TrainingArguments(
        output_dir=OUT_DIR,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=16,
        learning_rate=2e-4,
        num_train_epochs=2 if MAX_STEPS == -1 else 1,
        max_steps=MAX_STEPS if MAX_STEPS != -1 else -1,
        logging_steps=1 if MAX_STEPS != -1 else 10,
        save_steps=2000000 if MAX_STEPS != -1 else 200,
        save_total_limit=2,
        fp16=False,
        bf16=False,
        dataloader_pin_memory=False,  # MPS 友好，避免 warning
        report_to=[],
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=ds,
        data_collator=collator,
    )

    trainer.train()
    trainer.save_model(OUT_DIR)
    tokenizer.save_pretrained(OUT_DIR)

if __name__ == "__main__":
    main()
