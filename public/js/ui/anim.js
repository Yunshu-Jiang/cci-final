// ui/anim.js
// 用 GSAP 控制：按钮按压、气泡弹出、主题（人物+背景）切换动画

const wrapEl  = document.getElementById('wrap');
const persona = document.getElementById('persona');
const flashEl = document.getElementById('flash');
let bubbleEl = null;
let bubbleHideTimer = null;

// 1. 按钮/词语点击的按压反馈
// 1. 按钮/词语点击的按压反馈
window.__press = function press(el) {
  gsap.fromTo(
    el,
    { scale: 1 },
    {
      scale: 0.86,
      duration: 0.1,
      yoyo: true,
      repeat: 1,
      ease: "power2.out"
    }
  );
};


// 2. AI 回复气泡
// 2. AI 回复气泡：固定在底部 1/5，支持 loading 状态
window.__bubble = function bubble(text, opts = {}) {
  const { isLoading = false } = opts;

  // 如果还没有气泡，就创建一个；如果有，就复用
  if (!bubbleEl) {
    bubbleEl = document.createElement('div');
    bubbleEl.className = 'bubble';
    wrapEl.appendChild(bubbleEl);
  }

  bubbleEl.textContent = text;

  // 清掉之前的隐藏定时器 & 动画
  if (bubbleHideTimer) {
    clearTimeout(bubbleHideTimer);
    bubbleHideTimer = null;
  }
  gsap.killTweensOf(bubbleEl);

  // 轻微淡入 + scale 动画（不改位置，只在底部区域内动）
  gsap.fromTo(
    bubbleEl,
    { opacity: 0, scale: 0.96 },
    {
      opacity: 1,
      scale: 1,
      duration: 0.25,
      ease: "power2.out"
    }
  );

  // loading 状态：只显示，不自动消失，等下一次调用覆盖它
  if (isLoading) return;

  // 正常回复：按字数估算阅读时间，再自动淡出并销毁
  const len = (text || '').length;
  const readingSeconds = Math.max(2, Math.min(6, len / 8));

  bubbleHideTimer = setTimeout(() => {
    gsap.to(bubbleEl, {
      opacity: 0,
      duration: 0.35,
      ease: "power2.in",
      onComplete: () => {
        if (bubbleEl) {
          bubbleEl.remove();
          bubbleEl = null;
        }
      }
    });
  }, readingSeconds * 1000);
};

// 2.5 右上角提示 toast（第一次觉醒用）
window.__toast = function toast(message, opts = {}) {
  const { duration = 3.2 } = opts;

  // 单例：有就先删
  const old = document.querySelector('.toast');
  if (old) old.remove();

  const t = document.createElement('div');
  t.className = 'toast';

  // 支持传 string 或 { zh, en }
  if (typeof message === 'string') {
    t.textContent = message;
  } else {
    const zh = message.zh || '';
    const en = message.en || '';
    t.innerHTML = `<div class="toast-zh">${zh}</div><div class="toast-en">${en}</div>`;
  }

  wrapEl.appendChild(t);

  gsap.fromTo(
    t,
    { opacity: 0, y: -8, scale: 0.98 },
    { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: "power2.out" }
  );

  gsap.to(t, {
    opacity: 0,
    y: -10,
    duration: 0.28,
    delay: duration,
    ease: "power2.in",
    onComplete: () => t.remove()
  });
};


// 3. 主题切换：同时切换人物图片 + 背景 class，并加闪光与缩放
window.__swapTheme = function swapTheme(theme) {
  const srcMap = {
    neutral: "./img/person-neutral.png",
    abstract:"./img/person-abstract.png",
    literary:"./img/person-literary.png"
  };
  const src = srcMap[theme] || srcMap.neutral;

  const wrapEl = document.getElementById('wrap');
  const persona = document.getElementById('persona');
  const flashEl = document.getElementById('flash');

  // 识别旧主题（用于 p5 过场）
  let prev = null;
  if (wrapEl.classList.contains('theme-abstract')) prev = 'abstract';
  else if (wrapEl.classList.contains('theme-literary')) prev = 'literary';
  else if (wrapEl.classList.contains('theme-neutral')) prev = 'neutral';

  // 如果主题没变，直接返回（初始化时也会走到这里）
  if (prev === theme) return;

  // 切换 CSS 背景类（新背景先到位，p5 画旧背景碎片在上层坍塌）
  wrapEl.classList.remove('theme-neutral','theme-abstract','theme-literary');
  wrapEl.classList.add('theme-' + (theme in srcMap ? theme : 'neutral'));

  // 闪光 + 人物小弹动（与你之前一致）
  const tl = gsap.timeline();
  tl.set(flashEl, { background: 'rgba(255,255,255,0)' })
    .to(flashEl, { background: 'rgba(255,255,255,0.25)', duration: 0.12, ease: 'power1.out' })
    .to(flashEl, { background: 'rgba(255,255,255,0)', duration: 0.35, ease: 'power3.in' }, ">-0.02")
    .to(persona, { scale: 0.9, duration: 0.12, ease: 'power2.in' }, 0)
    .add(() => { persona.src = src; })
    .to(persona, { scale: 1.06, duration: 0.22, ease: 'back.out(2)' }, ">-0.05");

  // 触发 p5 的坍塌过场（旧 → 新）
  if (prev && window.__p5bg && typeof window.__p5bg.collapseFromTo === 'function') {
    window.__p5bg.collapseFromTo(prev, theme);
  }
};
