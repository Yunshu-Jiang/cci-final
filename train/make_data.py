import json, random, pathlib

OUT = pathlib.Path("data_train.jsonl")

random.seed(42)

# 你要训练的新功能是“用户输入一句话 -> AI 反馈一句话”
ZH_INPUTS = [
  "我觉得刷短视频很上瘾，停不下来。",
  "现在的小孩聊天总在复读梗，我有点不舒服。",
  "我觉得我越来越难专心读书了。",
  "网络用语有时候已经替代了正常的表达",
  "我想表达难过，但说出来总像玩笑。",
  "父母不懂我在说什么，我也懒得解释。",
  "我不喜欢小孩用网络用语聊天。",
  "我睡前总想再刷五分钟，结果又一小时。",
  "我不想被同龄人笑话，可我也不想学习那些不好的话。",
  "老师说我说话没礼貌，但我只是学来的。",
  "我觉得用网络用语回答别人的话很敷衍。",
  "我觉得网上的语气会跟着我走到现实里。",
  "我想改变，但那些孩子总觉得无所谓。",
  "我感觉越来越难和现在的小孩沟通。",
  "我喜欢热闹，但也怕自己变得空洞。",
  "我说话越来越快，像在剪短视频。",
  "我在群里不说梗就像插不上话。",
  "我说的很多话，自己回头看也觉得冷。",
  "我不希望在日常交流中只听到网络用语",
  "我担心弟弟妹妹只会网络用语。",
]

EN_INPUTS = [
  "I keep doomscrolling and I can't stop.",
  "My friends talk in memes all day and it sticks to me.",
  "I feel like my attention span is getting worse.",
  "I speak harsher online than I mean to.",
  "I want to say I'm sad but it comes out like a joke.",
  "I copy slang to fit in, then I forget how to talk normally.",
  "I feel like those brainrot things just stay in my mind.",
  "I try to study, but short videos keep pulling me back.",
  "I feel weirdly empty after hearing kids repeating the same phrases.",
  "I worry kids will learn too much slangs from internet.",
]

SLANG_ZH = ["包的", "那咋了", "0人在意", "yyds", "你个老六", "又能怎"]
CONNECT_ZH = ["因此", "所以", "然而", "不过", "于是", "同时", "即便"]

SLANG_EN = ["lowkey", "ngl", "meme-coded", "vibe", "sigma", "rizz", "brainrot"]
CONNECT_EN = ["therefore", "however", "because", "while", "so"]

def one_sentence_cleanup(s: str) -> str:
    s = s.strip().replace("\n", " ")
    # 保证一句
    for cut in ["\n"]:
        s = s.split(cut)[0]
    # 统一句末标点
    if any(ch in s for ch in "。！？"):
        # 已有中文句末
        pass
    elif any(ch in s for ch in ".!?"):
        pass
    else:
        s += "。"
    return s

def zh_abstract_reply(user_text: str, tier: int) -> str:
    # tier 越高越碎片、越跳跃
    picks = random.sample(SLANG_ZH, 2 if tier <= 1 else 3)
    core = "我" + random.choice(["也就这样", "真的麻了", "就挺无语", "有点绷不住", "反正随便"])
    tail = random.choice([
        "别问", "别管", "懂的都懂", "真没必要", "说了你也不懂"
    ])
    extra = "" if tier == 0 else random.choice(["，就这样吧", "，那又怎样", "，唉"])
    s = f"{core}，{picks[0]}{extra}，{picks[1]}，{tail}{random.choice(['。','！'])}"
    # 确保包含我/他她他们之一
    if "我" not in s and not any(x in s for x in ["他", "她", "他们"]):
        s = "我" + s
    # 控长：不超过 26 字左右（粗略）
    if len(s) > 26:
        # 优先在逗号前截
        parts = s.split("，")
        s2 = "，".join(parts[:2]).strip()
        if not s2.endswith(("。","！","？")): s2 += "。"
        s = s2
    return one_sentence_cleanup(s)

def zh_literary_reply(user_text: str, tier: int) -> str:
    conn = random.choice(CONNECT_ZH)
    # tier 越高越长更完整
    if tier == 0:
        s = f"我理解你的感受，{conn}先把注意力收回当下。"
    elif tier == 1:
        s = f"我理解你的焦虑，{conn}需要给语言与情绪留出更安静的空间。"
    elif tier == 2:
        s = f"我理解这种被信息牵引的失控感，{conn}越是反复刷到这些信息，越容易陷得更深"
    else:
        s = f"我理解这种被短促刺激拖拽的疲惫，{conn}当语言只剩复读与嘲讽时，性格也变得更加尖锐了。"
    # 控长：<=50
    if len(s) > 50:
        s = s[:48].rstrip("，、；：") + "。"
    return one_sentence_cleanup(s)

def en_abstract_reply(user_text: str, tier: int) -> str:
    picks = random.sample(SLANG_EN, 2 if tier <= 1 else 3)
    if tier == 0:
        s = f"I get it, {picks[0]} my brain is tired, but I keep scrolling anyway."
    elif tier == 1:
        s = f"I get it, {picks[0]} this feels {picks[1]}, and I still repeat it like a reflex."
    elif tier == 2:
        s = f"Ngl my head is {picks[0]} {picks[1]}, and reality starts buffering for no reason."
    else:
        s = f"Lowkey I'm {picks[0]} {picks[1]} {picks[2]}, and the meaning just evaporates mid-sentence."
    # 一句 + 句末
    if not s.endswith((".", "!", "?")):
        s += "."
    return s

def en_literary_reply(user_text: str, tier: int) -> str:
    c = random.choice(CONNECT_EN)
    if tier == 0:
        s = f"I hear you, {c} it may help to slow down and name what you actually feel."
    elif tier == 1:
        s = f"I hear you, {c} a gentler rhythm can make your thoughts feel less scattered."
    elif tier == 2:
        s = f"I hear you, {c} the more repeatedly we meet such information, the deeper we are likely to get trapped."
    else:
        s = f"I hear you, {c} when language is reduced to repetition and ridicule, will personality also become more shallow?"
    if not s.endswith((".", "!", "?")):
        s += "."
    return s

def system_prompt(style: str, tier: int, lang: str) -> str:
    if lang == "zh" and style == "abstract":
        return (
            f"类型=abstract，强度=tier{tier}，语言=zh。"
            "你是受中文网络流行语影响很深的青少年。"
            "只输出一句中文，不超过26字，不要表情不要标签。"
            "必须出现我/他/她/他们之一。"
            "尽量包含包的、那咋了、0人在意、yyds、你个老六、又能怎中至少一个。"
            "tier 越高越碎片越无厘头但仍是一句完整话。"
        )
    if lang == "zh" and style == "literary":
        return (
            f"类型=literary，强度=tier{tier}，语言=zh。"
            "你是礼貌流畅克制的中文叙述者。"
            "只输出一句中文，不超过50字，不要表情不要标签。"
            "尽量使用因此/所以/然而/不过/于是/同时/即便等连接词之一，tier 越高越长越有逻辑。"
        )
    if lang == "en" and style == "abstract":
        return (
            f"Type=abstract, Tier={tier}, Language=en. "
            "You are an internet-native teen persona. Output exactly one English sentence. "
            "No emojis, no hashtags, no lists, no markdown. Higher tier means more absurd but still grammatical."
        )
    return (
        f"Type=literary, Tier={tier}, Language=en. "
        "You are an elegant, polite literary voice. Output exactly one English sentence. "
        "No emojis, no hashtags, no lists, no markdown. Use logical connectors; higher tier is longer and clearer."
    )

def make_example(style: str, tier: int, lang: str) -> dict:
    if lang == "zh":
        user_text = random.choice(ZH_INPUTS)
        assistant = zh_abstract_reply(user_text, tier) if style == "abstract" else zh_literary_reply(user_text, tier)
        user = f"用户输入：{user_text}"
    else:
        user_text = random.choice(EN_INPUTS)
        assistant = en_abstract_reply(user_text, tier) if style == "abstract" else en_literary_reply(user_text, tier)
        user = f"User input: {user_text}"

    return {
        "messages": [
            {"role": "system", "content": system_prompt(style, tier, lang)},
            {"role": "user", "content": user},
            {"role": "assistant", "content": assistant},
        ]
    }

def main():
    rows = []
    # 目标：abstract/literary × tier0-3 × zh/en，各 100 条，总计 800
    for style in ["abstract", "literary"]:
        for tier in [0, 1, 2, 3]:
            for lang in ["zh", "en"]:
                for _ in range(50):
                    rows.append(make_example(style, tier, lang))

    random.shuffle(rows)
    with OUT.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"wrote {len(rows)} lines to {OUT}")

if __name__ == "__main__":
    main()
