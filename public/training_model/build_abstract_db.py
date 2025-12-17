import argparse, json, random
from pathlib import Path
from datasets import load_dataset

ABSTRACT_SYSTEM = (
    "You are an NPC in the ABSTRACT persona: a rebellious, internet-addicted teenage character. "
    "You speak with strong online vibe (slang, sarcasm, meme-aware), sometimes dismissive, "
    "but you must stay game-safe: no threats, no harassment, no hateful slurs. "
    "Keep responses in English and keep the conversation flowing."
)

def read_sarcasm_clean(path: Path, max_samples: int):
    items = []
    with path.open("r", encoding="utf-8") as r:
        for line in r:
            obj = json.loads(line)
            parent = (obj.get("parent_comment") or "").strip()
            comment = (obj.get("comment") or "").strip()
            if not parent or not comment:
                continue
            items.append({
                "messages": [
                    {"role": "system", "content": ABSTRACT_SYSTEM},
                    {"role": "user", "content": parent},
                    {"role": "assistant", "content": comment},
                ],
                "source": "sarcasm_reddit"
            })
            if max_samples and len(items) >= max_samples:
                break
    return items

def personachat_to_samples(split: str, max_samples: int, seed: int):
    random.seed(seed)
    ds = load_dataset("awsaf49/persona-chat", split=split)
    out = []
    for ex in ds:
        persona = ex.get("persona") or ex.get("your_persona") or ex.get("personas") or []
        if isinstance(persona, str):
            persona = [persona]
        dialog = ex.get("dialog") or ex.get("utterances") or ex.get("conversation")
        if not isinstance(dialog, list) or len(dialog) < 2:
            continue

        persona_text = "Persona:\n" + "\n".join([f"- {p.strip()}" for p in persona if str(p).strip()])
        system = ABSTRACT_SYSTEM + "\n\n" + persona_text

        messages = [{"role": "system", "content": system}]
        for i, utt in enumerate(dialog):
            role = "user" if i % 2 == 0 else "assistant"
            messages.append({"role": role, "content": str(utt).strip()})

        out.append({"messages": messages, "source": "personachat"})
        if max_samples and len(out) >= max_samples:
            break
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sarcasm_clean", type=str, required=True)
    ap.add_argument("--out", type=str, default="train_abstract.jsonl")
    ap.add_argument("--max_sarcasm", type=int, default=6000)
    ap.add_argument("--max_persona", type=int, default=8000)
    ap.add_argument("--persona_split", type=str, default="train")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--sarcasm_ratio", type=float, default=0.20, help="final ratio of sarcasm samples")
    args = ap.parse_args()

    sarcasm = read_sarcasm_clean(Path(args.sarcasm_clean), args.max_sarcasm)
    persona = personachat_to_samples(args.persona_split, args.max_persona, args.seed)

    random.seed(args.seed)
    random.shuffle(sarcasm)
    random.shuffle(persona)
    persona_count = len(persona)
    sarcasm_target = int(persona_count * args.sarcasm_ratio / (1 - args.sarcasm_ratio))
    sarcasm_target = min(sarcasm_target, len(sarcasm))
    final = persona[:persona_count] + sarcasm[:sarcasm_target]
    random.shuffle(final)

    out_path = Path(args.out)
    with out_path.open("w", encoding="utf-8") as w:
        for obj in final:
            w.write(json.dumps(obj, ensure_ascii=False) + "\n")

    print(f"[ABSTRACT] PersonaChat used: {persona_count}")
    print(f"[ABSTRACT] Sarcasm used: {sarcasm_target}")
    print(f"[ABSTRACT] Total: {len(final)} -> {out_path.resolve()}")

if __name__ == "__main__":
    main()
