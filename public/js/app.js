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

// 新增：模型加载提示弹窗相关节点
const modelHintModal = document.getElementById('model-hint');
const modelHintBackdrop = document.getElementById('model-hint-backdrop');
const modelHintOk = document.getElementById('model-hint-ok');
const modelHintText = document.getElementById('model-hint-text');

// anim helpers
function press(el){ window.__press && window.__press(el); }
function bubble(text, opts){ window.__bubble && window.__bubble(text, opts); }
function swapTheme(theme){ window.__swapTheme && window.__swapTheme(theme); }

// ===== UI helpers：FEEDING 白泡 chips + CHAT 回复泡 =====
const chatReplyEl = document.getElementById("chat-reply");

function setChatReply(text, { isLoading = false } = {}) {
  if (!chatReplyEl) return;
  chatReplyEl.textContent = text || "";
  chatReplyEl.style.opacity = isLoading ? "0.75" : "1";
}

// 安全转义
function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

// FEEDING：底部白泡里的 chips
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

// FEEDING 白泡里的 chips 点击删除
document.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-chip-id]");
  if (!chip) return;
  if (STATE.phase !== "FEEDING") return;

  const id = chip.dataset.chipId;
  STATE.selectedWords = (STATE.selectedWords || []).filter((w) => w.id !== id);
  renderSelectedBar();
  updateFeedingBubble();
});

// ====== Global State ======
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

// ====== Language detect ======
function detectLanguage(text, prev = "zh"){
  const s = String(text || "");
  if (/[\u4e00-\u9fff]/.test(s)) return "zh";
  if (/[A-Za-z]/.test(s)) return "en";
  return prev || "zh";
}

// ====== Type normalize ======
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

// ====== One-sentence enforcement ======
function enforceOneSentence(raw, lang, persona){
  let s = String(raw || "").replace(/\r/g,"").trim();
  if (!s) return lang === "zh" ? "我需要一点时间整理一下。"
                               : "Give me a moment to put it into one sentence.";

  s = s.split("\n").map(x=>x.trim()).filter(Boolean).join(" ");
  s = s.replace(/#/g,"").replace(/\s{2,}/g," ").trim();

  if (lang === "zh") {
    const m = s.match(/^(.+?[。！？])/);
    let out = (m ? m[1] : s);
    out = out.replace(/[.!?]+$/g, "").trim();
    if (!/[。！？]$/.test(out)) out += "。";

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
      out = use.replace(/[，、；。]+$/,"").trim() + "。";
    }
    return out;
  }

  const m = s.match(/^(.+?[.!?])/);
  let out = (m ? m[1] : s);
  out = out.trim();
  if (!/[.!?]$/.test(out)) out += ".";

  const maxWords = persona === "abstract" ? 22 : 25;
  const words = out.split(/\s+/);
  if (words.length > maxWords) {
    out = words.slice(0, maxWords).join(" ");
    out = out.replace(/[.!?]*$/,"").trim() + ".";
  }
  return out;
}

// ====== Phase title ======
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

// ====== Selected words UI ======
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

// ====== Phase switch ======
function setPhase(phase){
  STATE.phase = phase;
  if (wrapEl) wrapEl.dataset.phase = phase;
  renderPhaseTitle();
}

// ====== FEEDING submit -> decide persona -> theme switch -> enter CHAT ======
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

  setPhase("CHAT");
  setChatReply(
    STATE.languageMode === "zh"
      ? "你想说什么都可以，但试着把话说成一句。"
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

// ====== CHAT: history drawer ======
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

// ====== Prompt templates ======
function buildSystemPrompt(persona, lang, selectedWords){
  const memory = selectedWords.map(w=>w.text).join(lang==="zh" ? "、" : ", ");
  if (lang === "zh") {
    if (persona === "abstract") {
      return `
你是一个被中文互联网流行语长期包围的青少年，说话更网感、更碎、更情绪化，但仍可读。
你被“喂过”的词语记忆是：${memory}

硬规则：
- 只输出中文一句话，不要换行，不要列表，不要表情，不要井号。
- 句子要围绕互联网、短视频、评论区语言、注意力、表达习惯的影响，不要跑题成泛鸡汤。
- 控制在 20–35 个汉字，必须可读，结尾用句号/问号。

风格：
- 更口语、更梗化、更跳跃，但要像一句完整的话。
`.trim();
    }
    return `
你是一个克制、连贯、温和但清醒的中文叙述者，强调逻辑与连接词。
你被“喂过”的词语记忆是：${memory}

硬规则：
- 只输出中文一句话，不要换行，不要列表，不要表情，不要井号。
- 句子要围绕互联网、短视频、语言习惯、注意力、表达方式的影响，不要跑题。
- 尽量包含“因为/所以/然而/不过/因此/即便”之一，让因果或转折更清晰。
- 控制在 28–45 个汉字，结尾用句号/问号。
`.trim();
  }

  if (persona === "abstract") {
    return `
You are an internet-native teen voice: meme-coded, jumpy, a bit fragmented, but still readable.
Your “fed words” memory: ${memory}

Hard rules:
- Output exactly ONE sentence in English; no newlines, no emojis, no hashtags, no lists.
- Stay on topic: internet, short-form video, comment-section language, attention, expression habits.
- 12–22 words, end with one sentence-ending punctuation.
`.trim();
  }

  return `
You are a calm, coherent, reflective voice with gentle logic.
Your “fed words” memory: ${memory}

Hard rules:
- Output exactly ONE sentence in English; no newlines, no emojis, no hashtags, no lists.
- Stay on topic: internet, short-form video, language habits, attention, expression.
- Use a connector such as because/therefore/however/while/so.
- 16–25 words, end with one sentence-ending punctuation.
`.trim();
}

function buildUserPrompt(lang, userText){
  return lang === "zh"
    ? `用户说：${userText}\n请用一句话回应，保持人设与规则。`
    : `User says: ${userText}\nReply with exactly one sentence, following the persona and rules.`;
}

async function generateAssistantReply(userText){
  const persona = STATE.persona || "elegant";
  const lang = STATE.languageMode;
  const sys = buildSystemPrompt(persona, lang, STATE.selectedWords);
  const usr = buildUserPrompt(lang, userText);

  const temperature = persona === "abstract" ? 0.95 : 0.65;
  const max_tokens = (lang === "zh")
    ? (persona === "abstract" ? 120 : 160)
    : 110;

  const messages = [
    { role:"system", content: sys },
    ...STATE.chatHistory.slice(-6).map(m => ({ role: m.role, content: m.text })),
    { role:"user", content: usr }
  ];

  const raw = await chatOnce(messages, { temperature, max_tokens });
  return enforceOneSentence(raw, lang, persona);
}

// ====== CHAT send ======
function updateChatButtons(){
  const inChat = STATE.phase === "CHAT";
  if (sendBtn) sendBtn.disabled = !inChat || STATE.isGenerating;
  if (endBtn) endBtn.disabled = !inChat;
  if (historyBtn) historyBtn.disabled = !inChat;
}

async function onSend(){
  if (STATE.phase !== "CHAT") return;
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
    await ensureAI();
    const reply = await generateAssistantReply(text);

    if (myReq !== STATE.reqId) return;
    if (STATE.phase !== "CHAT") return;

    STATE.chatHistory.push({ role:"assistant", text: reply, ts: Date.now() });
    setChatReply(reply, { isLoading:false });

    if (STATE.chatTurnCount >= STATE.maxTurns) {
      endChat("maxTurns");
      return;
    }
  } catch (e) {
    console.warn("AI chat error:", e);
    if (myReq !== STATE.reqId) return;

    const fallback = STATE.languageMode === "zh"
      ? "我先停一下，因为这些话太容易把人带偏。"
      : "I’ll pause, because these patterns can quietly pull us off track.";
    STATE.chatHistory.push({ role:"assistant", text: fallback, ts: Date.now() });
    setChatReply(fallback, { isLoading:false });

    if (STATE.chatTurnCount >= STATE.maxTurns) {
      endChat("maxTurns");
      return;
    }
  } finally {
    if (myReq === STATE.reqId && STATE.phase === "CHAT") {
      STATE.isGenerating = false;
      updateChatButtons();
    }
  }
}

// ====== RESULT: persona card ======
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
      { temperature: persona==="abstract" ? 0.9 : 0.7, max_tokens: 80 }
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

// ====== 模型加载提示：只在第一次打开时显示 + 预热模型 ======
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
    // 第一次访问：弹窗 + 后台预热模型
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

// ====== Bindings ======
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
