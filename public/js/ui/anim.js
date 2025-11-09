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
  // theme: 'neutral' | 'abstract' | 'literary'
  const srcMap = {
    neutral: "./img/person-neutral.svg",
    abstract:"./img/person-abstract.svg",
    literary:"./img/person-literary.svg"
  };
  const src = srcMap[theme] || srcMap.neutral;

  // 更新 wrap 的主题 class
  wrapEl.classList.remove('theme-neutral','theme-abstract','theme-literary');
  wrapEl.classList.add('theme-' + (theme in srcMap ? theme : 'neutral'));

  // 小型演出：闪一下 + 人物缩放
  const tl = gsap.timeline();
  tl.set(flashEl, { background: 'rgba(255,255,255,0)' })
    .to(flashEl, {
      background: 'rgba(255,255,255,0.25)',
      duration: 0.12,
      ease: 'power1.out'
    })
    .to(flashEl, {
      background: 'rgba(255,255,255,0)',
      duration: 0.35,
      ease: 'power3.in'
    }, ">-0.02")
    .to(persona, {
      scale: 0.9,
      duration: 0.12,
      ease: 'power2.in'
    }, 0)
    .add(() => {
      persona.src = src;
    })
    .to(persona, {
      scale: 1.06,
      duration: 0.22,
      ease: 'back.out(2)'
    }, ">-0.05");
};
