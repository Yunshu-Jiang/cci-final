# build_literary_db.py
import argparse, json, random
from pathlib import Path
from datasets import load_dataset

LITERARY_SYSTEM = (
    "You are an NPC in the LITERARY persona: a thoughtful young adult who reflects on internet culture. "
    "You understand memes and online sarcasm, but you respond with calm, reflective commentary—"
    "especially about overuse of the internet, doomscrolling, attention, and emotional effects. "
    "Be polite, composed, and insightful. Keep responses in English and game-friendly."
)

REFLECTION_TEMPLATES = [
    "I get the joke, but it’s kind of telling how we default to irony. Sometimes it’s a shield for real feelings. {bridge}",
    "That meme-energy is funny for a second, but it can also turn everything into noise. {bridge}",
    "Online sarcasm works like a shortcut—quick laughs, less vulnerability. But it can keep us stuck. {bridge}",
    "It’s interesting how the internet trains us to react instead of reflect. {bridge}",
    "There’s humor here, but also fatigue. When everything becomes content, it’s hard to stay present. {bridge}",
]

BRIDGES = [
    "If you want, we can slow down and figure out what you actually need next.",
    "What are you hoping to achieve in this moment—progress, comfort, or just distraction?",
    "If we step back for a second, what would be the most grounded next move?",
    "It might help to name the feeling underneath the joke—annoyance, boredom, fear?",
    "Either way, I’m here. What do you want to do next?",
]

def make_reflective_reply(parent: str, original: str, rng: random.Random) -> str:
    # We do NOT quote the whole original comment verbatim to avoid turning into a pure sarcasm model.
    # We keep it “inspired by” the vibe and steer into reflection.
    t = rng.choice(REFLECTION_TEMPLATES)
    bridge = rng.choice(BRIDGES)
    # Small hint of context without copying the sarcasm line
    context_hint = ""
    if len(parent) > 0:
        context_hint = " Given what you said, "
    return (t.format(bridge=bridge) + context_hint + "I think it’s worth choosing intention over autopilot.").strip()

def read_sarcasm_to_reflections(path: Path, max_samples: int, seed: int):
    rng = random.Random(seed)
    items = []
    with path.open("r", encoding="utf-8") as r:
        for line in r:
            obj = json.loads(line)
            parent = (obj.get("parent_comment") or "").strip()
            comment = (obj.get("comment") or "").strip()
            if not parent or not comment:
                continue

            reflective = make_reflective_reply(parent, comment, rng)
            items.append({
                "messages": [
                    {"role": "system", "content": LITERARY_SYSTEM},
                    {"role": "user", "content": parent},
                    {"role": "assistant", "content": reflective},
                ],
                "source": "sarcasm_reflection_synthetic"
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
        system = LITERARY_SYSTEM + "\n\n" + persona_text

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
    ap.add_argument("--out", type=str, default="train_literary.jsonl")
    ap.add_argument("--max_sarcasm_reflect", type=int, default=4000)
    ap.add_argument("--max_persona", type=int, default=9000)
    ap.add_argument("--persona_split", type=str, default="train")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--sarcasm_ratio", type=float, default=0.15, help="final ratio of reflective sarcasm-derived samples")
    args = ap.parse_args()

    reflect = read_sarcasm_to_reflections(Path(args.sarcasm_clean), args.max_sarcasm_reflect, args.seed)
    persona = personachat_to_samples(args.persona_split, args.max_persona, args.seed)

    random.seed(args.seed)
    random.shuffle(reflect)
    random.shuffle(persona)

    persona_count = len(persona)
    reflect_target = int(persona_count * args.sarcasm_ratio / (1 - args.sarcasm_ratio))
    reflect_target = min(reflect_target, len(reflect))
    final = persona[:persona_count] + reflect[:reflect_target]
    random.shuffle(final)

    out_path = Path(args.out)
    with out_path.open("w", encoding="utf-8") as w:
        for obj in final:
            w.write(json.dumps(obj, ensure_ascii=False) + "\n")

    print(f"[LITERARY] PersonaChat used: {persona_count}")
    print(f"[LITERARY] Sarcasm->Reflection used: {reflect_target}")
    print(f"[LITERARY] Total: {len(final)} -> {out_path.resolve()}")

if __name__ == "__main__":
    main()
