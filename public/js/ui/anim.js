const wrapEl  = document.getElementById('wrap');
const persona = document.getElementById('persona');
const flashEl = document.getElementById('flash');

const replyEl = document.getElementById('reply');
const replyTextEl = document.getElementById('reply-text');

window.__press = function press(el) {
  if (!window.gsap) return;
  gsap.fromTo(el, { scale: 1 }, { scale: 0.92, duration: 0.08, yoyo: true, repeat: 1, ease: "power2.out" });
};

/**
 * 固定白色气泡更新器（FEEDING 用）
 * text: string
 * opts: { isLoading?: boolean, html?: string }
 */
window.__bubble = function bubble(text, opts = {}) {
  if (!replyEl || !replyTextEl) return;

  const isLoading = !!opts.isLoading;
  replyEl.classList.toggle('loading', isLoading);

  if (opts.html != null) {
    replyTextEl.innerHTML = opts.html;
  } else {
    replyTextEl.textContent = text || (isLoading ? "Loading…" : "…");
  }

  if (window.gsap) {
    gsap.fromTo(replyEl, { y: 6, opacity: 0.92 }, { y: 0, opacity: 1, duration: 0.18, ease: "power2.out" });
  }
};

// 主题切换：维持你原来的逻辑（neutral / abstract / literary）
window.__swapTheme = function swapTheme(theme) {
  const srcMap = {
    neutral: "./img/person-neutral.png",
    abstract:"./img/person-abstract.png",
    literary:"./img/person-literary.png"
  };
  const src = srcMap[theme] || srcMap.neutral;

  let prev = null;
  if (wrapEl.classList.contains('theme-abstract')) prev = 'abstract';
  else if (wrapEl.classList.contains('theme-literary')) prev = 'literary';
  else if (wrapEl.classList.contains('theme-neutral')) prev = 'neutral';

  if (prev === theme) return;

  wrapEl.classList.remove('theme-neutral','theme-abstract','theme-literary');
  wrapEl.classList.add('theme-' + (theme in srcMap ? theme : 'neutral'));

  if (!window.gsap) {
    persona.src = src;
  } else {
    const tl = gsap.timeline();
    tl.set(flashEl, { background: 'rgba(255,255,255,0)' })
      .to(flashEl, { background: 'rgba(255,255,255,0.25)', duration: 0.12, ease: 'power1.out' })
      .to(flashEl, { background: 'rgba(255,255,255,0)', duration: 0.35, ease: 'power3.in' }, ">-0.02")
      .to(persona, { scale: 0.9, duration: 0.12, ease: 'power2.in' }, 0)
      .add(() => { persona.src = src; })
      .to(persona, { scale: 1.06, duration: 0.22, ease: 'back.out(2)' }, ">-0.05");
  }

  if (prev && window.__p5bg && typeof window.__p5bg.collapseFromTo === 'function') {
    window.__p5bg.collapseFromTo(prev, theme);
  }
};
