/* ==========================================================
   景物（用 canvas 畫，固定亂數種子，每次長一樣）
   背景：黃昏的天空、月亮、金霞、遠山、遠方的櫻花林、玉砂利地面、石板參道、
         兩側的大櫻花樹和石燈籠（靜態，視窗大小改變時重畫一次）
   前景：從左上、右上角垂下來的櫻花枝（每格重畫，隨風輕擺）
   線條風格配合 torii.png：深色粗描邊、平塗上色
   ========================================================== */
const Scenery = (() => {
  const INK = '#2a1217';
  let W = 0, H = 0, DPR = 1, u = 1;
  let L = { groundY: 0, cx: 0, gateW: 0 };
  let branches = [];

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const between = (r, a, b) => a + r() * (b - a);

  // layout：鳥居底部的 y、中心 x、寬度（由 main.js 從畫面上的鳥居量出來）
  function resize(w, h, dpr, canvases, layout) {
    W = w; H = h; DPR = dpr; u = Math.min(W / 100, H / 56.25);
    L = layout;
    for (const c of [canvases.bg, canvases.front]) {
      c.width = Math.round(W * DPR);
      c.height = Math.round(H * DPR);
    }
    const g = canvases.bg.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground(g);
    canvases.front.getContext('2d').setTransform(DPR, 0, 0, DPR, 0, 0);
    branches = [
      { ...makeBranch(11, u * 31, 0.5), x: -u * 1.2, y: -u * 1.6, flip: 1, phase: 0 },
      { ...makeBranch(29, u * 24, 0.85), x: W + u * 1.2, y: -u * 1.2, flip: -1, phase: 1.7 },
    ];
  }

  /* ---------------- 背景 ---------------- */
  function drawBackground(g) {
    const r = rng(20261031);
    const hz = L.groundY - u * 5.5; // 地平線
    g.clearRect(0, 0, W, H);

    // 天空：上面深緋紅，往地平線漸漸變成櫻花粉
    const sky = g.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#2e0717');
    sky.addColorStop(0.3, '#661229');
    sky.addColorStop(0.6, '#b02c51');
    sky.addColorStop(0.85, '#e9849f');
    sky.addColorStop(1, '#ffd2dc');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, hz + 2);

    // 星星：越往下越淡
    g.fillStyle = '#ffe9ef';
    for (let i = 0; i < 90; i++) {
      const y = Math.pow(r(), 1.6) * hz * 0.5;
      g.globalAlpha = (1 - y / (hz * 0.5)) * between(r, 0.3, 0.9);
      g.beginPath();
      g.arc(r() * W, y, between(r, 0.6, 1.6), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    moon(g, W * 0.79, H * 0.25, u * 4.2);

    // 鳥居後面一團柔光，讓鳥居浮出來
    const glow = g.createRadialGradient(L.cx, L.groundY - L.gateW * 0.32, 0, L.cx, L.groundY - L.gateW * 0.32, L.gateW * 0.7);
    glow.addColorStop(0, 'rgba(255, 222, 230, 0.38)');
    glow.addColorStop(1, 'rgba(255, 222, 230, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, hz);

    kasumi(g, r, hz);
    ridge(g, r, hz - u * 7, u * 6, '#c4607f', hz);
    ridge(g, r, hz - u * 3, u * 4.5, '#963a5b', hz);
    // 地平線的薄霧
    const haze = g.createLinearGradient(0, hz - u * 6, 0, hz);
    haze.addColorStop(0, 'rgba(255, 200, 215, 0)');
    haze.addColorStop(1, 'rgba(255, 200, 215, 0.55)');
    g.fillStyle = haze;
    g.fillRect(0, hz - u * 6, W, u * 6);

    treeLine(g, r, hz);
    ground(g, r, hz);
    path(g, r, hz);
    fallenPetals(g, r, hz);

    bigTree(g, rng(7), u * 4, L.groundY + u * 3.5, u * 26, 1);
    bigTree(g, rng(8), W - u * 4, L.groundY + u * 3.5, u * 25, -1);

    const off = Math.max(L.gateW * 0.62, u * 30);
    lantern(g, L.cx - off, L.groundY + u * 2.4, u * 15);
    lantern(g, L.cx + off, L.groundY + u * 2.4, u * 15);
  }

  function moon(g, x, y, R) {
    const halo = g.createRadialGradient(x, y, R * 0.9, x, y, R * 4.5);
    halo.addColorStop(0, 'rgba(255, 228, 220, 0.4)');
    halo.addColorStop(1, 'rgba(255, 228, 220, 0)');
    g.fillStyle = halo;
    g.fillRect(x - R * 5, y - R * 5, R * 10, R * 10);
    const body = g.createRadialGradient(x - R * 0.3, y - R * 0.3, 0, x, y, R);
    body.addColorStop(0, '#fffaf2');
    body.addColorStop(1, '#ffe2d4');
    g.fillStyle = body;
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(236, 180, 170, 0.35)';
    for (const [dx, dy, s] of [[-0.3, -0.15, 0.22], [0.25, 0.2, 0.16], [0.05, -0.45, 0.1], [-0.1, 0.45, 0.13]]) {
      g.beginPath(); g.arc(x + dx * R, y + dy * R, s * R, 0, Math.PI * 2); g.fill();
    }
  }

  // 金霞（すやり霞）：日本畫裡橫向的圓角霞帶
  function kasumi(g, r, hz) {
    for (let i = 0; i < 8; i++) {
      const w = u * between(r, 14, 34);
      const h = u * between(r, 1.1, 2);
      const x = r() * W - w / 2;
      const y = hz * between(r, 0.3, 0.86);
      g.beginPath();
      g.roundRect(x, y, w, h, h / 2);
      g.fillStyle = 'rgba(255, 196, 168, 0.2)';
      g.fill();
      g.lineWidth = u * 0.12;
      g.strokeStyle = 'rgba(255, 228, 196, 0.38)';
      g.stroke();
    }
  }

  function ridge(g, r, base, amp, color, hz) {
    const p1 = r() * 10, p2 = r() * 10, p3 = r() * 10;
    g.beginPath();
    g.moveTo(0, hz + 2);
    for (let x = 0; x <= W + u; x += u) {
      const k = 0.5 + 0.3 * Math.sin(x / (u * 17) + p1) + 0.15 * Math.sin(x / (u * 7) + p2) + 0.05 * Math.sin(x / (u * 2.3) + p3);
      g.lineTo(x, base - amp * k);
    }
    g.lineTo(W, hz + 2);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  // 遠方的櫻花林：沿著地平線一排粉色的圓
  function treeLine(g, r, hz) {
    const blobs = [];
    for (let x = -u * 2; x < W + u * 2; x += u * between(r, 1, 1.8)) {
      blobs.push([x, hz - u * between(r, 0.2, 1.6), u * between(r, 1.3, 2.4)]);
    }
    g.fillStyle = '#d97b97';
    for (const [x, y, s] of blobs) { g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#efa3b9';
    for (const [x, y, s] of blobs) { g.beginPath(); g.arc(x - s * 0.15, y - s * 0.25, s * 0.7, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#d97b97';
    g.fillRect(0, hz - u * 0.4, W, u * 1.2);
  }

  // 玉砂利：粉灰色的碎石地
  function ground(g, r, hz) {
    const gr = g.createLinearGradient(0, hz, 0, H);
    gr.addColorStop(0, '#d9a7b4');
    gr.addColorStop(0.5, '#c08798');
    gr.addColorStop(1, '#9c6176');
    g.fillStyle = gr;
    g.fillRect(0, hz + u * 0.6, W, H - hz);
    for (let i = 0; i < 1600; i++) {
      const t = r();
      const y = hz + u + (H - hz) * t;
      const s = (0.6 + t * 2.2) * Math.max(0.6, u / 19.2) * between(r, 0.6, 1.2);
      g.fillStyle = r() < 0.5 ? 'rgba(255, 236, 240, 0.35)' : 'rgba(90, 40, 55, 0.18)';
      g.beginPath();
      g.ellipse(r() * W, y, s, s * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  // 石板參道：從地平線往鏡頭變寬，穿過鳥居
  function path(g, r, hz) {
    const top = u * 3, bot = Math.max(u * 52, L.gateW * 0.95);
    const half = (y) => (top + (bot - top) * ((y - hz) / (H - hz))) / 2;
    const rows = 10;
    let prev = hz + u * 0.6;
    for (let k = 1; k <= rows; k++) {
      const y = hz + (H - hz) * Math.pow(k / rows, 1.5);
      const n = k % 2 ? 2 : 3;
      for (let j = 0; j < n; j++) {
        const a = j / n, b = (j + 1) / n;
        const xs = (yy, f) => L.cx - half(yy) + half(yy) * 2 * f;
        g.beginPath();
        g.moveTo(xs(prev, a), prev);
        g.lineTo(xs(prev, b), prev);
        g.lineTo(xs(y, b), y);
        g.lineTo(xs(y, a), y);
        g.closePath();
        const l = between(r, 0, 1);
        g.fillStyle = l < 0.33 ? '#b9a6ad' : l < 0.66 ? '#ae9aa2' : '#c3b1b7';
        g.fill();
        g.lineWidth = Math.max(0.6, u * 0.22 * (y - hz) / (H - hz));
        g.strokeStyle = 'rgba(42, 18, 23, 0.6)';
        g.stroke();
      }
      prev = y;
    }
  }

  function fallenPetals(g, r, hz) {
    for (let i = 0; i < 520; i++) {
      const t = Math.pow(r(), 0.8);
      const y = hz + u + (H - hz) * t;
      const s = (0.5 + t * 2.4) * Math.max(0.6, u / 19.2) * between(r, 0.7, 1.3);
      g.fillStyle = r() < 0.6 ? 'rgba(255, 196, 212, 0.85)' : 'rgba(255, 232, 238, 0.85)';
      g.beginPath();
      g.ellipse(r() * W, y, s * 1.4, s * 0.7, between(r, -0.6, 0.6), 0, Math.PI * 2);
      g.fill();
    }
  }

  // 大櫻花樹：樹幹深色描邊，樹冠是一團團粉色，配上深紅的小波浪筆觸（跟 torii.png 的櫻花同一種畫法）
  function bigTree(g, r, bx, by, size, flip) {
    const cx = bx + flip * size * 0.14, cy = by - size * 0.95;
    const rx = size * 0.55, ry = size * 0.33;

    // 樹幹與枝
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const limbs = [
      [[bx, by], [bx + flip * size * 0.06, by - size * 0.4], [cx, cy + ry * 0.2], size * 0.085],
      [[cx - flip * size * 0.03, cy + ry * 0.5], [cx - flip * size * 0.3, cy + ry * 0.1], [cx - flip * rx * 0.75, cy - ry * 0.1], size * 0.035],
      [[cx, cy + ry * 0.3], [cx + flip * size * 0.22, cy], [cx + flip * rx * 0.7, cy - ry * 0.25], size * 0.03],
      [[cx, cy + ry * 0.2], [cx - flip * size * 0.02, cy - ry * 0.4], [cx + flip * size * 0.05, cy - ry * 0.8], size * 0.03],
    ];
    for (const pass of [0, 1]) {
      for (const [a, c, b, w] of limbs) {
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.quadraticCurveTo(c[0], c[1], b[0], b[1]);
        g.lineWidth = pass ? w : w + u * 0.5;
        g.strokeStyle = pass ? '#5a3536' : INK;
        g.stroke();
      }
    }

    const blobs = [];
    for (let i = 0; i < 52; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.85;
      blobs.push([cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, size * between(r, 0.08, 0.15)]);
    }
    const circles = (list, k = 1, dx = 0, dy = 0) => {
      g.beginPath();
      for (const [x, y, s] of list) { g.moveTo(x + dx * s + s * k, y + dy * s); g.arc(x + dx * s, y + dy * s, s * k, 0, Math.PI * 2); }
    };
    // 外緣：先畫粗的深粉邊，再填滿，只留外圈
    circles(blobs);
    g.lineWidth = u * 0.7;
    g.strokeStyle = '#d4647f';
    g.stroke();
    g.fillStyle = '#f7b3c4';
    g.fill();

    g.save();
    circles(blobs);
    g.clip();
    g.fillStyle = '#ec93aa';
    circles(blobs.filter((b) => b[1] > cy - ry * 0.1), 0.85, 0.15, 0.45);
    g.fill();
    g.fillStyle = '#ffd5df';
    circles(blobs.filter((b) => b[1] < cy + ry * 0.2), 0.5, -0.2, -0.35);
    g.fill();
    // 深紅的小波浪筆觸
    g.strokeStyle = '#c4405c';
    g.lineWidth = Math.max(1, u * 0.16);
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.8;
      let x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
      const s = size * between(r, 0.018, 0.03);
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 3; k++) { g.arc(x + s, y, s, Math.PI, 0, false); x += s * 2; }
      g.stroke();
    }
    g.fillStyle = 'rgba(255, 244, 247, 0.9)';
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.9;
      g.beginPath();
      g.arc(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, size * between(r, 0.005, 0.011), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  // 石燈籠：基礎、竿、中台、火袋（點著燈）、笠、寶珠
  function lantern(g, x, by, h) {
    const lw = Math.max(1.2, u * 0.22);
    const part = (w, y0, hh, fill) => {
      g.beginPath();
      g.roundRect(x - w / 2, y0, w, hh, hh * 0.15);
      g.fillStyle = fill;
      g.fill();
      g.lineWidth = lw;
      g.strokeStyle = INK;
      g.stroke();
    };
    g.fillStyle = 'rgba(60, 20, 35, 0.3)';
    g.beginPath(); g.ellipse(x, by, h * 0.3, h * 0.04, 0, 0, Math.PI * 2); g.fill();

    let y = by - h * 0.08;
    part(h * 0.42, y, h * 0.08, '#a8969e');
    y -= h * 0.34;
    part(h * 0.13, y, h * 0.34, '#b7a6ad');
    y -= h * 0.07;
    part(h * 0.36, y, h * 0.07, '#a8969e');
    y -= h * 0.2;
    part(h * 0.26, y, h * 0.2, '#b7a6ad');
    // 火袋的窗：暖色燈光
    const wy = y + h * 0.04, ww = h * 0.13, wh = h * 0.12;
    g.fillStyle = '#ffcf7a';
    g.fillRect(x - ww / 2, wy, ww, wh);
    g.strokeRect(x - ww / 2, wy, ww, wh);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const light = g.createRadialGradient(x, wy + wh / 2, 0, x, wy + wh / 2, h * 0.45);
    light.addColorStop(0, 'rgba(255, 190, 120, 0.5)');
    light.addColorStop(1, 'rgba(255, 190, 120, 0)');
    g.fillStyle = light;
    g.fillRect(x - h * 0.5, wy - h * 0.4, h, h);
    g.restore();
    // 笠：兩端上翹
    const ry = y, rw = h * 0.27;
    g.beginPath();
    g.moveTo(x - rw, ry + h * 0.01);
    g.quadraticCurveTo(x - rw * 0.55, ry - h * 0.02, x - h * 0.04, ry - h * 0.12);
    g.lineTo(x + h * 0.04, ry - h * 0.12);
    g.quadraticCurveTo(x + rw * 0.55, ry - h * 0.02, x + rw, ry + h * 0.01);
    g.quadraticCurveTo(x + rw * 1.02, ry - h * 0.035, x + rw * 1.06, ry - h * 0.045);
    g.lineTo(x + rw, ry + h * 0.035);
    g.lineTo(x - rw, ry + h * 0.035);
    g.lineTo(x - rw * 1.06, ry - h * 0.045);
    g.quadraticCurveTo(x - rw * 1.02, ry - h * 0.035, x - rw, ry + h * 0.01);
    g.closePath();
    g.fillStyle = '#9b8790';
    g.fill();
    g.lineWidth = lw;
    g.stroke();
    g.beginPath();
    g.arc(x, ry - h * 0.15, h * 0.04, 0, Math.PI * 2);
    g.fillStyle = '#a8969e';
    g.fill();
    g.stroke();
  }

  /* ---------------- 前景的櫻花枝 ---------------- */
  // 畫在一張離屏 canvas 上，錨點是枝條的根部；每格只做旋轉 + drawImage
  function makeBranch(seed, len, angle) {
    const r = rng(seed);
    const cw = len * 1.5, ch = len * 1.3, pad = len * 0.12;
    const c = document.createElement('canvas');
    c.width = Math.ceil(cw * DPR);
    c.height = Math.ceil(ch * DPR);
    const g = c.getContext('2d');
    g.scale(DPR, DPR);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const segs = [];
    const clusters = [];
    function grow(x, y, ang, length, width, depth) {
      const steps = 5;
      let px = x, py = y;
      for (let i = 1; i <= steps; i++) {
        ang += between(r, -0.18, 0.18);
        const nx = px + Math.cos(ang) * length / steps;
        const ny = py + Math.sin(ang) * length / steps;
        const w = width * (1 - (i / steps) * 0.6);
        segs.push([px, py, nx, ny, w]);
        if (depth < 2 && i >= 2 && r() < 0.55) {
          grow(nx, ny, ang + (r() < 0.5 ? -1 : 1) * between(r, 0.5, 0.9), length * between(r, 0.3, 0.45), w * 0.6, depth + 1);
        }
        if (i >= 2 && r() < 0.6) clusters.push([nx, ny, length * between(r, 0.05, 0.08)]);
        px = nx; py = ny;
      }
      clusters.push([px, py, length * 0.09]);
    }
    grow(pad, pad, angle, len, len * 0.045, 0);

    for (const pass of [0, 1]) {
      for (const [x1, y1, x2, y2, w] of segs) {
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.lineWidth = pass ? w : w + len * 0.012;
        g.strokeStyle = pass ? '#4e2c2f' : INK;
        g.stroke();
      }
    }
    // 花團：先一層柔軟的粉色底，再一朵朵五瓣花
    for (const [x, y, s] of clusters) {
      g.fillStyle = 'rgba(247, 172, 193, 0.85)';
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(x + between(r, -s, s) * 0.8, y + between(r, -s, s) * 0.6, s * between(r, 0.5, 0.8), 0, Math.PI * 2);
        g.fill();
      }
    }
    for (const [x, y, s] of clusters) {
      const n = 3 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        flower(g, x + between(r, -s, s), y + between(r, -s, s) * 0.8, s * between(r, 0.38, 0.6), r() * Math.PI, r() < 0.3);
      }
    }
    return { canvas: c, w: cw, h: ch, ax: pad, ay: pad };
  }

  function flower(g, x, y, s, rot, pale) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      g.save();
      g.rotate((k / 5) * Math.PI * 2);
      // 花瓣尖端有小缺口
      g.moveTo(0, 0);
      g.bezierCurveTo(-s * 0.55, -s * 0.35, -s * 0.5, -s * 0.95, -s * 0.18, -s);
      g.lineTo(0, -s * 0.85);
      g.lineTo(s * 0.18, -s);
      g.bezierCurveTo(s * 0.5, -s * 0.95, s * 0.55, -s * 0.35, 0, 0);
      g.restore();
    }
    g.fillStyle = pale ? '#ffe6ee' : '#ffc4d4';
    g.fill();
    g.lineWidth = Math.max(0.8, s * 0.1);
    g.strokeStyle = '#c4405c';
    g.stroke();
    g.fillStyle = '#e0466c';
    g.beginPath(); g.arc(0, 0, s * 0.22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe07a';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.6;
      g.beginPath(); g.arc(Math.cos(a) * s * 0.32, Math.sin(a) * s * 0.32, s * 0.06, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  function drawFront(ctx, t, wind, calm) {
    ctx.clearRect(0, 0, W, H);
    const k = calm ? 0.3 : 1;
    for (const b of branches) {
      const sway = (Math.sin(t * 0.7 + b.phase) * 0.012 + Math.sin(t * 1.9 + b.phase) * 0.004 + (wind - 0.9) * 0.012) * k;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(b.flip, 1);
      ctx.rotate(sway);
      ctx.drawImage(b.canvas, -b.ax, -b.ay, b.w, b.h);
      ctx.restore();
    }
  }

  return { resize, drawFront, flower };
})();
