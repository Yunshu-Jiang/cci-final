// public/js/app.js
// 核心逻辑：状态管理 + 词语云 + AI 调用 + 觉醒变身

import './ui/anim.js';
import './bg/p5-scene.js';
import { ensureAI, chatOnce } from './ai-webllm.js';
// —— 以 1920×1080 作为“设计画布” —— //
// const DESIGN_W = 1920;
// const DESIGN_H = 1080;

// // 背景与人物都是 cover 居中显示时：把“设计坐标”映射到屏幕坐标
// function designToScreenMapper() {
//   const W = window.innerWidth;
//   const H = window.innerHeight;
//   const scale = Math.max(W / DESIGN_W, H / DESIGN_H); // cover：用最大比例
//   const offsetX = (W - DESIGN_W * scale) / 2;
//   const offsetY = (H - DESIGN_H * scale) / 2;
//   return (dx, dy) => ({
//     x: offsetX + dx * scale,
//     y: offsetY + dy * scale,
//     scale
//   });
// }

const STATE = {
  abstract:   0,
  literary:   0,
  transformed:null,   // null | 'abstract' | 'literary'
  mode:       'neutral',
  aiReady:    false,
  aiInitTried:false,
  started:    false,
  awakenedOnce:false  // ← 新增：是否已经出现过觉醒
};

// const THRESHOLD = 15;  // ← 删掉旧阈值

// 新阈值
const INIT_AWAKEN_DIFF = 5; // 首次进入觉醒的门槛（≥5）
const STABLE_DIFF = 3;      // 之后保持/切换的门槛（>3）
const statsEl  = document.getElementById('stats');
const modeEl   = document.getElementById('mode');
const cloudEl  = document.getElementById('cloud');
const resetBtn = document.getElementById('reset-btn');
const wrapEl   = document.getElementById('wrap');
const introEl  = document.getElementById('intro');
const startBtn = document.getElementById('start-btn');

function setStarted(v){
  STATE.started = v;
  if (wrapEl) wrapEl.classList.toggle('is-locked', !v);

  if (introEl) {
    if (v) {
      // 关掉 intro（有 gsap 就做个淡出）
      if (window.gsap) {
        gsap.to(introEl, { opacity: 0, duration: 0.25, ease: "power2.out", onComplete: () => introEl.style.display = 'none' });
      } else {
        introEl.style.display = 'none';
      }
    } else {
      introEl.style.display = 'flex';
      introEl.style.opacity = '1';
    }
  }
}

// 初始：锁住
setStarted(false);

// Start 按钮：解锁
if (startBtn) {
  startBtn.addEventListener('click', () => {
    press(startBtn);
    setStarted(true);
  });
}

// --- 动效封装（来自 ui/anim.js） ---
function press(el)                { window.__press && window.__press(el); }
// 第二个参数 opts 用来传 isLoading 等配置
function bubble(text, opts)       { window.__bubble && window.__bubble(text, opts); }
function swapTheme(to)            { window.__swapTheme && window.__swapTheme(to); }
function toast(msg, opts) { window.__toast && window.__toast(msg, opts); }


// --- 离线兜底回复：按“词的类型”区分语气 ---
let RESPONSES = {
  abstract: [
    "bro that hit different fr.",
    "ngl this vibe is kinda cracked.",
    "lowkey fire, highkey unexplainable.",
    "this goes hard, might screenshot.",
    "brain lagging but the drip is real."
  ],
  literary: [
    "Thank you, that image lingers softly.",
    "There is a quiet grace in what you just evoked.",
    "I’ll tuck this thought between the pages for later.",
    "Gentle, precise—like a well-placed comma.",
    "It feels like a line from a book I almost remember."
  ]
};

// 如果有 external responses.json，则覆盖默认（结构相同：abstract / literary）
fetch('./responses.json')
  .then(r => r.ok ? r.json() : null)
  .then(d => { if (d) RESPONSES = d; })
  .catch(()=>{});

// --- 状态存储 ---
function restore() {
  try {
    const s = JSON.parse(localStorage.getItem('persona-state-v1') || 'null');
    if (!s) return;
    const { started, ...rest } = s; // 忽略 started
    Object.assign(STATE, rest);
    if (STATE.transformed) {
      swapTheme(STATE.transformed);
    } else {
      swapTheme('neutral');
    }
    updateBadges();
  } catch {}
}
function persist() {
  const { started, ...save } = STATE; // 不存 started
  localStorage.setItem('persona-state-v1', JSON.stringify(save));
}

// --- 模式与 UI（只用于上方 badge 展示） ---
function computeModeLabel() {
  if (STATE.transformed === 'abstract') return 'Awakened: Abstract';
  if (STATE.transformed === 'literary') return 'Awakened: Literary';
  return 'Neutral';
}

function updateBadges() {
  statsEl.textContent = `Abstract ${STATE.abstract} · Literary ${STATE.literary}`;
  modeEl.textContent  = computeModeLabel();
  // 为了兼容你其它地方若还读取 STATE.mode，这里同步一下语义
  STATE.mode = (STATE.transformed === 'abstract')
    ? 'trans_abstract'
    : (STATE.transformed === 'literary')
      ? 'trans_literary'
      : 'neutral';
}
function updateAwakenStateByRules() {
  const diff = STATE.abstract - STATE.literary;  // >0 抽象领先，<0 文雅领先
  let next = STATE.transformed;

  if (!STATE.awakenedOnce && STATE.transformed == null) {
    // 首次进入觉醒：必须 |diff| ≥ 5
    if (Math.abs(diff) >= INIT_AWAKEN_DIFF) {
      next = (diff > 0) ? 'abstract' : 'literary';
    } else {
      next = null;
    }
  } else {
    // 之后的维持/切换：用 >3 的门槛
    if (diff > STABLE_DIFF)       next = 'abstract';
    else if (-diff > STABLE_DIFF) next = 'literary';
    else                          next = null;     // 回到中立
  }

  if (next !== STATE.transformed) {
  const prev = STATE.transformed;
  STATE.transformed = next;

  // ✅ 第一次觉醒提示（只触发一次；Reset 后会重新触发）
  if (prev == null && next != null && !STATE.awakenedOnce) {
    STATE.awakenedOnce = true;

      toast({
        zh: "如果一个小孩长期被这样的话语包围，他会变成什么样？",
        en: "If a child is surrounded by this kind of language for a long time, how will they behave?"
      }, { duration: 3.8 });
    }

     swapTheme(next || 'neutral');
   }

}

// --- Reset：恢复初始状态 ---
function resetPersona() {
  STATE.abstract    = 0;
  STATE.literary    = 0;
  STATE.transformed = null;
  STATE.mode        = 'neutral';
  STATE.aiReady     = false;
  STATE.aiInitTried = false;
  STATE.awakenedOnce = false;


  localStorage.removeItem('persona-state-v1');

  updateBadges();
  swapTheme('neutral');
}

// --- 离线回复：根据这次点击的 type 决定语气 ---
function offlineReply(clickedType) {
  const key = clickedType === 'abstract' ? 'abstract' : 'literary';
  const pool = RESPONSES[key] || [];
  if (!pool.length) return '…';
  return pool[Math.floor(Math.random() * pool.length)];
}

// --- system prompt：告诉模型现在要用哪种语气 ---

function systemStylePrompt(clickedType, lang, tier) {
  const T = Number(tier || 0);

  // ========= 抽象 =========
  if (clickedType === 'abstract') {
    if (lang === 'zh') {
      return `
你是一个受到网络流行语影响很深的中国青少年，说话里混杂很多网络梗与情绪碎片。

硬规则（必须遵守）：
- 用中文，只输出【一句话】。
- 不超过 26 个汉字。
- 不要使用表情符号，不要使用标签/井号，不要列表，不要 markdown。

风格（按强度 TIER 调整，TIER=${T}）：
- 必须多用这些词中的若干个：包的、那咋了、0人在意、yyds、你个老六、又能怎。
- 表达偏情绪化、碎片化，可以空洞。
- TIER 0：较可读但明显网感。
- TIER 1：更口语、更梗密度。
- TIER 2：更跳跃、更怪诞、因果更松。
- TIER 3：接近无厘头，但仍然要像一句完整的话（有主语“我”）。

例子：
- “包的包的。现在谁不会说这些？”
- “0个人在意好吗？我只是跟风玩梗而已。”
- “那咋了？你个老六。”
`;
    }

    // lang === 'en'
    return `
You are an internet-native teen persona with meme-heavy slang.
HARD RULES:
- Output exactly ONE sentence in English.
- NO hashtags, NO emojis, NO lists, NO markdown.
- Keep it readable.

STYLE (TIER=${T}):
- TIER 0: slangy but coherent.
- TIER 1: more meme-coded, more jumpy.
- TIER 2: semi-surreal, logic gets loose.
- TIER 3: almost nonsense, but still one grammatical sentence.
EXAMPLES:
- "Lowkey that move was skibidi-coded, not gonna lie."
- "Your rizz is on cooldown, but the vibe still goes hard."
- "Sigma focus locked in, the chaos kinda makes sense."
`;
  }

  // ========= 文雅/文学 =========
  if (lang === 'zh') {
    // 文学：随着文学值提高更长、更有逻辑（仍然 1 句话 & ≤35字）
    const lenHint = [
      "建议 14–30 字，清爽克制。",
      "建议 40–50 字，句内更连贯。",
    ][T] || "建议 18–50 字。";

    return `
你是一个礼貌、流畅、克制的中文叙述者。

硬规则（必须遵守）：
- 用中文，只输出【一句话】。
- 这一句话不超过 50 个汉字，必须是完整的话不要把一个词语从中间截断。
- 不要使用表情符号，不要使用标签/井号，不要列表，不要 markdown。

风格与长度（TIER=${T}）：
- ${lenHint}
- 必须更有逻辑：尽量包含“因此/所以/然而/不过/于是/同时/即便”等连接词之一。
- 语气克制但有温度，句法完整。

例子：
- “我觉得能完整的表达自己很重要。”
- “很多同学会在上课时也乱说网络用语，我觉得这并不好。”
`;
  }

  // lang === 'en' && literary
  return `
You are an elegant, polite literary voice in English.
HARD RULES:
- Output exactly ONE sentence in English.
- NO hashtags, NO emojis, NO lists, NO markdown.

STYLE (TIER=${T}):
- Higher tier = longer and more logically connected (use therefore/however/while/because).
- Still keep it as a single, well-formed sentence.
EXAMPLES:
- "There is a quiet steadiness here that invites gentler attention."
- "With measured confidence, the moment arranges itself into clarity."
- "Polite words can carry warmth without losing their precision."`;
}

function userPrompt(clickedType, lang, tier, tokenText = '') {
  const T = Number(tier || 0);
  const word = String(tokenText || '').trim();

  if (lang === 'zh') {
    if (clickedType === 'abstract') {
      return `围绕我刚点击的词“${word}”，用中文写一句话（TIER=${T}），以第一人称视角口语描写，并带上包的/那咋了/0人在意/yyds/你个老六/又能怎里至少两个词。`;
    }
    return `围绕我刚点击的词“${word}”，用中文写一句更有逻辑的一句话（TIER=${T}），尽量用因此/所以/然而/不过/于是/同时/即便等连接词。在回复中表现一下对于网络的辩证性思考的深度`;
  }

  // lang === 'en'
  if (clickedType === 'abstract') {
    return `Respond in ONE English sentence about "${word}" (TIER=${T}) with increasing absurdity as tier rises.`;
  }
  return `Respond in ONE English sentence about "${word}" (TIER=${T}) that is longer and more logically connected as tier rises. Show your critical thinking about internet.`;
}


function enforceStyle(text, clickedType, lang = 'en', tier = 0) {
  if (!text || !String(text).trim()) {
    return (lang === 'zh')
      ? (clickedType === 'abstract' ? "没找到合适的回复但是那咋了？"
                                   : "我需要一点时间，因为我想把话说得更清楚。")
      : (clickedType === 'abstract' ? "Lowkey loading up, give me a sec."
                                   : "Just a moment while I collect a proper sentence.");
  }

  let s = String(text).trim();

  // 去掉模型常见的首尾引号
  s = s.replace(/^[\s"“]+/, '').replace(/[\s"”]+$/, '');

  // 只取第一句（中英文标点都支持）
  s = s.split('\n')[0].trim();
  const firstSentence = s.split(/(?<=[.!?。！？])\s+/)[0] || s;
  let out = firstSentence.trim();

  if (lang === 'zh') {
    // 统一中文句末标点
    out = out.replace(/[.!?]+$/g, '').trim();
    if (!/[。！？]$/.test(out)) out += '。';

    // ✅ 中文长度上限：文学更长，且随 tier 增长
    const t = Math.max(0, Math.min(3, Number(tier || 0)));
    const maxLen =
      clickedType === 'literary'
        ? [30, 40, 50, 60][t]   // 文学：越高越长、最多 50
        : 26;                   // 抽象：你 system 里写“不超过 26”，这里同步

    // ✅ 超长时：优先在 maxLen 以内找一个合适的停顿符号截断
    if (out.length > maxLen) {
      const cutCandidates = ['，', '、', '；', '：', ','];
      let cutAt = -1;
      for (const p of cutCandidates) {
        cutAt = Math.max(cutAt, out.lastIndexOf(p, maxLen - 1));
      }
      if (cutAt > 8) {
        out = out.slice(0, cutAt).trim();
      } else {
        out = out.slice(0, maxLen).trim();
      }
      out = out.replace(/[，、；：,。！？]+$/g, '');
      out += '。';
    }
    return out;
  }

  // English：保证一句话句末
  out = out.replace(/#+/g, '').replace(/\s{2,}/g, ' ').trim();
  if (!/[.!?]$/.test(out)) out += '.';
  return out;
}




// --- 统一点击入口：按钮/词语云都调用这个 --- 
// --- 统一点击入口：按钮/词语云都调用这个 --- 
export async function personaClick(type, tokenText = '') {
  if (!STATE.started) return;

  if (type === 'abstract') STATE.abstract++;
  if (type === 'literary') STATE.literary++;

  updateAwakenStateByRules();
  updateBadges();
  persist();

  bubble(
    type === 'abstract'
      ? 'Loading a glitchy, internet-coded thought…'
      : 'Composing a calm, careful sentence…',
    { isLoading: true }
  );

  if (!STATE.aiReady && !STATE.aiInitTried) {
    STATE.aiInitTried = true;
    bubble("Loading the dialogue engine… first time can be slow.");
    try {
      await ensureAI();
      STATE.aiReady = true;
      bubble("Ready. Talk to me.");
    } catch (e) {
      console.warn("AI init failed, fallback to offline:", e);
      bubble("Engine failed to load. Using offline persona for now.");
    }
  }

  try {
    // ✅ 提前定义：所有分支都能用，catch 也能用
    const lang = detectLangFromToken(tokenText);
    const tier = (type === 'abstract')
      ? tierFromCount(STATE.abstract)
      : tierFromCount(STATE.literary);

    let text;

    if (STATE.aiReady) {
      const messages = [
        { role: "system", content: systemStylePrompt(type, lang, tier) },
        { role: "user",   content: userPrompt(type, lang, tier, tokenText) }
      ];

      const maxTokens =
        lang === 'zh'
          ? (type === 'literary' ? 160 : 120)
          : 90;

      const temperature =
        type === 'abstract'
          ? (0.95 + 0.08 * tier)
          : (0.75 - 0.08 * tier);

      // ✅ raw 变量现在有定义了
      const raw = await chatOnce(messages, {
        temperature: Math.max(0.2, Math.min(1.25, temperature)),
        max_tokens: maxTokens
      });

      console.log('[AI RAW]', raw);

      text = enforceStyle(raw, type, lang, tier);
      console.log('[AFTER enforceStyle]', text, 'len=', text.length);

      if (!text) text = enforceStyle(offlineReply(type), type, lang, tier);
    } else {
      // ✅ 这里也能用 lang 了
      text = enforceStyle(offlineReply(type), type, lang, tier);
    }

    bubble(text);
  } catch (err) {
    console.warn("AI chat error:", err);

    // ✅ 兜底里别再用未定义变量：重新算一次 lang 最稳
    const lang = detectLangFromToken(tokenText);
    bubble(enforceStyle(offlineReply(type), type, lang, tier));
  }
}

window.personaClick = personaClick;

// --- 顶部按钮绑定（+Abstract / +Literary） ---
document.querySelectorAll('.btn[data-type]').forEach(btn => {
  btn.addEventListener('click', () => {
    press(btn);
    personaClick(btn.dataset.type);
  });
});

// Reset 按钮（如果你在 HTML 里有 <button id="reset-btn">Reset</button>）
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    press(resetBtn);
    resetPersona();
  });
}

// --- 词语云：从 tokens.json 环绕人物排布 ---
let CLOUD_TOKENS = [];

function randomBetween(a,b){ return Math.random()*(b-a)+a; }

function detectLangFromToken(tokenText = '') {
  // 只要包含中文字符，就判定为中文回复
  return /[\u4e00-\u9fff]/.test(tokenText) ? 'zh' : 'en';
}

function tierFromCount(count) {
  // 0..3 四档：0(轻) 1(中) 2(重) 3(极)
  return Math.max(0, Math.min(3, Math.floor(count / 5)));
}

// function renderRing() {
//   if (!CLOUD_TOKENS.length) return;
//   cloudEl.innerHTML = '';

//   const cx = window.innerWidth / 2;
//   const cy = window.innerHeight * 0.6;
//   const radius = Math.min(window.innerWidth, window.innerHeight) * 0.35;

//   CLOUD_TOKENS.forEach((t, i) => {
//     const angle = (2 * Math.PI * i) / CLOUD_TOKENS.length;
//     const x = cx + radius * Math.cos(angle);
//     const y = cy + radius * Math.sin(angle);

//     const span = document.createElement('span');
//     span.className = 'tag';
//     span.dataset.type = t.type;      // 'abstract' | 'literary'
//     span.textContent = t.text;

//     const size = Math.round(randomBetween(12, 26));
//     span.style.fontSize   = size + 'px';
//     span.style.fontWeight = size > 22 ? '700' : (size > 18 ? '600' : '500');
//     span.style.left = x + 'px';
//     span.style.top  = y + 'px';
//     span.style.transform =
//       'translate(-50%, -50%) rotate(' + randomBetween(-6, 6) + 'deg)';

//     span.addEventListener('click', () => {
//       press(span);
//       personaClick(t.type);
//       gsap.to(span, { y:-6, duration:.12, yoyo:true, repeat:1, ease:"power2.out" });
//     });

//     cloudEl.appendChild(span);
//   });
// }
// 以 1920×1080 的设计坐标来排布，再映射到屏幕（背景 cover 居中）
const DESIGN_W = 1920, DESIGN_H = 1080;
function designToScreenMapper(){
  const W = window.innerWidth, H = window.innerHeight;
  const scale = Math.max(W / DESIGN_W, H / DESIGN_H); // cover
  const ox = (W - DESIGN_W * scale) / 2;
  const oy = (H - DESIGN_H * scale) / 2;
  return (dx, dy) => ({ x: ox + dx * scale, y: oy + dy * scale, scale });
}

// —— 按 1920×1080 调你想要的“括号”轨迹 ——
// 中轴线（人物中心）:
const CX_DESIGN = 960;
// 略微上移一点，让底部空间腾给气泡
const CY_DESIGN = 540;

// 距离与形状
let INNER_GAP_DESIGN = 480;  // 离中轴线距离（越大离人物越远）
let BULGE_DESIGN     = 100;  // 中段鼓出量（越大越像“{}”）
let TOP_Y_DESIGN     = 180;  // 上边界（原来是 300）
let BOTTOM_Y_DESIGN  = 780;  // 下边界（原来是 940）

function renderBrackets(){
  if (!CLOUD_TOKENS.length) return;
  cloudEl.innerHTML = '';

  const W = window.innerWidth, H = window.innerHeight;
  const toScreen = designToScreenMapper();

  const left = [], right = [];
  CLOUD_TOKENS.forEach((t,i)=> (i%2===0?left:right).push(t));

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function placeSide(list, side){
    const n = list.length; if(!n) return;

    for(let k=0;k<n;k++){
      const t = (k+0.5)/n; // 0..1
      const yD = TOP_Y_DESIGN + t*(BOTTOM_Y_DESIGN - TOP_Y_DESIGN) + (Math.random()*10-5);

      // 归一到 -1..1，控制鼓出
      const v = (yD - CY_DESIGN)/((BOTTOM_Y_DESIGN - TOP_Y_DESIGN)/2);
      const c = 1 - Math.pow(Math.abs(v), 1.6);

      const offsetXD = INNER_GAP_DESIGN + c * BULGE_DESIGN;
      const xD = side==='left' ? (CX_DESIGN - offsetXD) : (CX_DESIGN + offsetXD);

      let {x,y} = toScreen(xD, yD);

      // —— 保底：别出屏幕（左右/上下各留 8px 安全边）——
      x = clamp(x, 8, W-8);
      y = clamp(y, 8, H-8);

      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.dataset.type = list[k].type;
      tag.textContent = list[k].text;

      const l = detectLangFromToken(list[k].text);
      tag.setAttribute('lang', l === 'zh' ? 'zh-Hans' : 'en');

      // const size = Math.round(12 + Math.random()*14);
      // tag.style.fontSize = size+'px';
      // tag.style.fontWeight = size>22?'700':(size>18?'600':'500');
      const baseRot = side==='left' ? -8 : 8;
      tag.style.left = x+'px';
      tag.style.top  = y+'px';
      // 改为水平
      tag.style.transform = 'translate(-50%, -50%)';

      tag.addEventListener('click', ()=>{
        press(tag);
        personaClick(tag.dataset.type, list[k].text);
        gsap.to(tag,{ y:-6, duration:.12, yoyo:true, repeat:1, ease:"power2.out" });
      });

      cloudEl.appendChild(tag);
    }
  }

  placeSide(left,'left');
  placeSide(right,'right');

  // 调试：取消注释可以在控制台看数量
  // console.log('tags rendered:', document.querySelectorAll('.tag').length);
}



fetch('./tokens.json')
  .then(r => r.json())
  .then(data => {
    const list = (data && data.tokens) ? data.tokens.slice() : [];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    CLOUD_TOKENS = list;
    renderBrackets();
  })
  .catch(err => {
    console.warn("Failed to load tokens.json:", err);
  });

window.addEventListener('resize', renderBrackets);

// 如果 persona 是一张大图（1920×1080），等它加载完再排一次更稳
const personImg = document.getElementById('persona');
if (personImg && !personImg.complete) {
  personImg.addEventListener('load', renderBrackets, { once: true });
}

// 初始化
restore();
updateAwakenStateByRules();         // ← 新增：让恢复的计数立刻套用新规则
updateBadges();
swapTheme(STATE.transformed || 'neutral');

