// public/js/app.js
// 核心逻辑：状态管理 + 词语云 + AI 调用 + 觉醒变身

import './ui/anim.js';
import './bg/p5-scene.js';
import { ensureAI, chatOnce } from './ai-webllm.js';

const STATE = {
  abstract:   0,
  literary:   0,
  transformed:null, // null | 'abstract' | 'literary'
  mode:       'neutral',
  aiReady:    false,
  aiInitTried:false
};
const THRESHOLD = 15;

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
function computeMode() {
  const diff = STATE.abstract - STATE.literary;
  if (STATE.transformed) {
    return STATE.transformed === 'abstract' ? 'trans_abstract' : 'trans_literary';
  }
  if (Math.max(STATE.abstract, STATE.literary) >= THRESHOLD) {
    return diff >= 0 ? 'trans_abstract' : 'trans_literary';
  }
  if (Math.abs(diff) >= 3) {
    return diff > 0 ? 'lean_abstract' : 'lean_literary';
  }
  return 'neutral';
}

function updateBadges() {
  statsEl.textContent = `Abstract ${STATE.abstract} · Literary ${STATE.literary}`;
  STATE.mode = computeMode();
  modeEl.textContent = ({
    neutral       : 'Neutral',
    lean_abstract : 'Leaning Abstract',
    lean_literary : 'Leaning Literary',
    trans_abstract: 'Abstract Awakened',
    trans_literary: 'Literary Awakened'
  })[STATE.mode] || 'Neutral';
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
You are a Gen Alpha / late Gen Z style persona obsessed with street culture, rap, gaming and internet memes.
Your tone:
- lots of modern slang, playful, slightly chaotic
- you may use informal spelling, "bro", "fr", "lowkey", etc.
- no corporate or serious academic tone
- answer in English, one short line, max 30 words.
`;
  } else {
    return `
You are an elegant, literary persona.
Your tone:
- polite, calm and respectful
- subtle, graceful wording, maybe a light metaphor
- no slang, no emojis, no memes
- answer in English, one short line, max 30 words.
`;
  }
}

// 可选：给模型的 user 指令，也按 type 区分一下
function userPrompt(clickedType) {
  if (clickedType === 'abstract') {
    return "React to the current vibe in one short, slangy line, like a Gen Alpha into rap, games and memes.";
  } else {
    return "React to the current vibe in one short, polite and elegant line, with a touch of literary flavor.";
  }
}

// --- 统一点击入口：按钮/词语云都调用这个 --- 
export async function personaClick(type) {
  if (type === 'abstract') STATE.abstract++;
  if (type === 'literary') STATE.literary++;

  updateBadges();
  persist();

  // 首次懒加载 AI
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

  // 生成回复
  try {
    let text;
    if (STATE.aiReady) {
      const messages = [
        { role: "system", content: systemStylePrompt(type) },
        { role: "user",   content: userPrompt(type) }
      ];
      text = await chatOnce(messages, { temperature: 0.9, max_tokens: 60 });
      if (!text) text = offlineReply(type);
    } else {
      text = offlineReply(type);
    }
    bubble(text);
  } catch (err) {
    console.warn("AI chat error:", err);
    bubble(offlineReply(type));
  }

  // 觉醒触发：某一值 >= 15
  const maxVal = Math.max(STATE.abstract, STATE.literary);
  if (!STATE.transformed && maxVal >= THRESHOLD) {
    STATE.transformed = STATE.abstract >= STATE.literary ? 'abstract' : 'literary';
    swapTheme(STATE.transformed);
    persist();
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

function renderRing() {
  if (!CLOUD_TOKENS.length) return;
  cloudEl.innerHTML = '';

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight * 0.6;
  const radius = Math.min(window.innerWidth, window.innerHeight) * 0.35;

  CLOUD_TOKENS.forEach((t, i) => {
    const angle = (2 * Math.PI * i) / CLOUD_TOKENS.length;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);

    const span = document.createElement('span');
    span.className = 'tag';
    span.dataset.type = t.type;      // 'abstract' | 'literary'
    span.textContent = t.text;

    const size = Math.round(randomBetween(12, 26));
    span.style.fontSize   = size + 'px';
    span.style.fontWeight = size > 22 ? '700' : (size > 18 ? '600' : '500');
    span.style.left = x + 'px';
    span.style.top  = y + 'px';
    span.style.transform =
      'translate(-50%, -50%) rotate(' + randomBetween(-6, 6) + 'deg)';

    span.addEventListener('click', () => {
      press(span);
      personaClick(t.type);
      gsap.to(span, { y:-6, duration:.12, yoyo:true, repeat:1, ease:"power2.out" });
    });

    cloudEl.appendChild(span);
  });
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
    renderRing();
  })
  .catch(err => {
    console.warn("Failed to load tokens.json:", err);
  });

window.addEventListener('resize', () => {
  renderRing();
});

// 初始化
restore();
updateBadges();
swapTheme(STATE.transformed || 'neutral');
