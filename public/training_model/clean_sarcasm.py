# clean_sarcasm_csv.py
import argparse
import json
import re
from pathlib import Path

import pandas as pd

URL_RE = re.compile(r"https?://\S+|www\.\S+")
HTML_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
MD_CODE_RE = re.compile(r"`{1,3}.*?`{1,3}", re.DOTALL)
MD_QUOTE_RE = re.compile(r"^\s*>.*$", re.MULTILINE)

DELETED_MARKERS = {"[deleted]", "[removed]", "deleted", "removed", ""}

def clean_text(s: str) -> str:
    s = (s or "").strip()
    s = s.replace("\u200b", "")
    s = s.replace("“", '"').replace("”", '"').replace("’", "'").replace("‘", "'")

    s = HTML_RE.sub(" ", s)
    s = URL_RE.sub("", s)
    s = MD_CODE_RE.sub(" ", s)     # remove inline/code blocks
    s = MD_QUOTE_RE.sub(" ", s)    # remove quoted blocks

    s = WS_RE.sub(" ", s).strip()
    return s

def english_ratio(s: str) -> float:
    # rough heuristic: proportion of ASCII letters among all alphabetic chars
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return 0.0
    ascii_letters = sum(1 for c in letters if "a" <= c.lower() <= "z")
    return ascii_letters / len(letters)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=str, required=True, help="Path to train-balanced-sarcasm.csv")
    ap.add_argument("--out", type=str, default="sarcasm_clean.jsonl")

    ap.add_argument("--keep_only_sarcastic", action="store_true", help="keep label==1 only")
    ap.add_argument("--min_len", type=int, default=8)
    ap.add_argument("--max_len", type=int, default=280)

    ap.add_argument("--min_english_ratio", type=float, default=0.85)
    ap.add_argument("--dedup", action="store_true", help="deduplicate by (parent, comment)")
    ap.add_argument("--max_rows", type=int, default=0, help="0 means no limit (for quick tests)")
    args = ap.parse_args()

    df = pd.read_csv(args.csv)

    required = {"label", "comment", "parent_comment"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"CSV missing columns: {missing}. Found: {list(df.columns)}")

    out_path = Path(args.out)
    kept = 0
    total = 0
    seen = set()

    with out_path.open("w", encoding="utf-8") as w:
        for _, row in df.iterrows():
            total += 1
            if args.max_rows and total > args.max_rows:
                break

            try:
                label = int(row["label"])
            except Exception:
                continue

            if args.keep_only_sarcastic and label != 1:
                continue

            parent = clean_text(str(row["parent_comment"]) if pd.notna(row["parent_comment"]) else "")
            comment = clean_text(str(row["comment"]) if pd.notna(row["comment"]) else "")

            # drop deleted/removed/empty
            if parent.lower() in DELETED_MARKERS or comment.lower() in DELETED_MARKERS:
                continue

            # length filters
            if not (args.min_len <= len(parent) <= args.max_len):
                continue
            if not (args.min_len <= len(comment) <= args.max_len):
                continue

            # English heuristic
            if english_ratio(parent) < args.min_english_ratio:
                continue
            if english_ratio(comment) < args.min_english_ratio:
                continue

            # optional dedup
            if args.dedup:
                key = (parent, comment)
                if key in seen:
                    continue
                seen.add(key)

            w.write(
                json.dumps(
                    {
                        "label": label,
                        "parent_comment": parent,
                        "comment": comment,
                        # 可选保留一些“安全无隐私”的上下文信息
                        "subreddit": str(row.get("subreddit", "")) if pd.notna(row.get("subreddit", "")) else "",
                        "score": int(row.get("score", 0)) if pd.notna(row.get("score", 0)) else 0,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            kept += 1

    print(f"Processed rows: {total}")
    print(f"Kept rows: {kept}")
    print(f"Output -> {out_path.resolve()}")

if __name__ == "__main__":
    main()
