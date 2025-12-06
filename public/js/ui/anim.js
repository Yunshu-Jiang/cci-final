const wrapEl  = document.getElementById('wrap');
const persona = document.getElementById('persona');
const flashEl = document.getElementById('flash');
let bubbleEl = null;
let bubbleHideTimer = null;
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
// reply
window.__bubble = function bubble(text, opts = {}) {
  const { isLoading = false, lang } = opts;
  if (!bubbleEl) {
    bubbleEl = document.createElement('div');
    bubbleEl.className = 'bubble';
    wrapEl.appendChild(bubbleEl);
  }

  bubbleEl.textContent = text;
  const inferred = lang || (/[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en');
  bubbleEl.setAttribute('lang', inferred === 'zh' ? 'zh-Hans' : 'en');
  if (bubbleHideTimer) {
    clearTimeout(bubbleHideTimer);
    bubbleHideTimer = null;
  }
  gsap.killTweensOf(bubbleEl);
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
  if (isLoading) return;
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

window.__toast = function toast(message, opts = {}) {
  const { duration = 3.2 } = opts;
  const old = document.querySelector('.toast');
  if (old) old.remove();

  const t = document.createElement('div');
  t.className = 'toast';
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
// swith theme
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
  let prev = null;
  if (wrapEl.classList.contains('theme-abstract')) prev = 'abstract';
  else if (wrapEl.classList.contains('theme-literary')) prev = 'literary';
  else if (wrapEl.classList.contains('theme-neutral')) prev = 'neutral';
  if (prev === theme) return;
  wrapEl.classList.remove('theme-neutral','theme-abstract','theme-literary');
  wrapEl.classList.add('theme-' + (theme in srcMap ? theme : 'neutral'));
  const tl = gsap.timeline();
  tl.set(flashEl, { background: 'rgba(255,255,255,0)' })
    .to(flashEl, { background: 'rgba(255,255,255,0.25)', duration: 0.12, ease: 'power1.out' })
    .to(flashEl, { background: 'rgba(255,255,255,0)', duration: 0.35, ease: 'power3.in' }, ">-0.02")
    .to(persona, { scale: 0.9, duration: 0.12, ease: 'power2.in' }, 0)
    .add(() => { persona.src = src; })
    .to(persona, { scale: 1.06, duration: 0.22, ease: 'back.out(2)' }, ">-0.05");
  if (prev && window.__p5bg && typeof window.__p5bg.collapseFromTo === 'function') {
    window.__p5bg.collapseFromTo(prev, theme);
  }
};
