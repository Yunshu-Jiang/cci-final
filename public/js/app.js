import './ui/anim.js';
import './bg/p5-scene.js';
import { ensureAI, chatOnce } from './ai-webllm.js';

const wrapEl = document.getElementById('wrap');
const cloudEl = document.getElementById('cloud');
const resetBtn = document.getElementById('reset-btn');
const phaseTitleEl = document.getElementById('phase-title');
const selectedCounterEl = document.getElementById('selected-counter');
const selectedListEl = document.getElementById('selected-list');
const chatBarEl = document.getElementById('chat-bar');
const chatInputEl = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const SEND_BTN_DEFAULT_TEXT = sendBtn?.textContent || "Send";
const endBtn = document.getElementById('end-btn');
const historyBtn = document.getElementById('history-btn');
const historyDrawer = document.getElementById('history-drawer');
const historyBackdrop = document.getElementById('history-backdrop');
const historyClose = document.getElementById('history-close');
const historyList = document.getElementById('history-list');
const resultModal = document.getElementById('result-modal');
const resultBackdrop = document.getElementById('result-backdrop');
const resultClose = document.getElementById('result-close');
const restartBtn = document.getElementById('restart-btn');
const resultTitle = document.getElementById('result-title');
const resultSummary = document.getElementById('result-summary');
const resultWords = document.getElementById('result-words');
const modelHintModal = document.getElementById('model-hint');
const modelHintBackdrop = document.getElementById('model-hint-backdrop');
const modelHintOk = document.getElementById('model-hint-ok');
const modelHintText = document.getElementById('model-hint-text');
// const HARD_BAN_PHRASES_EN = [
//   "the internet rewards punchlines.",
//   "but memes are so much fun!"
// ];


function press(el){ window.__press && window.__press(el); }
function bubble(text, opts){ window.__bubble && window.__bubble(text, opts); }
function swapTheme(theme){ window.__swapTheme && window.__swapTheme(theme); }

const chatReplyEl = document.getElementById("chat-reply");

function setChatReply(text, { isLoading = false } = {}) {
  if (!chatReplyEl) return;
  chatReplyEl.textContent = text || "";
  chatReplyEl.style.opacity = isLoading ? "0.75" : "1";
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

function renderFeedChipsHTML(selectedWords) {
  const chosen = (selectedWords || []).map((w) => `
    <span class="feed-chip" data-chip-id="${escapeHtml(w.id)}">
      ${escapeHtml(w.text)} <span class="x">×</span>
    </span>
  `).join("");

  const empties = Array.from({ length: Math.max(0, 5 - (selectedWords?.length || 0)) })
    .map(() => `<span class="feed-chip feed-chip--empty">＋</span>`)
    .join("");

  return chosen + empties;
}

function updateFeedingBubble(noteText = null) {
  const n = STATE.selectedWords.length;
  const chipsHTML = renderFeedChipsHTML(STATE.selectedWords || []);
  const hint = noteText
    ? noteText
    : (n === 0
      ? "点击词语开始投喂 / Click words to feed"
      : `已选 ${n}/5，继续选择 / Selected ${n}/5, keep picking`);

  bubble("", {
    html: `
      <div class="bubble-chips">${chipsHTML}</div>
      <div class="bubble-hint">${escapeHtml(hint)}</div>
    `,
    isLoading: false,
  });
}

document.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-chip-id]");
  if (!chip) return;
  if (STATE.phase !== "FEEDING") return;

  const id = chip.dataset.chipId;
  STATE.selectedWords = (STATE.selectedWords || []).filter((w) => w.id !== id);
  renderSelectedBar();
  updateFeedingBubble();
});

const MAX_FEED = 5;
const MAX_TURNS = 5;

const STATE = {
  phase: "FEEDING",
  selectedWords: [],
  persona: null,
  chatHistory: [],
  chatTurnCount: 0,
  maxTurns: MAX_TURNS,
  languageMode: "zh",
  isGenerating: false,
  endReason: null,
  reqId: 0
};

function detectLanguage(text, prev = "zh"){
  const s = String(text || "");
  if (/[\u4e00-\u9fff]/.test(s)) return "zh";
  if (/[A-Za-z]/.test(s)) return "en";
  return prev || "zh";
}

function normType(t){
  if (t === "abstract") return "abstract";
  if (t === "elegant") return "elegant";
  if (t === "literary") return "elegant";
  return "elegant";
}

function personaToTheme(persona){
  if (persona === "abstract") return "abstract";
  if (persona === "elegant") return "literary";
  return "neutral";
}

// function enforceOneSentence(raw, lang, persona){
//   let s = String(raw || "").replace(/\r/g,"").trim();
//   if (!s) return lang === "zh" ? "我需要一点时间整理一下。"
//                                : "Give me a moment to put it into one sentence.";

//   s = s.split("\n").map(x=>x.trim()).filter(Boolean).join(" ");
//   s = s.replace(/#/g,"").replace(/\s{2,}/g," ").trim();

//   if (lang === "zh") {
//     const m = s.match(/^(.+?[。！？])/);
//     let out = (m ? m[1] : s);
//     out = out.replace(/[.!?]+$/g, "").trim();
//     if (!/[。！？]$/.test(out)) out += "。";

//     const max = persona === "abstract" ? 35 : 45;
//     if (out.length > max) {
//       const cut = out.slice(0, max);
//       const idx = Math.max(
//         cut.lastIndexOf("。"),
//         cut.lastIndexOf("，"),
//         cut.lastIndexOf("、"),
//         cut.lastIndexOf("；")
//       );
//       const use = idx >= 10 ? cut.slice(0, idx) : cut;
//       out = use.replace(/[，、；。]+$/,"").trim() + "。";
//     }
//     return out;
//   }

//   const m = s.match(/^(.+?[.!?])/);
//   let out = (m ? m[1] : s);
//   out = out.trim();
//   if (!/[.!?]$/.test(out)) out += ".";

//   const maxWords = persona === "abstract" ? 22 : 25;
//   const words = out.split(/\s+/);
//   if (words.length > maxWords) {
//     out = words.slice(0, maxWords).join(" ");
//     out = out.replace(/[.!?]*$/,"").trim() + ".";
//   }
//   return out;
// }

function renderPhaseTitle(){
  if (!phaseTitleEl) return;
  if (STATE.phase === "FEEDING") {
    phaseTitleEl.innerHTML =
      `你想让它听到什么 <span class="sub">What do you want it to hear?</span>` +
      `<span class="hint">选择 5 个词 / Pick exactly 5 words</span>`;
  } else if (STATE.phase === "CHAT") {
    phaseTitleEl.innerHTML =
      `关于互联网，你有什么想和他说 <span class="sub">What do you want to tell it about the internet?</span>` +
      `<span class="hint">最多 5 轮 / Up to 5 turns</span>`;
  } else {
    phaseTitleEl.innerHTML =
      `人格档案 <span class="sub">Persona Record</span>` +
      `<span class="hint">查看总结 / Review</span>`;
  }
}

function isSelected(id){
  return STATE.selectedWords.some(w => w.id === id);
}

function renderSelectedBar(){
  if (!selectedCounterEl || !selectedListEl) return;
  selectedCounterEl.textContent = `${STATE.selectedWords.length}/${MAX_FEED}`;
  selectedListEl.innerHTML = "";

  STATE.selectedWords.forEach(w => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.title = "点击移除 / click to remove";
    chip.innerHTML = `<span>${w.text}</span><span class="x">×</span>`;
    chip.addEventListener("click", () => {
      press(chip);
      removeSelected(w.id);
    });
    selectedListEl.appendChild(chip);
  });

  document.querySelectorAll(".tag").forEach(el => {
    el.classList.toggle("selected", isSelected(el.dataset.id));
  });
}

function addSelected(word){
  if (STATE.selectedWords.length >= MAX_FEED) {
    updateFeedingBubble("已选满 5 个词 / 5 words selected");
    return;
  }
  STATE.selectedWords.push(word);
  renderSelectedBar();
  updateFeedingBubble();

  if (STATE.selectedWords.length === MAX_FEED) {
    submitFeeding();
  }
}

function removeSelected(id){
  STATE.selectedWords = STATE.selectedWords.filter(w => w.id !== id);
  renderSelectedBar();
  updateFeedingBubble();
}

function setPhase(phase){
  STATE.phase = phase;
  if (wrapEl) wrapEl.dataset.phase = phase;
  renderPhaseTitle();
}

function decidePersonaFrom5(){
  const a = STATE.selectedWords.filter(w => w.type === "abstract").length;
  const e = MAX_FEED - a;
  return (a > e) ? "abstract" : "elegant";
}

function enterChat(){
  STATE.chatHistory = [];
  STATE.chatTurnCount = 0;
  STATE.isGenerating = false;
  STATE.endReason = null;
  clearViewCardMode();
  setPhase("CHAT");
  setChatReply(
    STATE.languageMode === "zh"
      ? "Tell me anything, but try to keep it to one sentence."
      : "Tell me anything, but try to keep it to one sentence."
  );

  if (chatInputEl) chatInputEl.focus();
  updateChatButtons();
}

function submitFeeding(){
  STATE.persona = decidePersonaFrom5();
  swapTheme(personaToTheme(STATE.persona));
  enterChat();
}

function openHistory(){
  if (STATE.phase !== "CHAT") return;
  renderHistoryList();
  historyDrawer.classList.add("open");
}
function closeHistory(){
  historyDrawer.classList.remove("open");
}
function renderHistoryList(){
  historyList.innerHTML = "";
  STATE.chatHistory.forEach(m => {
    const div = document.createElement("div");
    div.className = "msg " + (m.role === "user" ? "user" : "assistant");
    div.textContent = (m.role === "user" ? "You: " : "AI: ") + m.text;
    historyList.appendChild(div);
  });
  historyList.scrollTop = historyList.scrollHeight;
}

// ===== AI PROMPT + GENERATION (drop-in replacement) =====

// ===== AI PROMPT + GENERATION (drop-in replacement) =====

// 0) 一些小工具 + 硬禁止短句

const HARD_BAN_PHRASES_EN = [
  "the internet rewards punchlines.",
  "the internet rewards punchlines"
];

// function _normText(s = "") {
//   return String(s).toLowerCase().replace(/\s+/g, " ").trim();
// }

// // 1) 简单“坏输出”检测：辱骂/自辱/太短/半句/跑题/硬禁止句
// // 一些轻量的“坏输出”检测：辱骂/自辱/明显半句/太短/明显跑题
// // 现在多了 persona 参数：abstract 严一点，elegant 放宽关键词对齐
// function looksBadAnswer(text, lang, userText, persona = "abstract") {
//   const s = String(text || "").trim();
//   const u = String(userText || "").trim();

//   if (!s) return true;

//   // 太短：像口癖/敷衍（英文 < 6 词；中文 < 8 字）
//   if (lang === "en") {
//     const wc = s.split(/\s+/).filter(Boolean).length;
//     if (wc < 6) return true;
//   } else {
//     if (s.replace(/\s/g, "").length < 8) return true;
//   }

//   // 明显半句/截断感
//   if (/[,:;—]\s*$/.test(s)) return true;
//   if (/\b(what if you|what if i|and then|because i)\b/i.test(s) && !/[.!?]$/.test(s)) {
//     return true;
//   }

//   // 侮辱/攻击/自辱（简化词表）
//   const toxic = [
//     "idiot", "stupid", "dumb", "moron", "shut up", "ashamed", "asshole", "fuck",
//     "ugly", "i'm ugly", "im ugly", "i am ugly",
//     "i'm short", "im short", "i am short",
//     "kill yourself", "kys",
//     "傻逼", "傻b", "蠢", "滚", "去死", "废物", "脑残", "你有病"
//   ];
//   const lower = s.toLowerCase();
//   if (toxic.some(w => lower.includes(w) || s.includes(w))) return true;

//   // 显式 ban 掉“只有这一句 punchlines”的情况（抽象/文雅都适用）
//   if (lang === "en") {
//     const lp = lower.trim();
//     if (lp === "the internet rewards punchlines.") {
//       return true;
//     }
//   }

//   // ===== 关键词对齐：现在只对 abstract 开启，elegant 不再强制 =====
//   if (lang === "en" && persona === "abstract") {
//     const userKeywords = u
//       .toLowerCase()
//       .replace(/[^a-z0-9\s]/g, " ")
//       .split(/\s+/)
//       .filter(w => w.length >= 4)   // 去掉太短词
//       .slice(0, 8);                 // 不要太多

//     if (userKeywords.length >= 3) {
//       const hit = userKeywords.some(w => lower.includes(w));
//       if (!hit) return true;        // 抽象 persona 下，完全不对齐就视为“跑题”
//     }
//   }

//   return false;
// }


// // 2) 判断是否和最近两条 AI 输出“几乎一样”
// function isNearDuplicateAnswer(answer, history) {
//   const a = _normText(answer);
//   if (!a) return false;

//   const lastAI = (history || []).filter(m => m.role === "assistant").slice(-2);
//   if (!lastAI.length) return false;

//   const norm = (s) =>
//     _normText((s && s.content) || s && s.text || s || "");

//   const na = a;

//   for (const m of lastAI) {
//     const nh = norm(m);
//     if (!nh) continue;
//     if (na === nh) return true;
//     if (na.length && nh.length && (na.includes(nh) || nh.includes(na))) {
//       return true;
//     }
//   }

//   // Jaccard 词重合度（英文更有效）
//   const last = lastAI[lastAI.length - 1];
//   const h = norm(last);
//   if (h && na) {
//     const A = new Set(na.split(" ").filter(w => w.length >= 3));
//     const H = new Set(h.split(" ").filter(w => w.length >= 3));
//     if (A.size >= 6 && H.size >= 6) {
//       let inter = 0;
//       for (const w of A) if (H.has(w)) inter++;
//       const jacc = inter / (A.size + H.size - inter);
//       if (jacc >= 0.7) return true;
//     }
//   }

//   return false;
// }

// 3) system prompt：加“必须回应/禁止辱骂自辱/不清楚就追问/不复读”
function buildSystemPrompt(persona, lang) {
  const HARD_ZH = `
硬规则（必须遵守）：
- 必须直接回应用户这句话的核心问题/观点，不能答非所问或突然换话题。
- 禁止辱骂、嘲讽、攻击用户；禁止自辱、自我贬损。
- 如果用户信息不足，用一句话追问澄清，不要编造。
- 可以利用对话上下文，但不要复读你自己上一轮的话；要补充新信息或换角度。
- 只输出一句话：不要换行、不要列表、不要表情、不要井号。
`.trim();

  const HARD_EN = `
Hard rules (must follow):
- You MUST respond to the user's message directly; do not change topics.
- No insults, harassment, or self-deprecation.
- If the user's message is unclear, ask ONE clarifying question (still one sentence).
- You may use chat context, but do not repeat or rephrase your previous sentence; add new substance or a new angle.
- Output exactly ONE sentence: no newlines, no lists, no emojis, no hashtags.
`.trim();

  if (lang === "zh") {
    if (persona === "abstract") {
      return `
${HARD_ZH}

你是一个被中文互联网流行语长期包围的青少年，说话更网感、更碎、更情绪化，但仍可读。
主题范围：互联网、短视频、评论区语言、注意力、表达习惯的影响（不要跑题成泛鸡汤）。
长度：20–35 个汉字，结尾用句号/问号。
风格：更口语、更梗化、更跳跃，但要像一句完整的话。
`.trim();
    }
    return `
${HARD_ZH}

你是一个克制、连贯、温和但清醒的中文叙述者，强调逻辑与连接词。
主题范围：互联网、短视频、语言习惯、注意力、表达方式的影响（不要跑题）。
尽量包含“因为/所以/然而/不过/因此/即便”之一，让因果或转折更清晰。
长度：28–45 个汉字，结尾用句号/问号。
`.trim();
  }

  if (persona === "abstract") {
    return `
${HARD_EN}

You are an internet-native teen voice: meme-coded, jumpy, a bit fragmented, but still readable.
Topic only: internet, short-form video, comment-section language, attention, expression habits.
Length: 12–22 words, end with punctuation.
`.trim();
  }

  return `
${HARD_EN}

You are a calm, coherent, reflective voice with gentle logic.
Topic only: internet, short-form video, language habits, attention, expression.
Use a connector such as because/therefore/however/while/so.
Length: 16–25 words, end with punctuation.
`.trim();
}

// 4) user prompt：强调“直接回应这句”
function buildUserPrompt(lang, userText) {
  return lang === "zh"
    ? `用户说：「${userText}」。请直接回应这句话，只输出一句话。`
    : `User message: "${userText}". Reply with exactly ONE sentence that directly addresses it.`;
}

// 5) 所有重试都失败时的兜底句（完全不用模型）
// ===== AI PROMPT + GENERATION（从这里开始整段替换）=====

// 小工具：归一化文本，用于重复检测
function _normText(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 简单相似度：检查回复是否和最近几条太像
function isNearDuplicateAnswer(answer, history) {
  const a = _normText(answer);
  if (!a) return false;

  const lastAI = (history || [])
    .filter((m) => m.role === "assistant")
    .slice(-2);

  if (!lastAI.length) return false;

  const setFrom = (s) =>
    new Set(
      _normText(s)
        .split(" ")
        .filter((w) => w.length >= 3)
    );

  // 直接相等 / 互相包含
  for (const m of lastAI) {
    const hRaw = m.content || m.text || "";
    const h = _normText(hRaw);
    if (!h) continue;
    if (a === h) return true;
    if (a && h && (a.includes(h) || h.includes(a))) return true;
  }

  // Jaccard 词重合度
  const last = lastAI[lastAI.length - 1];
  const h = last ? _normText(last.content || last.text || "") : "";
  if (!h) return false;

  const A = setFrom(a);
  const H = setFrom(h);
  if (A.size < 4 || H.size < 4) return false;

  let inter = 0;
  for (const w of A) if (H.has(w)) inter++;
  const jacc = inter / (A.size + H.size - inter || 1);

  return jacc >= 0.75;
}

// 针对“punchlines” 口癖的专门处理：优先保留后半句
function stripPunchlinePrefix(raw, lang, persona) {
  if (!raw) return raw;
  if (lang !== "en" || persona !== "elegant") return raw;

  const s = String(raw).trim();
  const lower = s.toLowerCase();
  const key = "the internet rewards punchlines.";

  const idx = lower.indexOf(key);
  if (idx !== 0) return raw; // 只有在开头是这句才特殊处理

  const after = s.slice(key.length).trim();
  if (!after) return raw; // 只有这句，没有后半句，就保持原样

  return after;
}

// 一句化 + 长度裁剪 + 特例处理
function enforceOneSentence(raw, lang, persona) {
  let s = String(raw || "").replace(/\r/g, "").trim();
  if (!s) {
    return lang === "zh"
      ? "我需要一点时间整理一下。"
      : "Give me a moment to put it into one sentence.";
  }

  // 先去掉 punchlines 前缀（文雅人格专用）
  s = stripPunchlinePrefix(s, lang, persona);

  // 合并多行
  s = s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" ");

  s = s.replace(/#/g, "").replace(/\s{2,}/g, " ").trim();

  if (lang === "zh") {
    const m = s.match(/^(.+?[。！？\?])/);
    let out = m ? m[1] : s;
    out = out.replace(/[.!?？！。]+$/g, "").trim();
    if (!/[。！？？]$/.test(out)) out += "。";

    const max = persona === "abstract" ? 35 : 45;
    if (out.length > max) {
      const cut = out.slice(0, max);
      const idx = Math.max(
        cut.lastIndexOf("。"),
        cut.lastIndexOf("，"),
        cut.lastIndexOf("、"),
        cut.lastIndexOf("；")
      );
      const use = idx >= 10 ? cut.slice(0, idx) : cut;
      out = use.replace(/[，、；。]+$/g, "").trim() + "。";
    }
    return out;
  }

  // English
  const m = s.match(/^(.+?[.!?])/);
  let out = m ? m[1] : s;
  out = out.trim();
  if (!/[.!?]$/.test(out)) out += ".";

  const maxWords = persona === "abstract" ? 22 : 25;
  const words = out.split(/\s+/);
  if (words.length > maxWords) {
    out = words.slice(0, maxWords).join(" ");
    out = out.replace(/[.!?]*$/g, "").trim() + ".";
  }
  return out;
}

// 质量检测：太短 / 脏话 /（抽象人格）严重跑题
function looksBadAnswer(text, lang, userText, persona) {
  const s = String(text || "").trim();
  const u = String(userText || "").trim();

  if (!s) return true;

  // 1) 句子太短：抽象人格严格一点，文雅人格稍微放宽
  if (lang === "en") {
    const wc = s.split(/\s+/).filter(Boolean).length;
    const minWords = persona === "elegant" ? 4 : 6;
    if (wc < minWords) return true;
  } else {
    if (s.replace(/\s/g, "").length < 8) return true;
  }

  // 2) 侮辱 / 自辱
  const toxic = [
    "idiot",
    "stupid",
    "dumb",
    "moron",
    "shut up",
    "ashamed",
    "asshole",
    "fuck",
    "ugly",
    "i'm ugly",
    "im ugly",
    "i am ugly",
    "i'm short",
    "im short",
    "i am short",
    "kill yourself",
    "kys",
    "傻逼",
    "傻b",
    "蠢",
    "滚",
    "去死",
    "废物",
    "脑残",
    "你有病"
  ];
  const lower = s.toLowerCase();
  if (toxic.some((w) => lower.includes(w) || s.includes(w))) return true;

  // 3) 关键词对齐：只对抽象人格启用；文雅人格已放开
  if (lang === "en" && persona === "abstract") {
    const userKeywords = u
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .slice(0, 8);

    if (userKeywords.length >= 3) {
      const hit = userKeywords.some((w) => lower.includes(w));
      if (!hit) return true;
    }
  }

  return false;
}

// 聊天阶段专用兜底池（和人格卡片的 FALLBACK_SUMMARY 无关）
function pickChatFallbackSentence(persona, lang) {
  if (lang === "zh") {
    const pool =
      persona === "abstract"
        ? [
            "有这种不适感很正常，谁都会被梗和短视频拽着走。",
            "你其实是在问：当玩笑变成默认语言时，我们还剩下多少真话。"
          ]
        : [
            "担心网络用语慢慢改变日常表达，是一种很细腻的敏感。",
            "能意识到互联网语言在拉扯注意力，本身就是在练习更有边界地使用它。"
          ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const pool =
    persona === "abstract"
      ? [
          "It makes sense to feel weird about how memes and clips keep echoing in your head after the scroll.",
          "You’re basically asking what happens when jokes start to feel like the main language we think in."
        ]
      : [
          "It’s reasonable to worry that online jokes and slang slowly reshape how we speak, especially for younger people.",
          "Noticing how internet language tugs on your attention is already a step toward using it more carefully."
        ];
  return pool[Math.floor(Math.random() * pool.length)];
}

// === 真正的生成函数：带历史 + 抽象/文雅参数差异 + 自动重试 + 兜底 ===
async function generateAssistantReply(userText) {
  const persona = STATE.persona || "elegant"; // abstract / elegant
  const lang = STATE.languageMode;

  const sysBase = buildSystemPrompt(persona, lang);
  const usr = buildUserPrompt(lang, userText);

  const isAbs = persona === "abstract";
  const baseOpts = isAbs
    ? {
        temperature: 0.75,
        top_p: 0.88,
        repetition_penalty: 1.1,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      }
    : {
        temperature: 0.6,
        top_p: 0.9,
        repetition_penalty: 1.06,
        presence_penalty: 0.05,
        frequency_penalty: 0.05
      };

  const max_tokens = lang === "zh" ? (isAbs ? 120 : 160) : 120;

  // 取最近 8 条，映射成 {role, content}
  let history = (STATE.chatHistory || [])
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.text }));

  // 去掉“本轮刚 push 的”最后一条 user（onSend 已经保存了）
  if (history.length && history[history.length - 1].role === "user") {
    history = history.slice(0, -1);
  }
  // 再裁到 6 条
  history = history.slice(-6);

  async function runOnce(extraSys = "", optsOverride = {}) {
    const lastAI =
      history.filter((m) => m.role === "assistant").slice(-1)[0]?.content ||
      "";
    const lastAITrim = lastAI.trim();

    const banExact = lastAITrim
      ? lang === "zh"
        ? `禁止逐字输出你上一句：「${lastAITrim}」。`
        : `Do NOT output exactly your previous sentence: "${lastAITrim}".`
      : "";

    const banPrefix = (() => {
      if (!lastAITrim) return "";
      if (lang === "zh") {
        const head = lastAITrim.replace(/\s/g, "").slice(0, 10);
        return head
          ? `也不要用相同开头短语（例如「${head}…」）。`
          : "";
      }
      const head = lastAITrim.split(/\s+/).slice(0, 6).join(" ");
      return head ? `Also avoid reusing the opening phrase like "${head}...".` : "";
    })();

    const sys = [sysBase, banExact, banPrefix, extraSys]
      .filter(Boolean)
      .join("\n");

    const messages = [
      { role: "system", content: sys },
      ...history,
      { role: "user", content: usr }
    ];

    const raw = await chatOnce(messages, { ...baseOpts, ...optsOverride, max_tokens }, persona);
    const cleaned = enforceOneSentence(raw, lang, persona);
    return { raw, cleaned };
  }

  let out = "";
  let rawOut = "";
  const banned = [];

  for (let attempt = 0; attempt < 3; attempt++) {
    const extraSys =
      attempt === 0
        ? ""
        : lang === "zh"
        ? "重写：必须紧扣用户这句话作答，禁止辱骂/自辱/跑题；必须提供新信息或新角度；只输出一句话。"
        : "Rewrite: be directly relevant, non-abusive, on-topic; add new substance or a new angle; ONE sentence only.";

    const opts =
      attempt === 0
        ? {}
        : attempt === 1
        ? isAbs
          ? {
              temperature: 0.7,
              top_p: 0.85,
              repetition_penalty: 1.16,
              presence_penalty: 0.15,
              frequency_penalty: 0.15
            }
          : {
              temperature: 0.55,
              top_p: 0.85,
              repetition_penalty: 1.16,
              presence_penalty: 0.12,
              frequency_penalty: 0.12
            }
        : isAbs
        ? {
            temperature: 0.65,
            top_p: 0.82,
            repetition_penalty: 1.2,
            presence_penalty: 0.18,
            frequency_penalty: 0.18
          }
        : {
            temperature: 0.5,
            top_p: 0.82,
            repetition_penalty: 1.2,
            presence_penalty: 0.15,
            frequency_penalty: 0.15
          };

    const { raw, cleaned } = await runOnce(extraSys, opts);
    rawOut = raw;
    out = cleaned;

    console.log("[AI RAW]", {
      attempt,
      persona,
      lang,
      userText,
      raw: rawOut
    });
    console.log("[AI CLEANED]", out);

    const isBad = looksBadAnswer(rawOut, lang, userText, persona);
    const isDup = isNearDuplicateAnswer(rawOut, history);

    console.log("[AI CHECK]", { attempt, isBad, isDup });

    if (!isBad && !isDup) break;

    banned.push(rawOut);

    if (attempt === 1) {
      const lastAI =
        history.filter((m) => m.role === "assistant").slice(-1)[0]
          ?.content || "";
      if (lastAI && _normText(rawOut) === _normText(lastAI)) {
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].role === "assistant") {
            history.splice(i, 1);
            break;
          }
        }
      }
    }
  }

  // 兜底：如果最后结果还是明显不行，就用安全池
  if (!out || looksBadAnswer(out, lang, userText, persona)) {
    const fallback = pickChatFallbackSentence(persona, lang);
    console.warn("[AI FALLBACK USED]", { persona, lang, userText, fallback });
    return fallback;
  }

  return out;
}



function updateChatButtons(){
  const inChat = STATE.phase === "CHAT";
  const viewCard = sendBtn?.dataset?.mode === "view-card";
  if (sendBtn) sendBtn.disabled = !inChat || (STATE.isGenerating && !viewCard);
  if (endBtn) endBtn.disabled = !inChat;
  if (historyBtn) historyBtn.disabled = !inChat;
}

function isViewCardMode() {
  return sendBtn?.dataset?.mode === "view-card";
}

function lockChatToViewCardButton() {
  
  if (chatInputEl) {
    chatInputEl.value = "";
    chatInputEl.disabled = true;
    chatInputEl.placeholder = "查看人格卡片 / View persona card";
  }

  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.textContent = "查看人格卡片 / View persona card";
    sendBtn.dataset.mode = "view-card";
  }

  setChatReply("点击查看人格卡片 / Tap to view persona card", { isLoading: false });
}

function clearViewCardMode() {
  
  if (chatInputEl) {
    chatInputEl.disabled = false;
    chatInputEl.placeholder = "Type here… / 在这里输入…";
  }

  if (sendBtn) {
    sendBtn.dataset.mode = "";
    sendBtn.textContent = "Send";
  }
}

async function onSend(){
  if (STATE.phase !== "CHAT") return;

  if (isViewCardMode()) {
    press(sendBtn);
    endChat("maxTurns");
    return;
  }

  const text = String(chatInputEl?.value || "").trim();
  if (!text) return;

  STATE.isGenerating = true;
  updateChatButtons();

  STATE.languageMode = detectLanguage(text, STATE.languageMode);

  STATE.chatHistory.push({ role:"user", text, ts: Date.now() });
  STATE.chatTurnCount += 1;

  setChatReply(STATE.languageMode === "zh" ? "正在生成…" : "Generating…", { isLoading:true });
  if (chatInputEl) chatInputEl.value = "";

  const myReq = ++STATE.reqId;

  try {
    
    await ensureAI(STATE.persona || "elegant");

    const reply = await generateAssistantReply(text);

    if (myReq !== STATE.reqId) return;
    if (STATE.phase !== "CHAT") return;

    STATE.chatHistory.push({ role:"assistant", text: reply, ts: Date.now() });
    setChatReply(reply, { isLoading:false });

    if (STATE.chatTurnCount >= STATE.maxTurns) {
      STATE.isGenerating = false;
      updateChatButtons();
      lockChatToViewCardButton();
      return;
    }
  } catch (e) {
    console.warn("AI chat error:", e);
    if (myReq !== STATE.reqId) return;

    const fallback = STATE.languageMode === "zh"
      ? "出错了，请再试一次。"
      : "Something is wrong. Please try again.";

    STATE.chatHistory.push({ role:"assistant", text: fallback, ts: Date.now() });
    setChatReply(fallback, { isLoading:false });

    if (STATE.chatTurnCount >= STATE.maxTurns) {
      STATE.isGenerating = false;
      updateChatButtons();
      lockChatToViewCardButton();
      return;
    }
  } finally {
    if (myReq === STATE.reqId && STATE.phase === "CHAT") {
      if (!isViewCardMode()) {
        STATE.isGenerating = false;
        updateChatButtons();
      }
    }
  }
}


const FALLBACK_SUMMARY = {
  abstract: {
    zh: [
      "这样的表达习惯真的是我们想看到的吗？",
      "0人在意的口头禅，会不会也把人变得更冷？",
      "刷着刷着就学会了嘲讽，这值得吗？",
      "当梗变成默认语言，我们还剩下什么？",
      "把情绪丢给热词，真的能解决问题吗？"
    ],
    en: [
      "Is this really the kind of expression we want to normalize?",
      "When memes become default speech, what do we lose?",
      "Does constant scrolling make us speak colder over time?",
      "If jokes replace meaning, what happens to empathy?",
      "Are we training attention to disappear?"
    ]
  },
  elegant: {
    zh: [
      "有些热词或许应该留在屏幕里，对吗？",
      "当语言被缩短，理解也会跟着变浅吗？",
      "我们是否该为表达留出更慢的空间？",
      "如果总在复读，真实感会不会被磨掉？",
      "温和而准确的句子，也许更值得练习。"
    ],
    en: [
      "Some buzzwords probably belong on screens, don’t they?",
      "When language shrinks, does understanding shrink too?",
      "Perhaps we should leave more room for slower speech.",
      "If we only repeat, does sincerity fade?",
      "Precision can be gentle, and worth practicing."
    ]
  }
};

function personaTitle(persona, lang){
  if (persona === "abstract") {
    return lang === "zh" ? "网络冲浪达人" : "Net Surfing Pro";
  }
  return lang === "zh" ? "语言边界守护者" : "Language Boundary Keeper";
}

async function generateResultSummary(){
  const persona = STATE.persona || "elegant";
  const lang = STATE.languageMode;

  const samples = FALLBACK_SUMMARY[persona][lang];
  const memory = STATE.selectedWords.map(w=>w.text).join(lang==="zh" ? "、" : ", ");

  const sys = (lang==="zh")
    ? `
你要生成一条“反思性提问句或温和劝诫句”，用于互动作品的结尾档案卡。
要求：只输出中文一句话，不换行，不表情，不井号，不列表。
长度：不超过 25 个汉字。
语气：${persona==="abstract" ? "更网感但仍克制" : "更克制、更有边界感"}。
需隐含主题：互联网语言、短视频、注意力、表达习惯。
参考记忆词：${memory}
你可以参考这些示例的方向但不要照抄：
- ${samples.slice(0,4).join("\n- ")}
`.trim()
    : `
Generate ONE reflective question or gentle admonition for the ending persona card.
Rules: exactly ONE English sentence, no emojis, no hashtags, no lists, no newlines.
Length: <= 18 words.
Tone: ${persona==="abstract" ? "slightly meme-coded but restrained" : "calm and coherent"}.
Topic: internet language, short-form video, attention, expression habits.
Fed-word memory: ${memory}
Reference vibe (do not copy):
- ${samples.slice(0,4).join("\n- ")}
`.trim();

  const user = lang==="zh"
    ? "现在生成一句结尾句。"
    : "Now generate the ending line.";

  try {
    const raw = await chatOnce(
     [{ role:"system", content: sys }, { role:"user", content: user }],
     { temperature: persona==="abstract" ? 0.9 : 0.7, max_tokens: 80 },
     persona
    );

    const cleaned = enforceOneSentence(raw, lang, persona);
    if (lang==="zh" && cleaned.length > 25) {
      return cleaned.slice(0, 24).replace(/[，、；。]+$/,"") + "？";
    }
    if (lang==="en") {
      const w = cleaned.split(/\s+/);
      if (w.length > 18) return w.slice(0,18).join(" ").replace(/[.!?]*$/,"") + "?";
    }
    return cleaned;
  } catch {
    return samples[Math.floor(Math.random()*samples.length)];
  }
}

async function openResultCard(){
  const persona = STATE.persona || "elegant";
  const lang = STATE.languageMode;

  resultTitle.textContent = personaTitle(persona, lang);
  resultWords.textContent =
    (lang==="zh" ? "投喂配方：" : "Fed words: ") +
    STATE.selectedWords.map(w=>w.text).join(lang==="zh" ? "、" : ", ");

  resultSummary.textContent = (lang==="zh" ? "生成中…" : "Generating…");
  resultModal.classList.add("open");

  const line = await generateResultSummary();
  resultSummary.textContent = line;
}

function endChat(reason){
  STATE.endReason = reason;
  STATE.phase = "RESULT";
  if (wrapEl) wrapEl.dataset.phase = "RESULT";
  renderPhaseTitle();

  STATE.reqId += 1;
  STATE.isGenerating = false;
  updateChatButtons();

  // 清空 chat 顶部回复泡
  setChatReply("");

  openResultCard();
}

// ====== Reset all ======
function resetAll(){
  STATE.reqId += 1;
  STATE.phase = "FEEDING";
  STATE.selectedWords = [];
  STATE.persona = null;
  STATE.chatHistory = [];
  STATE.chatTurnCount = 0;
  STATE.isGenerating = false;
  STATE.endReason = null;
  STATE.languageMode = "zh";
  clearViewCardMode();
  setPhase("FEEDING");
  swapTheme("neutral");
  renderSelectedBar();
  updateFeedingBubble();

  resultModal.classList.remove("open");
  closeHistory();
  setChatReply("");
  updateChatButtons();
}

// ====== Word cloud layout ======
let CLOUD_TOKENS = [];
const DESIGN_W = 1920, DESIGN_H = 1080;

function designToScreenMapper(){
  const W = window.innerWidth, H = window.innerHeight;
  const scale = Math.max(W / DESIGN_W, H / DESIGN_H);
  const ox = (W - DESIGN_W * scale) / 2;
  const oy = (H - DESIGN_H * scale) / 2;
  return (dx, dy) => ({ x: ox + dx * scale, y: oy + dy * scale, scale });
}

const CX_DESIGN = 960;
const CY_DESIGN = 540;
let INNER_GAP_DESIGN = 480;
let BULGE_DESIGN = 100;
let TOP_Y_DESIGN = 180;
let BOTTOM_Y_DESIGN = 780;

function renderBrackets(){
  if (!CLOUD_TOKENS.length) return;
  cloudEl.innerHTML = '';

  const W = window.innerWidth, H = window.innerHeight;
  const toScreen = designToScreenMapper();
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

  const left=[], right=[];
  CLOUD_TOKENS.forEach((t,i)=> (i%2===0?left:right).push({ ...t, __i:i }));

  function placeSide(list, side){
    const n=list.length; if(!n) return;

    for(let k=0;k<n;k++){
      const t = (k+0.5)/n;
      const yD = TOP_Y_DESIGN + t*(BOTTOM_Y_DESIGN - TOP_Y_DESIGN) + (Math.random()*10-5);

      const v = (yD - CY_DESIGN)/((BOTTOM_Y_DESIGN - TOP_Y_DESIGN)/2);
      const c = 1 - Math.pow(Math.abs(v), 1.6);

      const offsetXD = INNER_GAP_DESIGN + c * BULGE_DESIGN;
      const xD = side==='left' ? (CX_DESIGN - offsetXD) : (CX_DESIGN + offsetXD);

      let {x,y} = toScreen(xD, yD);
      x = clamp(x, 8, W-8);
      y = clamp(y, 8, H-8);

      const tag = document.createElement('span');
      tag.className = 'tag';
      const id = `${list[k].__i}`;
      const text = list[k].text;
      const type = normType(list[k].type);

      tag.dataset.id = id;
      tag.dataset.type = type;
      tag.textContent = text;
      tag.style.left = x+'px';
      tag.style.top = y+'px';

      tag.classList.toggle("selected", isSelected(id));

      tag.addEventListener('click', ()=>{
        if (STATE.phase !== "FEEDING") return;

        press(tag);
        if (window.gsap) gsap.fromTo(tag, { scale: 1 }, { scale: 0.88, duration: 0.08, yoyo:true, repeat:1, ease:"power2.out" });

        if (isSelected(id)) {
          removeSelected(id);
        } else {
          addSelected({ id, text, type });
        }
      });

      cloudEl.appendChild(tag);
    }
  }

  placeSide(left,'left');
  placeSide(right,'right');
}

fetch('./tokens.json')
  .then(r => r.json())
  .then(data => {
    const list = (data && data.tokens) ? data.tokens.slice() : [];
    for (let i=list.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    CLOUD_TOKENS = list;
    renderBrackets();
  })
  .catch(err => console.warn("Failed to load tokens.json:", err));

window.addEventListener('resize', renderBrackets);

const MODEL_HINT_KEY = "webllm_model_hint_seen_v1";

function openModelHint(){
  if (!modelHintModal) return;
  modelHintModal.classList.add("open");
}

function closeModelHint(){
  if (!modelHintModal) return;
  modelHintModal.classList.remove("open");
}

function initModelHint(){
  if (!modelHintModal) return;

  const seen = (() => {
    try { return localStorage.getItem(MODEL_HINT_KEY); }
    catch { return null; }
  })();

  if (!seen) {

    openModelHint();

    ensureAI().then(() => {
      if (modelHintText && modelHintModal.classList.contains("open")) {
        modelHintText.textContent =
          "模型已加载完成，你可以开始和它对话了；下次打开会快很多。";
      }
    }).catch(err => {
      console.warn("warmup ensureAI error:", err);
    });
  }

  if (modelHintOk) {
    modelHintOk.addEventListener("click", () => {
      try { localStorage.setItem(MODEL_HINT_KEY, "1"); } catch {}
      closeModelHint();
    });
  }
  if (modelHintBackdrop) {
    modelHintBackdrop.addEventListener("click", () => {
      try { localStorage.setItem(MODEL_HINT_KEY, "1"); } catch {}
      closeModelHint();
    });
  }
}

renderPhaseTitle();
renderSelectedBar();
updateChatButtons();
updateFeedingBubble();
initModelHint();

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    press(resetBtn);
    resetAll();
  });
}

if (sendBtn) {
  sendBtn.addEventListener("click", () => {
    press(sendBtn);
    onSend();
  });
}

if (chatInputEl) {
  chatInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSend();
  });
}

if (endBtn) {
  endBtn.addEventListener("click", () => {
    press(endBtn);
    endChat("userEnded");
  });
}

if (historyBtn) {
  historyBtn.addEventListener("click", () => {
    press(historyBtn);
    openHistory();
  });
}

if (historyBackdrop) historyBackdrop.addEventListener("click", closeHistory);
if (historyClose) historyClose.addEventListener("click", closeHistory);

if (resultBackdrop) resultBackdrop.addEventListener("click", () => resultModal.classList.remove("open"));
if (resultClose) resultClose.addEventListener("click", () => resultModal.classList.remove("open"));
if (restartBtn) restartBtn.addEventListener("click", () => { press(restartBtn); resetAll(); });
