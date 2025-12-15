# public/training_model/train_lora_mps.py
import os
import torch
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, TrainingArguments, DataCollatorForLanguageModeling
from peft import LoraConfig, get_peft_model
from trl import SFTTrainer

MODEL_NAME = os.environ.get("MODEL_NAME", "Qwen/Qwen2.5-1.5B-Instruct")
TRAIN_FILE = os.environ.get("TRAIN_FILE", "train.jsonl")
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "./qwen2.5-1.5b-npc-lora")
MAX_SEQ_LEN = int(os.environ.get("MAX_SEQ_LEN", "768"))

def messages_to_text(example, tokenizer):
    return tokenizer.apply_chat_template(
        example["messages"],
        tokenize=False,
        add_generation_prompt=False,
    )

def main():
    use_mps = torch.backends.mps.is_available()
    device_map = {"": "mps"} if use_mps else "auto"
    dtype = torch.float16 if use_mps else torch.bfloat16

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, use_fast=True, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        device_map=device_map,
        torch_dtype=dtype,
        trust_remote_code=True,
    )

    model.gradient_checkpointing_enable()
    model.enable_input_require_grads()

    # LoRA
    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora_config)

    ds = load_dataset("json", data_files=TRAIN_FILE, split="train")

    # 我们在这里把 messages -> text -> tokenize
    def preprocess(ex):
        text = messages_to_text(ex, tokenizer)
        toks = tokenizer(
            text,
            truncation=True,
            max_length=MAX_SEQ_LEN,
            padding=False,
        )
        # causal LM labels = input_ids
        toks["labels"] = toks["input_ids"].copy()
        return toks

    ds = ds.map(preprocess, remove_columns=ds.column_names)

    # collator：动态 padding
    collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        num_train_epochs=2,
        learning_rate=2e-4,
        warmup_ratio=0.03,
        lr_scheduler_type="cosine",
        logging_steps=20,
        save_steps=400,
        save_total_limit=2,
        optim="adamw_torch",
        report_to="none",
        fp16=False,
        bf16=False,
        dataloader_num_workers=0,
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=ds,
        data_collator=collator,
        processing_class=tokenizer,
    )

    trainer.train()
    trainer.model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print("Saved LoRA adapter to:", OUTPUT_DIR)

if __name__ == "__main__":
    main()
