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

// --- 动效封装（来自 ui/anim.js） ---
function press(el)      { window.__press && window.__press(el); }
function bubble(text)   { window.__bubble && window.__bubble(text); }
function swapTheme(to)  { window.__swapTheme && window.__swapTheme(to); }

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
    Object.assign(STATE, s);
    if (STATE.transformed) {
      swapTheme(STATE.transformed);
    } else {
      swapTheme('neutral');
    }
    updateBadges();
  } catch {}
}
function persist() {
  localStorage.setItem('persona-state-v1', JSON.stringify(STATE));
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
    if (prev == null && next != null) STATE.awakenedOnce = true;
    // 切换主题（p5 会播放坍塌过场）
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
function systemStylePrompt(clickedType) {
  if (clickedType === 'abstract') {
    return `
You are a Gen Alpha / internet-native persona into memes, rap cadence, and gaming slang.
Write in a playful, slangy, meme-aware voice (skibidi, sigma, rizz, gyat, Ohio vibes, etc.) but keep it readable.

HARD RULES:
- Output exactly ONE sentence in English.
- It MUST be a grammatical sentence (not a fragment).
- NO hashtags, NO emojis, NO lists, NO markdown.
- 6–22 words max.

EXAMPLES:
- "Lowkey that move was skibidi-coded, not gonna lie."
- "Your rizz is on cooldown, but the vibe still goes hard."
- "Sigma focus locked in, the chaos kinda makes sense."`;
  }

  return `
You are an elegant and polite literary persona.
Write with calm flow, clear grammar, and subtle grace—like refined contemporary prose.

HARD RULES:
- Output exactly ONE sentence in English.
- It MUST be a grammatical sentence (not a fragment).
- NO hashtags, NO emojis, NO lists, NO markdown.
- 6–22 words max.

EXAMPLES:
- "There is a quiet steadiness here that invites gentler attention."
- "With measured confidence, the moment arranges itself into clarity."
- "Polite words can carry warmth without losing their precision."`;
}


// 可选：给模型的 user 指令，也按 type 区分一下
function userPrompt(clickedType) {
  return clickedType === 'abstract'
    ? "Reply in one slangy, meme-aware sentence that fits the current vibe; obey the hard rules."
    : "Reply in one polite, elegant sentence with smooth flow; obey the hard rules.";
}
function enforceStyle(text, clickedType) {
  // 显式处理空文本
  if (!text || !String(text).trim()) {
    return clickedType === 'abstract'
      ? "Lowkey loading up, give me a sec."
      : "Just a moment while I collect a proper sentence.";
  }
  let s = String(text).split('\n')[0].trim();
  s = s.replace(/#/g, '').replace(/\s{2,}/g, ' ').trim();

  const firstSentence = s.split(/(?<=[.!?。！？])\s+/)[0] || s;
  let out = firstSentence.trim();
  if (!/[.!?]$/.test(out)) out += '.';

  const words = out.split(/\s+/);
  if (words.length < 3) {
    out = out.replace(/[.!?]$/, '') + (clickedType === 'abstract' ? ', lowkey.' : ', indeed.');
  } else if (words.length > 24) {
    out = words.slice(0, 24).join(' ');
    if (!/[.!?]$/.test(out)) out += '.';
  }
  return out;
}


// --- 统一点击入口：按钮/词语云都调用这个 --- 
export async function personaClick(type) {
  if (type === 'abstract') STATE.abstract++;
  if (type === 'literary') STATE.literary++;

  // 先按新规则更新觉醒/中立/切换
  updateAwakenStateByRules();

  // 再更新 UI 徽章并持久化
  updateBadges();
  persist();

  // === 以下保持你的原有 AI 逻辑不变 ===
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
    let text;
    if (STATE.aiReady) {
      const messages = [
        { role: "system", content: systemStylePrompt(type) },
        { role: "user",   content: userPrompt(type) }
      ];
      text = await chatOnce(messages, { temperature: 0.95, max_tokens: 60 });
      text = enforceStyle(text, type);
      if (!text) text = enforceStyle(offlineReply(type), type);
    } else {
      text = enforceStyle(offlineReply(type), type);
    }
    bubble(text);
  } catch (err) {
    console.warn("AI chat error:", err);
    bubble(enforceStyle(offlineReply(type), type));
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
const CY_DESIGN = 620;  // 稍偏下居中
// 距离与形状
let INNER_GAP_DESIGN = 480;  // 离中轴线距离（越大离人物越远）
let BULGE_DESIGN     = 100;  // 中段鼓出量（越大越像“{}”）
let TOP_Y_DESIGN     = 300;  // 上边界
let BOTTOM_Y_DESIGN  = 940;  // 下边界

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
        personaClick(tag.dataset.type);
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

