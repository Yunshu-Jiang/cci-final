const mount = document.getElementById('bg');
const DESIGN = { W: 1920, H: 1080 };
const TILE_W = 40;
const TILE_H = 40;
const ROW_DELAY = 0.04;
const JITTER = 0.015;
const INIT_VY = 0;
const GRAVITY = 4800;
const FADE_SPEED = 600;
const BG_PATHS = {
  neutral : "./img/bg-neutral.png",
  abstract: "./img/bg-abstract.png",
  literary: "./img/bg-literary.png",
};

let images = {};
let tiles = [];
let running = false;
let startSec = 0;
let oldKey = null;
function getCoverMap(p) {
  const W = p.width, H = p.height;
  const scale = Math.max(W / DESIGN.W, H / DESIGN.H);
  const ox = (W - DESIGN.W * scale) / 2;
  const oy = (H - DESIGN.H * scale) / 2;
  return { scale, ox, oy };
}
class Tile {
  constructor(x, y, w, h, startT) {
    this.sx = x; this.sy = y; this.sw = w; this.sh = h;
    this.yOff = 0;
    this.vy = INIT_VY;
    this.startT = startT;
    this.started = false;
    this.alpha = 255;
    this.dead = false;
  }

  update(p, nowSec) {
    if (this.dead) return;
    if (nowSec < this.startT) return;
    if (!this.started) this.started = true;
    const dt = Math.min(0.05, p.deltaTime / 1000);
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
    p.push();
    p.tint(255, Math.max(0, Math.min(255, this.alpha)));
    p.image(img, dx, dy, dw, dh, this.sx, this.sy, this.sw, this.sh);
    p.pop();
  }
}

new p5((p) => {

  p.preload = () => {
    for (const k in BG_PATHS) {
      images[k] = p.loadImage(BG_PATHS[k]);
    }
  };

  p.setup = () => {
    const c = p.createCanvas(window.innerWidth, window.innerHeight);
    p.pixelDensity(1);
    p.noSmooth();
    c.parent(mount);
    p.noStroke();
  };

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
  };

  p.draw = () => {
    p.clear();
    if (!running || !oldKey) return;
    const img = images[oldKey];
    if (!img || img.width === 0) return;
    const nowSec = p.millis() / 1000;
    const map = getCoverMap(p);
    let alive = 0;
    for (const t of tiles) {
      if (t.dead) continue;
      t.draw(p, img, map);
      t.update(p, nowSec);
      if (!t.dead) alive++;
    }

    if (alive === 0) {
      running = false;
      tiles.length = 0;
      oldKey = null;
    }
  };

  function collapseFromTo(oldThemeKey, newThemeKey) {
    if (!images[oldThemeKey] || oldThemeKey === newThemeKey) return;
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
        const jitter = (Math.random() * 2 - 1) * JITTER;
        const startT = startSec + baseDelay + jitter;

        tiles.push(new Tile(x, y, w, h, startT));
      }
    }

    running = true;
  }
  window.__p5bg = {
    collapseFromTo
  };

}, mount);
