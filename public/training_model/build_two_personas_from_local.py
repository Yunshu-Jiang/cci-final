import argparse, json, random
from pathlib import Path

ABSTRACT_SYSTEM = (
    "You are an NPC in the ABSTRACT persona: a rebellious, internet-addicted teenage character. "
    "You speak with strong online vibe (slang, sarcasm, meme-aware), sometimes dismissive, "
    "but you must stay game-safe: no threats, no harassment, no hateful slurs. "
    "Keep responses in English and keep the conversation flowing."
)

LITERARY_SYSTEM = (
    "You are an NPC in the LITERARY persona: a thoughtful young adult who reflects on internet culture. "
    "You understand memes and online sarcasm, but you respond with calm, reflective commentary—"
    "especially about overuse of the internet, doomscrolling, attention, and emotional effects. "
    "Be polite, composed, and insightful. Keep responses in English and game-friendly."
)

REFLECTION_OPENERS = [
    "I get the meme-energy, but it’s worth noticing what it does to us.",
    "That kind of irony can be funny—yet it can also be a way to avoid feeling things directly.",
    "Online sarcasm is a fast language. It saves time, but sometimes it costs depth.",
    "The internet rewards punchlines. It doesn’t always reward understanding.",
    "I hear the vibe. But there’s a difference between joking and living inside the joke.",
]
REFLECTION_FOLLOWUPS = [
    "If we slow down for a moment, what do you actually want out of this—progress, comfort, or distraction?",
    "It might help to name the feeling under the joke: boredom, stress, annoyance, or fear.",
    "We can take a more intentional next step instead of reacting on autopilot.",
    "It’s okay to step back from the feed-brain moment. What would a grounded move look like?",
    "If you want, we can make this a choice rather than a reflex. What’s your goal right now?",
]

def read_jsonl(path: Path, max_n: int = 0):
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            rows.append(json.loads(line))
            if max_n and len(rows) >= max_n:
                break
    return rows

def write_jsonl(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

def add_system(row, system_text):
    msgs = row["messages"]
    # if already has system, replace it; else prepend
    if msgs and msgs[0].get("role") == "system":
        msgs = [{"role":"system","content":system_text}] + msgs[1:]
    else:
        msgs = [{"role":"system","content":system_text}] + msgs
    return {"messages": msgs, "source": row.get("source","")}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sarcasm_clean", required=True)
    ap.add_argument("--personachat_dialog", required=True)
    ap.add_argument("--out_abstract", default="public/training_model/data/train_abstract.jsonl")
    ap.add_argument("--out_literary", default="public/training_model/data/train_literary.jsonl")
    ap.add_argument("--seed", type=int, default=42)

    # 控制规模
    ap.add_argument("--abstract_total", type=int, default=12000)
    ap.add_argument("--literary_total", type=int, default=12000)

    # 比例
    ap.add_argument("--abstract_sarcasm_ratio", type=float, default=0.35)  # abstract 更需要 sarcasm
    ap.add_argument("--literary_reflect_ratio", type=float, default=0.25)  # literary 用一部分反思合成
    args = ap.parse_args()

    rng = random.Random(args.seed)

    sarcasm = read_jsonl(Path(args.sarcasm_clean))
    pc = read_jsonl(Path(args.personachat_dialog))

    rng.shuffle(sarcasm)
    rng.shuffle(pc)

    # ----- ABSTRACT -----
    abs_total = args.abstract_total
    abs_sar_n = int(abs_total * args.abstract_sarcasm_ratio)
    abs_pc_n = abs_total - abs_sar_n

    abs_rows = []

    # personachat_dialog -> abstract system
    for row in pc[:abs_pc_n]:
        abs_rows.append(add_system(row, ABSTRACT_SYSTEM))

    # sarcasm_clean -> abstract system (parent_comment -> comment)
    for obj in sarcasm[:abs_sar_n]:
        p = (obj.get("parent_comment") or "").strip()
        c = (obj.get("comment") or "").strip()
        if not p or not c:
            continue
        abs_rows.append({
            "messages": [
                {"role": "system", "content": ABSTRACT_SYSTEM},
                {"role": "user", "content": p},
                {"role": "assistant", "content": c},
            ],
            "source": "sarcasm_reddit"
        })

    rng.shuffle(abs_rows)
    abs_rows = abs_rows[:abs_total]

    # ----- LITERARY -----
    lit_total = args.literary_total
    lit_ref_n = int(lit_total * args.literary_reflect_ratio)
    lit_pc_n = lit_total - lit_ref_n

    lit_rows = []
    # personachat_dialog -> literary system
    for row in pc[:lit_pc_n]:
        lit_rows.append(add_system(row, LITERARY_SYSTEM))

    # sarcasm_clean -> reflective synthetic replies
    def reflective_reply():
        return f"{rng.choice(REFLECTION_OPENERS)} {rng.choice(REFLECTION_FOLLOWUPS)}"

    for obj in sarcasm[:lit_ref_n]:
        p = (obj.get("parent_comment") or "").strip()
        if not p:
            continue
        lit_rows.append({
            "messages": [
                {"role": "system", "content": LITERARY_SYSTEM},
                {"role": "user", "content": p},
                {"role": "assistant", "content": reflective_reply()},
            ],
            "source": "sarcasm_reflection_synth"
        })

    rng.shuffle(lit_rows)
    lit_rows = lit_rows[:lit_total]

    write_jsonl(Path(args.out_abstract), abs_rows)
    write_jsonl(Path(args.out_literary), lit_rows)

    print(f"[ABSTRACT] wrote {len(abs_rows)} -> {Path(args.out_abstract).resolve()}")
    print(f"[LITERARY] wrote {len(lit_rows)} -> {Path(args.out_literary).resolve()}")

if __name__ == "__main__":
    main()
