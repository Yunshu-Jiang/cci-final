import argparse, json, random, re
from pathlib import Path
from datasets import load_dataset

DIALOG_SPLIT_RE = re.compile(r"[\t|]+")
PERSONA_RE = re.compile(r"(your persona:|partner's persona:)", re.IGNORECASE)

def extract_dialog_turns(text: str):
    """
    从 awsaf49/persona-chat 的 text 中提取对话轮次
    """
    if not isinstance(text, str):
        return []

    t = text.strip()

    # 跳过 persona-only 行
    if PERSONA_RE.search(t) and ("\t" not in t and "|" not in t):
        return []

    # 必须包含对话分隔符
    if "\t" not in t and "|" not in t:
        return []

    # 去掉开头的数字编号（如 "8 "）
    t = re.sub(r"^\d+\s*", "", t)

    parts = [p.strip() for p in DIALOG_SPLIT_RE.split(t) if p.strip()]
    return parts

def build_chat_pairs(turns):
    """
    turns = [u0, a0, u1, a1, ...]
    -> [(u0,a0), (u1,a1), ...]
    """
    pairs = []
    for i in range(len(turns) - 1):
        user = turns[i]
        assistant = turns[i + 1]
        if user and assistant:
            pairs.append((user, assistant))
    return pairs

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/training_model/data/personachat_dialog.jsonl")
    ap.add_argument("--max_pairs", type=int, default=20000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    ds = load_dataset("awsaf49/persona-chat", split="train")

    all_pairs = []

    for ex in ds:
        text = ex.get("text", "")
        turns = extract_dialog_turns(text)
        if len(turns) < 2:
            continue

        pairs = build_chat_pairs(turns)
        all_pairs.extend(pairs)

        if len(all_pairs) >= args.max_pairs:
            break

    rng.shuffle(all_pairs)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with out_path.open("w", encoding="utf-8") as f:
        for u, a in all_pairs[:args.max_pairs]:
            row = {
                "messages": [
                    {"role": "user", "content": u},
                    {"role": "assistant", "content": a},
                ],
                "source": "awsaf49_personachat_text"
            }
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"[OK] extracted dialog pairs: {len(all_pairs)}")
    print(f"[OK] output -> {out_path.resolve()}")

    if args.debug and all_pairs:
        print("[DEBUG] sample pair:")
        print("USER:", all_pairs[0][0])
        print("ASSISTANT:", all_pairs[0][1])

if __name__ == "__main__":
    main()
