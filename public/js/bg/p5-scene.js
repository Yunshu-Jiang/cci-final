// bg/p5-scene.js
// 使用 p5.js 在背景层绘制随“气质”变化的粒子场

const mount = document.getElementById('bg');

// 读取本地存储的状态（abstract/literary/transformed）
function readState() {
  try {
    return JSON.parse(localStorage.getItem('persona-state-v1') || '{}');
  } catch {
    return {};
  }
}

new p5((p) => {
  const dots = [];
  const DOTS = 260;

  p.setup = function () {
    p.createCanvas(window.innerWidth, window.innerHeight).parent(mount);
    p.pixelDensity(1);
    for (let i = 0; i < DOTS; i++) {
      dots.push({
        x: p.random(p.width),
        y: p.random(p.height),
        vx: p.random(-0.5, 0.5),
        vy: p.random(-0.5, 0.5),
        s: p.random(1, 3),
        seed: p.random(1000)
      });
    }
  };

  p.windowResized = function () {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
  };

  function lerp3(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ];
  }

  p.draw = function () {
    const st = readState();
    const diff = (st.abstract || 0) - (st.literary || 0);
    const maxAbs = Math.max(15, Math.abs(diff));
    const mood = p.constrain(diff / maxAbs, -1, 1); // [-1, 1]

    // 背景色：文学偏蓝金，抽象偏紫绿
    const bg = lerp3([8, 6, 12], [22, 18, 34], (mood + 1) / 2);
    p.clear();
    p.background(bg[0], bg[1], bg[2],20);

    p.noStroke();
    const noiseScale = p.map(mood, -1, 1, 0.0009, 0.0026);

    for (let d of dots) {
      const jitter = p.map(mood, -1, 1, 0.12, 0.85);
      d.vx += p.map(p.noise(d.seed + p.frameCount * 0.003), 0, 1, -jitter, jitter) * 0.02;
      d.vy += p.map(p.noise(d.seed + p.frameCount * 0.003 + 99), 0, 1, -jitter, jitter) * 0.02;
      d.x += d.vx;
      d.y += d.vy;
      if (d.x < 0 || d.x > p.width) d.vx *= -1;
      if (d.y < 0 || d.y > p.height) d.vy *= -1;

      const c1 = mood < 0 ? [170, 190, 220] : [210, 120, 255];
      const c2 = mood < 0 ? [235, 220, 180] : [120, 255, 160];
      const t = p.noise(d.x * noiseScale, d.y * noiseScale);
      const c = lerp3(c1, c2, t);
      p.fill(c[0], c[1], c[2], 110);

      const sz = d.s * (mood < 0 ? 1.1 : p.map(t, 0, 1, 1.1, 3.2));
      const h  = sz * (mood < 0 ? 1 : p.map(t, 0, 1, 1, 1.8));
      p.ellipse(d.x, d.y, sz, h);
    }

    if (st.transformed) {
      const pulse = (p.sin(p.frameCount * 0.02) + 1) / 2;
      const glow = st.transformed === 'abstract'
        ? [180, 255, 220]
        : [255, 230, 180];
      p.fill(glow[0], glow[1], glow[2], 10 + pulse * 22);
      p.rect(0, 0, p.width, p.height);
    }
  };
}, mount);
