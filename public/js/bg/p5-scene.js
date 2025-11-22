// p5 背景过场：旧背景切成 20×20 设计像素的 tile，从上到下“坍塌”露出新背景
// 画布透明，叠在 CSS 背景之上，人物/词语云在其上层

const mount = document.getElementById('bg');

// —— 设计画布尺寸（与背景图一致）——
const DESIGN = { W: 1920, H: 1080 };

// —— 网格参数（按设计像素）——
const TILE_W = 40;                 // ★ 你要的 20×20
const TILE_H = 40;

// —— 动画参数（以“设计像素/秒”为单位）——
const ROW_DELAY = 0.04;            // 每一行比上一行晚 0.02s（从上到下）
const JITTER = 0.015;              // 每个 tile 的随机启动抖动
const INIT_VY = 0;                 // 初始下落速度（设计 px/s）
const GRAVITY = 4800;              // 重力（设计 px/s^2）
const FADE_SPEED = 600;            // 透明度每秒衰减（0~255）

// —— 资源 ——
// 路径要与 CSS 背景一致
const BG_PATHS = {
  neutral : "./img/bg-neutral.png",
  abstract: "./img/bg-abstract.png",
  literary: "./img/bg-literary.png",
};

let images = {};      // { neutral: p5.Image, ... }
let tiles = [];       // 当前动画的 tile 列表
let running = false;  // 是否正在播放过场
let startSec = 0;     // 过场起始时间（秒）
let oldKey = null;    // 本次坍塌使用的旧背景 key

// 统一 cover 映射：设计坐标 -> 屏幕坐标
function getCoverMap(p) {
  const W = p.width, H = p.height;
  const scale = Math.max(W / DESIGN.W, H / DESIGN.H); // cover
  const ox = (W - DESIGN.W * scale) / 2;
  const oy = (H - DESIGN.H * scale) / 2;
  return { scale, ox, oy };
}

// Tile 对象（仅保存设计坐标）
class Tile {
  constructor(x, y, w, h, startT) {
    // 源图子区域（设计坐标）
    this.sx = x; this.sy = y; this.sw = w; this.sh = h;

    // 动画状态（设计坐标的位移/速度）
    this.yOff = 0;
    this.vy = INIT_VY;

    // 时间控制（秒）
    this.startT = startT;     // 启动时间（绝对秒）
    this.started = false;

    // 透明度
    this.alpha = 255;

    this.dead = false;
  }

  update(p, nowSec) {
    if (this.dead) return;
    if (nowSec < this.startT) return; // 未到启动时间，保持静止
    if (!this.started) this.started = true;

    const dt = Math.min(0.05, p.deltaTime / 1000); // s，限制最大步长避免跳帧过猛

    // 下落 + 衰减
    this.vy += GRAVITY * dt;
    this.yOff += this.vy * dt;
    this.alpha -= FADE_SPEED * dt;

    if (this.alpha <= 0) this.dead = true;
  }

  draw(p, img, map) {
    if (this.dead) return;

    const { scale, ox, oy } = map;

    const dx = ox + this.sx * scale;
    const dy = oy + (this.sy + this.yOff) * scale;
    const dw = this.sw * scale;
    const dh = this.sh * scale;

    // 源子区域仍用设计坐标（图片就是 1920×1080）
    p.push();
    p.tint(255, Math.max(0, Math.min(255, this.alpha)));
    p.image(img, dx, dy, dw, dh, this.sx, this.sy, this.sw, this.sh);
    p.pop();
  }
}

new p5((p) => {

  p.preload = () => {
    // 预加载三张背景
    for (const k in BG_PATHS) {
      images[k] = p.loadImage(BG_PATHS[k]);
    }
  };

  p.setup = () => {
    const c = p.createCanvas(window.innerWidth, window.innerHeight);
    p.pixelDensity(1);   // 关闭 Retina 2x/3x 像素密度，直接减半/三分之一像素填充量
    p.noSmooth();        // 关闭插值采样，少一点 GPU 过滤成本（画面更像像素块）
    c.parent(mount);
    p.noStroke();
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
  };

  p.draw = () => {
    // 透明画布，不遮住 CSS 背景与上层 UI
    p.clear();

    if (!running || !oldKey) return;

    const img = images[oldKey];
    if (!img || img.width === 0) return;

    const nowSec = p.millis() / 1000;
    const map = getCoverMap(p);

    let alive = 0;

    // 先画所有“未启动”的 tile（保持旧背景静止），再更新并画已启动的
    // 为了简单与性能，这里合并在一次循环中处理
    for (const t of tiles) {
      if (t.dead) continue;
      // 先画（没到启动时间也要画，才能“遮住”下面的新背景）
      t.draw(p, img, map);
      // 再更新
      t.update(p, nowSec);
      if (!t.dead) alive++;
    }

    if (alive === 0) {
      running = false;
      tiles.length = 0;
      oldKey = null;
    }
  };

  // —— 对外 API：从 oldTheme 到 newTheme 的坍塌过场 —— //
  function collapseFromTo(oldThemeKey, newThemeKey) {
    // 保护：资源没好/同主题/没有 old 直接不播
    if (!images[oldThemeKey] || oldThemeKey === newThemeKey) return;

    // 构建 tile 网格（按设计坐标）
    tiles.length = 0;
    oldKey = oldThemeKey;
    startSec = p.millis() / 1000;

    const rows = Math.ceil(DESIGN.H / TILE_H);
    const cols = Math.ceil(DESIGN.W / TILE_W);

    for (let row = 0; row < rows; row++) {
      const y = row * TILE_H;
      const h = Math.min(TILE_H, DESIGN.H - y);
      const baseDelay = row * ROW_DELAY;

      for (let col = 0; col < cols; col++) {
        const x = col * TILE_W;
        const w = Math.min(TILE_W, DESIGN.W - x);

        // 每个 tile 的启动时间：行延迟 + 微抖动
        const jitter = (Math.random() * 2 - 1) * JITTER;
        const startT = startSec + baseDelay + jitter;

        tiles.push(new Tile(x, y, w, h, startT));
      }
    }

    running = true;
  }

  // 暴露给外部（ui/anim.js 调用）
  window.__p5bg = {
    collapseFromTo
  };

}, mount);
