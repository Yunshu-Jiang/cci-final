import re
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel

BASE = "Qwen/Qwen2.5-1.5B-Instruct"
LORA_DIR = "lora_out"
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"

# 和 system 对齐：抽象 26，文雅 30
ZH_MAXLEN = {"abstract": 26, "literary": 50}
# 英文不按字符硬卡（你 system 没要求字数），主要保证一整句
# 如果你也想限制英文长度，可以加一个 EN_MAX_WORDS 映射
EN_MAX_WORDS = {"abstract": 24, "literary": 50}

def detect_lang(text: str) -> str:
    return "zh" if re.search(r"[\u4e00-\u9fff]", text or "") else "en"

def first_sentence(text: str, lang: str) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    if lang == "zh":
        m = re.search(r"[。！？]", t)  # 不依赖空格
        return t[: m.end()] if m else t
    else:
        m = re.search(r"[.!?]", t)    # 不依赖空格
        return t[: m.end()] if m else t

def trim_zh_to_limit(s: str, limit: int) -> str:
    """中文：超长时优先回退到逗号/顿号/分号，其次句号等句末，再不行才硬切"""
    s = s.strip()
    if not s:
        return s
    # 统一句末
    s = re.sub(r"[.!?]+$", "", s).strip()
    if not re.search(r"[。！？]$", s):
        s += "。"

    if len(s) <= limit:
        return s

    # 先截到 limit
    cut = s[:limit]

    # 回退到最近的自然断点（优先逗号/顿号/分号）
    candidates = [cut.rfind("，"), cut.rfind("、"), cut.rfind("；")]
    idx = max(candidates)
    if idx >= 6:  # 太短就别回退，避免只剩开头几个字
        cut = cut[:idx]
    else:
        # 其次回退到最近句号类（如果前面已经有）
        idx2 = max(cut.rfind("。"), cut.rfind("！"), cut.rfind("？"))
        if idx2 >= 6:
            cut = cut[:idx2]

    cut = cut.rstrip("，、；:：")  # 清理尾巴
    if not cut:
        cut = s[:limit].rstrip("，、；:：")

    # 强制句末
    cut = re.sub(r"[。！？.!?]*$", "", cut).strip() + "。"
    return cut

def trim_en_to_one_sentence_and_limit(s: str, max_words: int) -> str:
    """英文：先取第一句，再根据词数回退到最近的逗号/句号，最后补句号"""
    s = (s or "").strip()
    if not s:
        return s

    # 先只取第一句（不依赖空格）
    s = first_sentence(s, "en").strip()

    # 补句末标点
    if not re.search(r"[.!?]$", s):
        s += "."

    words = s.split()
    if len(words) <= max_words:
        return s

    # 超词数：先截断到 max_words
    cut = " ".join(words[:max_words])

    # 回退到最近的逗号或句号
    comma = cut.rfind(",")
    dot = max(cut.rfind("."), cut.rfind("!"), cut.rfind("?"))
    idx = max(comma, dot)
    if idx >= 20:
        cut = cut[:idx].rstrip(",")
    # 补句号
    cut = cut.strip()
    if not re.search(r"[.!?]$", cut):
        cut += "."
    return cut

def enforce_style(text: str, clicked_type: str, lang: str) -> str:
    if not text or not str(text).strip():
        if lang == "zh":
            return "没找到合适的回复那咋了？" if clicked_type == "abstract" else "我需要一点时间，麻烦你稍等一下。"
        return "Lowkey loading up, give me a sec." if clicked_type == "abstract" else "Just a moment while I collect a proper sentence."

    # 清理
    s = str(text).replace("#", "")
    s = re.sub(r"\s+", " ", s).strip()

    # 不依赖空格：取第一句
    s1 = first_sentence(s, lang).strip()

    if lang == "zh":
        limit = ZH_MAXLEN["abstract" if clicked_type == "abstract" else "literary"]
        return trim_zh_to_limit(s1, limit)

    # English
    maxw = EN_MAX_WORDS["abstract" if clicked_type == "abstract" else "literary"]
    return trim_en_to_one_sentence_and_limit(s1, maxw)

def system_prompt(clicked_type: str, lang: str, tier: int) -> str:
    T = int(tier)

    if clicked_type == "abstract":
        if lang == "zh":
            return f"""
你是一个受到网络流行语影响很深的中国青少年，说话里混杂很多网络梗与情绪碎片。

硬规则（必须遵守）：
- 用中文，只输出【一句话】。
- 这句话的字数不超过 26 个汉字。
- 不要使用表情符号，不要使用标签/井号，不要列表，不要 markdown。
- 句子里必须出现“我”或“他/她/他们”。

风格（按强度 TIER 调整，TIER={T}）：
- 在恰当处使用这些词：包的、那咋了、0人在意、yyds、你个老六、又能怎。
- 表达偏情绪化、碎片化，可以空洞。
- TIER 越高越跳跃越无厘头，但仍要像一句完整话。
""".strip()

        return f"""
You are an internet-native teen persona with meme-heavy slang.
HARD RULES:
- Output exactly ONE sentence in English.
- NO hashtags, NO emojis, NO lists, NO markdown.
- Keep it readable.
STYLE (TIER={T}):
- Higher tier => more absurd but still one grammatical sentence.
""".strip()

    # literary
    if lang == "zh":
        return f"""
你是一个礼貌、流畅、克制的中文叙述者。

硬规则（必须遵守）：
- 用中文，只输出【一句话】。
- 这一句话不超过 50 个汉字，必须完整，不要中间截断。
- 不要使用表情符号，不要使用标签/井号，不要列表，不要 markdown。

风格与逻辑（TIER={T}）：
- TIER 越高越长、更有逻辑。
- 语气克制但有温度，句法完整。
""".strip()

    return f"""
You are an elegant, polite literary voice in English.
HARD RULES:
- Output exactly ONE sentence in English.
- NO hashtags, NO emojis, NO lists, NO markdown.
- Use a logical connector like therefore/however/because/while/so.
- Only one sentence-ending punctuation mark total.
STYLE (TIER={T}):
- Higher tier = longer and more logically connected, but still one sentence.
""".strip()

def user_prompt(clicked_type: str, lang: str, tier: int, user_text: str) -> str:
    T = int(tier)
    if lang == "zh":
        if clicked_type == "abstract":
            return f"用户输入：{user_text}。请用中文写一句话（TIER={T}），第一人称，在恰当处使用包的/那咋了/0人在意/yyds/你个老六/又能怎等词。"
        return f"用户输入：{user_text}。请用中文写一句更有逻辑的话（TIER={T}），克制但有温度，表达对网络语言影响的反思。"
    else:
        if clicked_type == "abstract":
            return f"User input: {user_text} (TIER={T}). Reply in ONE English sentence with increasing absurdity as tier rises."
        return f"User input: {user_text} (TIER={T}). Reply in ONE English sentence, longer and more logically connected as tier rises, reflecting on how online language shapes young people."

def tier_from_count(count: int) -> int:
    return max(0, min(3, count // 5))

def sampling_params(clicked_type: str, tier: int):
    # 4) 收紧采样
    if clicked_type == "abstract":
        temp = min(1.05, 0.90 + 0.06 * tier)  # 封顶 1.05
        top_p = 0.88                          # 0.85~0.9
        max_new = 120 if tier >= 2 else 90
    else:
        temp = max(0.55, min(0.70, 0.70 - 0.05 * tier))  # 固定在 0.55~0.70
        top_p = 0.90
        max_new = 400

    return temp, top_p, max_new

def generate_one(model, tok, clicked_type: str, user_text: str, count_for_tier: int):
    lang = detect_lang(user_text)
    tier = tier_from_count(count_for_tier)

    messages = [
        {"role": "system", "content": system_prompt(clicked_type, lang, tier)},
        {"role": "user", "content": user_prompt(clicked_type, lang, tier, user_text)},
    ]
    prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tok(prompt, return_tensors="pt")
    if DEVICE != "cpu":
        inputs = {k: v.to(model.device) for k, v in inputs.items()}

    temperature, top_p, max_new = sampling_params(clicked_type, tier)

    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_new,
            do_sample=True,
            temperature=temperature,
            top_p=top_p,
            repetition_penalty=1.08,
            eos_token_id=tok.eos_token_id,
            pad_token_id=tok.eos_token_id,
        )

    # 5) 只 decode 新生成的那段
    prompt_len = inputs["input_ids"].shape[1]
    gen_ids = out[0][prompt_len:]
    candidate = tok.decode(gen_ids, skip_special_tokens=True).strip()

    final = enforce_style(candidate, clicked_type, lang)
    return lang, tier, final, candidate, temperature, top_p, max_new

def main():
    tok = AutoTokenizer.from_pretrained(BASE, use_fast=True)
    base = AutoModelForCausalLM.from_pretrained(
        BASE,
        torch_dtype=torch.float16,
        device_map={"": DEVICE} if DEVICE != "cpu" else "cpu",
    )
    model = PeftModel.from_pretrained(base, LORA_DIR)
    model.eval()

    tests = [
        ("abstract", "我今天有点焦虑，刷短视频停不下来", 15),
        ("literary", "我发现自己说话越来越像评论区", 15),
        ("abstract", "I keep doomscrolling and I can't stop", 10),
        ("literary", "I feel weirdly empty after repeating the same phrases", 15),
    ]

    for i, (t, user_text, cnt) in enumerate(tests, 1):
        lang, tier, final, raw, temp, top_p, max_new = generate_one(model, tok, t, user_text, cnt)
        print(f"\n=== TEST {i} | type={t} lang={lang} tier={tier} temp={temp:.2f} top_p={top_p:.2f} max_new={max_new} ===")
        print(final)
        # 需要对照原始生成输出就打开：
        # print("---- raw ----")
        # print(raw)

if __name__ == "__main__":
    main()
