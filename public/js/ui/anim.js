// ui/anim.js
// 用 GSAP 控制：按钮按压、气泡弹出、主题（人物+背景）切换动画

const wrapEl  = document.getElementById('wrap');
const persona = document.getElementById('persona');
const flashEl = document.getElementById('flash');

// 1. 按钮/词语点击的按压反馈
window.__press = function press(el) {
  gsap.fromTo(el,
    { scale: 1 },
    { scale: 0.92, duration: 0.08, yoyo: true, repeat: 1, ease: "power2.out" }
  );
};

// 2. AI 回复气泡
window.__bubble = function bubble(text) {
  const b = document.createElement('div');
  b.className = 'bubble';
  b.textContent = text;
  wrapEl.appendChild(b);

  // 估算阅读时间：按大约“每秒 8 个字符”算，
  // 最少停留 2 秒，最多 6 秒。
  const len = (text || '').length;
  const readingSeconds = Math.max(2, Math.min(6, len / 8));

  gsap.fromTo(
    b,
    { y: 0, opacity: 0, scale: 0.9 },
    {
      y: -60,
      opacity: 1,
      scale: 1,
      duration: 0.35,
      ease: "back.out(1.6)",
      onComplete() {
        gsap.to(b, {
          y: -110,
          opacity: 0,
          duration: 0.6,
          delay: readingSeconds,   // ⬅️ 这里由原来的 0.8s 改成 readingSeconds
          ease: "power2.in",
          onComplete: () => b.remove()
        });
      }
    }
  );
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
