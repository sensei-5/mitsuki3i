/* ==========================================================
   大家的祝福：結尾卡片按「看大家的祝福」打開
   每個人的名字和想說的話是一塊繪馬，掛成一面繪馬牆；點繪馬可以放大看
   「保存成圖片」：自己用 canvas 把背景、標題和每塊繪馬重畫一次，存成 PNG 當合影
   （不用 html2canvas：它畫不出繪馬的五角形 clip-path）
   ========================================================== */
const Board = (() => {
  const layer = $('board');
  const wall = $('boardWall');
  const countEl = $('boardCount');
  const zoom = $('emaZoom');
  let list = [];       // 打開時的問卷（照播放的順序）
  let zoomIndex = -1;
  const looks = new WeakMap(); // 每封問卷固定一組傾斜、大小、漂浮節奏（重新排版時不會亂跳）

  // 繪馬上只放開頭一小段，太長的接「…」；全文點開繪馬看
  const MAX_WORDS = 48;
  const MAX_NAME = 14;
  function clip(s, max) {
    const chars = [...(s || '').replace(/\s*\n\s*/g, ' ').trim()];
    return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
  }

  function lookOf(L) {
    if (!looks.has(L)) {
      const len = [...clip(L.words, MAX_WORDS)].length;
      looks.set(L, {
        tilt: Math.random() * 7 - 3.5,
        // 短的字大、長的小一點，大小錯落比較像真的繪馬牆
        size: (len <= 8 ? 1.3 : len <= 24 ? 1.1 : len <= 60 ? 0.96 : 0.88) * (0.9 + Math.random() * 0.2),
        lift: Math.random() * 1.2 - 0.6,
        delay: -Math.random() * 6,
        dur: 4.5 + Math.random() * 3,
      });
    }
    return looks.get(L);
  }

  function ema(L, i) {
    const look = lookOf(L);
    const b = el('button', 'ema');
    b.type = 'button';
    b.dataset.i = i;
    b.style.setProperty('--tilt', `${look.tilt.toFixed(2)}deg`);
    b.style.setProperty('--size', look.size.toFixed(2));
    b.style.setProperty('--lift', `${look.lift.toFixed(2)}em`);
    b.style.setProperty('--delay', `${look.delay.toFixed(2)}s`);
    b.style.setProperty('--dur', `${look.dur.toFixed(2)}s`);
    b.setAttribute('aria-label', `${L.name || TEXT.anon}：${L.words || ''}`);
    b.addEventListener('click', () => openZoom(i));

    const board = el('span', 'ema-board');
    const inner = el('span', 'ema-inner');
    inner.append(el('span', 'ema-hole'));
    const name = el('span', 'ema-name', clip(L.name, MAX_NAME) || TEXT.anon);
    if (!L.name) name.classList.add('is-anon');
    inner.append(name);
    if (L.words) inner.append(el('span', 'ema-text', clip(L.words, MAX_WORDS)));
    board.append(inner);
    b.append(el('span', 'ema-cord'), board);
    return b;
  }

  // 繪馬多的時候整體縮小字級，盡量一個畫面放得下（太多就捲動）
  function fit() {
    let size = Math.max(14, Math.min(24, innerWidth / 64));
    wall.style.setProperty('--fs', `${size}px`);
    while (wall.scrollHeight > wall.clientHeight + 1 && size > 10) {
      size -= 1;
      wall.style.setProperty('--fs', `${size}px`);
    }
  }

  /* ============ 打開 / 關閉 ============ */
  function open() {
    list = [...state.letters];
    wall.replaceChildren(...list.map(ema));
    countEl.textContent = `共 ${list.length} ${TEXT.fans}`;
    layer.hidden = false;
    els.stage.inert = true;
    els.stage.classList.add('is-board');
    fit();
    if (!reduceMotion.matches) {
      layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: 'ease-out' });
      [...wall.children].forEach((e, k) => e.animate(
        [{ opacity: 0, translate: '0 -1.5em' }, { opacity: 1, translate: '0 0' }],
        { duration: 600, delay: 200 + Math.min(k * 40, 1400), easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'backwards' },
      ));
    }
    $('boardSave').focus({ preventScroll: true });
  }
  function close() {
    closeZoom();
    layer.hidden = true;
    els.stage.inert = false;
    els.stage.classList.remove('is-board');
    els.cardSlot.querySelector('.end-back')?.focus({ preventScroll: true });
  }
  $('boardBack').addEventListener('click', close);
  window.addEventListener('resize', () => { if (!layer.hidden) fit(); });

  /* ============ 點開單塊繪馬 ============ */
  function showZoom(i) {
    const L = list[i];
    zoomIndex = i;
    const name = $('zoomName');
    name.textContent = L.name || TEXT.anon;
    name.classList.toggle('is-anon', !L.name);
    const text = $('zoomText');
    text.textContent = L.words || '';
    // 長篇的祝福字小一點，少捲幾次
    const len = [...(L.words || '')].length;
    text.dataset.len = len > 260 ? 'xl' : len > 110 ? 'l' : '';
    $('zoomCard').scrollTop = 0;
    $('zoomPos').textContent = `${i + 1} / ${list.length}`;
    $('zoomPrev').disabled = i <= 0;
    $('zoomNext').disabled = i >= list.length - 1;
  }
  function openZoom(i) {
    showZoom(i);
    zoom.hidden = false;
    if (!reduceMotion.matches) {
      $('zoomCard').animate([{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }
    $('zoomClose').focus({ preventScroll: true });
  }
  function closeZoom() {
    if (zoom.hidden) return;
    zoom.hidden = true;
    wall.querySelector(`[data-i="${zoomIndex}"]`)?.focus({ preventScroll: true });
    zoomIndex = -1;
  }
  function stepZoom(d) {
    const i = zoomIndex + d;
    if (i >= 0 && i < list.length) showZoom(i);
  }
  $('zoomClose').addEventListener('click', closeZoom);
  $('zoomPrev').addEventListener('click', () => stepZoom(-1));
  $('zoomNext').addEventListener('click', () => stepZoom(1));
  zoom.addEventListener('click', (e) => { if (e.target === zoom) closeZoom(); }); // 點外面關閉
  document.addEventListener('keydown', (e) => {
    if (layer.hidden) return;
    if (zoom.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); closeZoom(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); stepZoom(-1); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); stepZoom(1); }
  });

  /* ============ 存成圖片 ============ */
  // 照 DOM 上每個字的位置一個字一個字畫，換行和網頁上完全一樣
  function drawText(g, node, dy) {
    const cs = getComputedStyle(node);
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    g.fillStyle = cs.color;
    g.textBaseline = 'alphabetic';
    const ascent = g.measureText('字').fontBoundingBoxAscent;
    const range = document.createRange();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const s = t.data;
      for (let i = 0; i < s.length;) {
        const len = s.codePointAt(i) > 0xffff ? 2 : 1;
        const ch = s.slice(i, i + len);
        if (ch.trim()) {
          range.setStart(t, i);
          range.setEnd(t, i + len);
          const r = range.getClientRects()[0];
          if (r) g.fillText(ch, r.left, r.top + dy + (ascent || r.height * 0.8));
        }
        i += len;
      }
    }
  }

  function emaPath(g, x, y, w, h, s) {
    g.beginPath();
    g.moveTo(x + w / 2, y);
    g.lineTo(x + w, y + s);
    g.lineTo(x + w, y + h);
    g.lineTo(x, y + h);
    g.lineTo(x, y + s);
    g.closePath();
  }

  function drawEma(g, node, dy) {
    const L = list[Number(node.dataset.i)];
    const look = lookOf(L);
    const em = parseFloat(getComputedStyle(node).fontSize);
    const br = node.querySelector('.ema-board').getBoundingClientRect();
    const x = br.left, y = br.top + dy, w = br.width, h = br.height;
    const S = em * 1.3, B = em * 0.14; // 和 CSS 的 --slant、--rim 一樣
    const nr = node.getBoundingClientRect();
    g.save();
    g.translate(nr.left + nr.width / 2, nr.top + dy + nr.height / 2);
    g.rotate((look.tilt * Math.PI) / 180);
    g.translate(-(nr.left + nr.width / 2), -(nr.top + dy + nr.height / 2));

    // 外框（深色）+ 影子
    g.shadowColor = 'rgba(30, 2, 10, 0.45)';
    g.shadowBlur = em * 0.9;
    g.shadowOffsetY = em * 0.35;
    emaPath(g, x, y, w, h, S);
    g.fillStyle = '#3b1a10';
    g.fill();
    g.shadowColor = 'transparent';
    // 木板
    emaPath(g, x + B, y + B, w - B * 2, h - B * 2, S - B);
    const wood = g.createLinearGradient(0, y, 0, y + h);
    wood.addColorStop(0, '#f3d9a8');
    wood.addColorStop(1, '#ddb179');
    g.fillStyle = wood;
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(140, 84, 36, 0.14)';
    g.lineWidth = Math.max(1, em * 0.08);
    for (let k = 1; k < 7; k++) {
      const gy = y + (h * k) / 7;
      g.beginPath();
      g.moveTo(x, gy);
      g.bezierCurveTo(x + w * 0.3, gy - em * 0.25, x + w * 0.6, gy + em * 0.25, x + w, gy);
      g.stroke();
    }
    g.restore();

    // 繩孔與紅繩
    const hole = node.querySelector('.ema-hole').getBoundingClientRect();
    g.fillStyle = '#3b1a10';
    g.beginPath();
    g.arc(hole.left + hole.width / 2, hole.top + dy + hole.height / 2, hole.width / 2, 0, Math.PI * 2);
    g.fill();
    const cord = node.querySelector('.ema-cord').getBoundingClientRect();
    const lw = em * 0.16, rad = (cord.width - lw) / 2;
    const cx = cord.left + cord.width / 2, top = cord.top + dy + lw / 2;
    g.strokeStyle = '#c8243f';
    g.lineWidth = lw;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - rad, cord.bottom + dy);
    g.lineTo(cx - rad, top + rad);
    g.arc(cx, top + rad, rad, Math.PI, 0);
    g.lineTo(cx + rad, cord.bottom + dy);
    g.stroke();

    drawText(g, node.querySelector('.ema-name'), dy);
    const text = node.querySelector('.ema-text');
    if (text) drawText(g, text, dy);
    g.restore();
  }

  async function save(btn) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '保存中…';
    layer.classList.add('is-capturing'); // 拍照時停掉漂浮動畫，量到的位置才準
    try {
      await document.fonts.ready;
      const W = innerWidth, H = innerHeight;
      // 繪馬太多、牆在捲動時，圖片往下加長，把全部繪馬都放進去
      const extra = Math.max(0, wall.scrollHeight - wall.clientHeight);
      const scroll = wall.scrollTop;
      wall.scrollTop = 0;
      const TH = H + extra;
      const scale = 2;
      const c = document.createElement('canvas');
      c.width = Math.round(W * scale);
      c.height = Math.round(TH * scale);
      const g = c.getContext('2d');
      g.scale(scale, scale);

      // 背景：景物、花瓣、櫻花枝（等比放大蓋滿），再蓋一層和畫面一樣的暗色
      const k = TH / H;
      for (const cv of [els.bg, els.canvas, els.front]) g.drawImage(cv, (W - W * k) / 2, 0, W * k, TH);
      g.fillStyle = getComputedStyle(layer).backgroundColor;
      g.fillRect(0, 0, W, TH);

      // 標題：白字 + 深紅描邊 + 粉色光暈
      const title = $('boardTitle');
      g.save();
      g.shadowColor = 'rgba(255, 150, 180, 0.8)';
      g.shadowBlur = 24;
      drawText(g, title, 0);
      g.restore();
      drawText(g, countEl, 0);

      for (const node of wall.children) drawEma(g, node, 0);

      // 右下角小小的署名
      g.font = `${Math.max(12, W / 110)}px ${getComputedStyle(document.body).fontFamily}`;
      g.fillStyle = 'rgba(255, 228, 236, 0.7)';
      g.textAlign = 'right';
      g.fillText(`離緋緋 生日快樂 · ${new Date().toISOString().slice(0, 10)}`, W - 16, TH - 14);

      wall.scrollTop = scroll;
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `離緋緋生日祝福-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      btn.textContent = '已保存 ✓';
    } catch (err) {
      console.error(err);
      btn.textContent = '保存失敗，再試一次';
    } finally {
      layer.classList.remove('is-capturing');
      btn.disabled = false;
      setTimeout(() => { btn.textContent = label; }, 2500);
    }
  }
  $('boardSave').addEventListener('click', (e) => save(e.currentTarget));

  return { open, isOpen: () => !layer.hidden };
})();
