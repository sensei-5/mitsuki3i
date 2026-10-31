/* ==========================================================
   CONFIG
   ========================================================== */
const CONFIG = {
  navLockMs: 520,          // 翻卡防連點
  petalDensity: 1 / 17000, // 櫻花瓣：每 px² 幾片（1920×1080 約 120 片）
};

const TEXT = {
  end: ['離緋緋，', '生日快樂！'],
  fans: '位參拜者',
  anon: '匿名的參拜者',
  labels: ['你叫甚麼名字！！！！！', '對我最深的印象', '有甚麼想說的嗎'],
};

/* ==========================================================
   State
   ========================================================== */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const state = {
  phase: 'empty',   // empty：還沒導入 / ready：有問卷、箱子關著 / open：正在看卡片
  letters: [],      // 隨機排序後的問卷
  labels: [...TEXT.labels],
  index: 0,         // letters.length 代表結尾卡片
  card: null,       // 目前顯示的卡片元素
  busy: false,
};

const $ = (id) => document.getElementById(id);
const els = {
  stage: $('stage'),
  hint: $('hint'),
  torii: $('torii'),
  box: $('offering'),
  boxInner: $('obInner'),
  slot: $('obSlot'),
  door: $('door'),
  doorFrame: $('doorFrame'),
  importBtn: $('importBtn'),
  importLabel: $('importLabel'),
  fileInput: $('fileInput'),
  viewer: $('viewer'),
  cardSlot: $('cardSlot'),
  prev: $('prevBtn'),
  next: $('nextBtn'),
  counter: $('counter'),
  dropHint: $('dropHint'),
  canvas: $('particles'),
  bg: $('bg'),
  front: $('front'),
};

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function rand(a, b) { return a + Math.random() * (b - a); }
function unit() { return Math.min(innerWidth / 100, innerHeight / 56.25); } // = CSS 的 --u（px）

/* ==========================================================
   CSV：讀檔、解析、隨機排序
   ========================================================== */
async function readCsvFile(file) {
  const buf = await file.arrayBuffer();
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (e) {
    text = new TextDecoder('big5').decode(buf); // Excel 另存的中文 CSV 常是 Big5
  }
  return text.replace(/^﻿/, '');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

// 題目文字：拿掉較長的括號補充說明，和「(公開)」這種給填表的人看的標註
function cleanLabel(s) {
  return s.replace(/[（(][^）)]{5,}[）)]/g, '').replace(/[（(]\s*公開\s*[）)]/g, '').trim();
}

// 秀三題：名字、最深的印象、想說的話（公開）。標了「不公開 / 私下」的欄位絕對不拿
const isPrivate = (h) => /不公開|非公開|私下|私密|悄悄話/.test(h);
const isTime = (h) => /時間|timestamp/i.test(h);
function pickColumns(header) {
  const ok = (i, taken) => !taken.includes(i) && !isPrivate(header[i]) && !isTime(header[i]);
  const find = (re, taken) => header.findIndex((h, i) => ok(i, taken) && re.test(h));
  const taken = [];
  const name = find(/名字|稱呼|暱稱|名稱/, taken); if (name >= 0) taken.push(name);
  // 印象題的說明裡有「說過的」，要比想說的話先找，才不會被當成想說的話
  const impression = find(/印象/, taken); if (impression >= 0) taken.push(impression);
  let words = find(/公開/, taken);
  if (words < 0) words = find(/說|祝福|留言|話/, taken);
  if (words >= 0) taken.push(words);
  // 名字、想說的話找不到就依序取剩下的欄位；印象題找不到就不顯示
  const rest = header.map((h, i) => i).filter((i) => ok(i, taken));
  const [n, w] = [name, words].map((c) => (c >= 0 ? c : rest.shift() ?? -1));
  return [n, impression, w];
}

function extractLetters(rows) {
  if (rows.length < 2) throw new Error('這個檔案裡沒有問卷回覆');
  const header = rows[0].map((h) => h.trim());
  const cols = pickColumns(header);
  if (cols[2] < 0) throw new Error('看不懂這個檔案的欄位，請確認是問卷匯出的 CSV');
  const labels = cols.map((c, i) => (c >= 0 ? cleanLabel(header[c]) || TEXT.labels[i] : TEXT.labels[i]));
  // 每一份回覆都保留，只略過三題都空白的
  const letters = rows.slice(1)
    .map((r) => {
      const [name, impression, words] = cols.map((c) => (c >= 0 ? (r[c] ?? '').trim() : ''));
      return { name, impression, words };
    })
    .filter((l) => l.name || l.impression || l.words);
  state.hasImpression = cols[1] >= 0;
  if (!letters.length) throw new Error('這個檔案裡沒有問卷回覆');
  return { labels, letters };
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

async function importFile(file) {
  if (!file || state.phase === 'open' || state.busy) return;
  try {
    const { labels, letters } = extractLetters(parseCsv(await readCsvFile(file)));
    state.labels = labels;
    state.letters = shuffle(letters);
    state.index = 0;
    setHint(`${letters.length} 份祝福都投進香油錢箱了`);
    els.importLabel.textContent = '重新導入';
    await dropCoins(Math.min(8, letters.length));
    state.phase = 'ready';
    els.box.dataset.state = 'ready';
  } catch (err) {
    setHint(err.message || '讀不了這個檔案', true);
  }
}

function setHint(text, isError = false) {
  els.hint.textContent = text;
  els.hint.classList.toggle('is-error', isError);
}

/* ==========================================================
   香油錢箱：投錢動畫、打開、關上
   ========================================================== */
els.importBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  els.fileInput.click();
});
els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files[0];
  els.fileInput.value = ''; // 同一個檔案再選一次也要觸發
  importFile(file);
});

// 拖曳 CSV 到畫面上任何地方也能導入
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragenter', (e) => {
  if (!hasFiles(e) || state.phase === 'open') return;
  dragDepth++;
  els.dropHint.hidden = false;
});
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) els.dropHint.hidden = true;
});
document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  els.dropHint.hidden = true;
  importFile(e.dataTransfer.files[0]);
});

// 香油錢一枚枚拋進格柵：邊飛邊翻面，落進去時箱子輕輕一震
async function dropCoins(n) {
  if (reduceMotion.matches) return;
  const slot = els.slot.getBoundingClientRect();
  const anims = [];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'coin';
    document.body.appendChild(el);
    const w = el.offsetWidth;
    const x = slot.left + slot.width * rand(0.15, 0.85) - w / 2;
    const y = slot.top + slot.height * 0.5 - w / 2;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    const u = unit();
    const fromX = rand(-1, 1) * u * 14;
    const flips = Math.round(rand(2, 4));
    const frames = [];
    for (let k = 0; k <= 10; k++) {
      const p = k / 10;
      // 拋物線：先往上、再落下
      const tx = fromX * (1 - p);
      const ty = -u * 26 * (1 - p) - Math.sin(p * Math.PI) * u * 8;
      frames.push({ transform: `translate(${tx}px, ${ty}px) scaleY(${Math.cos(p * Math.PI * flips).toFixed(2)})`, opacity: p < 0.1 ? p * 10 : 1, offset: p * 0.85 });
    }
    frames.push({ transform: 'translate(0, 6px) scale(0.5, 0.15)', opacity: 0, offset: 1 });
    const delay = i * 160;
    const a = el.animate(frames, { duration: 900, delay, easing: 'cubic-bezier(0.4, 0, 0.7, 1)', fill: 'backwards' });
    setTimeout(() => {
      Music.sfx.coin();
      els.boxInner.animate([{ transform: 'none' }, { transform: 'translateY(0.25em)' }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
    }, delay + 780);
    anims.push(a.finished.then(() => el.remove()));
  }
  await Promise.all(anims);
}

els.box.addEventListener('click', (e) => {
  if (e.target.closest('.ob-import')) return;
  if (state.phase === 'ready') openBox();
  else if (state.phase === 'empty') {
    setHint('先按「導入問卷」，把問卷 CSV 投進賽錢箱');
    els.importBtn.animate([{ transform: 'translate(-50%, -50%) scale(1)' }, { transform: 'translate(-50%, -50%) scale(1.12)' }, { transform: 'translate(-50%, -50%) scale(1)' }], { duration: 420, easing: 'ease-out' });
  }
});

async function openBox() {
  if (state.busy) return;
  state.busy = true;
  state.phase = 'open';
  state.index = 0;
  const motion = !reduceMotion.matches;
  if (motion) {
    // 先搖一搖箱子，門再打開
    await els.boxInner.animate([
      { transform: 'none' }, { transform: 'rotate(-2deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(-1.5deg)' }, { transform: 'rotate(1deg)' }, { transform: 'none' },
    ], { duration: 520, easing: 'ease-in-out' }).finished;
  }
  els.box.dataset.state = 'open';
  els.door.setAttribute('aria-label', '香油錢箱已打開');
  Music.sfx.open();
  if (motion) {
    await wait(450);
    puffSheets(8);
    await wait(500);
  }
  els.stage.classList.add('is-open');
  if (motion) await wait(650);
  els.viewer.hidden = false;
  await showCard(0, 'enter');
  state.busy = false;
  els.next.focus({ preventScroll: true });
}

async function closeBox() {
  if (state.busy) return;
  state.busy = true;
  const card = state.card;
  state.card = null;
  if (card) await animateOut(card, 'return').catch(() => {});
  els.cardSlot.replaceChildren();
  els.viewer.hidden = true;
  els.stage.classList.remove('is-open');
  if (!reduceMotion.matches) await wait(900);
  state.phase = 'ready';
  els.box.dataset.state = 'ready';
  els.door.setAttribute('aria-label', '打開香油錢箱');
  state.busy = false;
  els.door.focus({ preventScroll: true });
}

// 打開時從箱子飄出來的籤紙
function puffSheets(n) {
  const d = els.doorFrame.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'mini-sheet';
    document.body.appendChild(el);
    el.style.left = `${d.left + d.width / 2 - el.offsetWidth / 2}px`;
    el.style.top = `${d.top + d.height / 2 - el.offsetHeight / 2}px`;
    const u = unit();
    const dx = rand(-1, 1) * u * 30;
    const dy = -rand(14, 34) * u;
    el.animate([
      { transform: 'translate(0, 0) scale(0.3) rotate(0deg)', opacity: 0 },
      { opacity: 1, offset: 0.15 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.7}px) scale(1) rotate(${rand(-40, 40)}deg)`, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.9) rotate(${rand(-120, 120)}deg)`, opacity: 0 },
    ], { duration: rand(1500, 2200), delay: i * 70, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)', fill: 'backwards' })
      .finished.then(() => el.remove());
  }
}

/* ==========================================================
   卡片
   ========================================================== */
const PETAL_D = 'M30 30 C 21 24, 20 12, 26 6 L 30 9.5 L 34 6 C 40 12, 39 24, 30 30 Z';
const DECO_SVG = '<svg class="card-deco" viewBox="0 0 60 60" aria-hidden="true">'
  + [0, 72, 144, 216, 288].map((a) => `<path class="petal" transform="rotate(${a} 30 30)" d="${PETAL_D}"/>`).join('')
  + '<circle class="eye" cx="30" cy="30" r="4.5"/>'
  + [0, 72, 144, 216, 288].map((a) => `<circle class="stamen" transform="rotate(${a + 36} 30 30)" cx="30" cy="22.5" r="1.4"/>`).join('')
  + '</svg>';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function question(label, answer, cls, answerCls) {
  const q = el('div', `q ${cls || ''}`);
  q.append(el('p', 'q-label', label));
  const a = el('p', answerCls, answer || '（沒有填）');
  if (!answer) a.classList.add('is-empty');
  q.append(a);
  return q;
}

function buildCard(i) {
  const card = el('article', 'card');
  card.insertAdjacentHTML('afterbegin', DECO_SVG);
  const body = el('div', 'card-body');
  if (i >= state.letters.length) {
    card.classList.add('card-end');
    const count = el('p', 'end-count');
    count.append('以上是 ', el('b', '', String(state.letters.length)), ` ${TEXT.fans}的祝福`);
    const title = el('h2', 'end-title');
    title.append(...TEXT.end.map((line) => el('span', 'hl', line)));
    const actions = el('div', 'end-actions');
    const all = el('button', 'end-back', '看大家的祝福');
    all.type = 'button';
    all.addEventListener('click', () => Board.open());
    const back = el('button', 'end-back ghost', '回到賽錢箱');
    back.type = 'button';
    back.addEventListener('click', closeBox);
    actions.append(all, back);
    body.append(count, title, actions);
  } else {
    const L = state.letters[i];
    const [l1, l2, l3] = state.labels;
    const name = question(l1, L.name || TEXT.anon, 'q-name', 'q-name-text');
    if (!L.name) name.querySelector('.q-name-text').classList.add('is-anon');
    body.append(name);
    if (state.hasImpression) body.append(question(l2, L.impression, '', 'q-answer'));
    body.append(question(l3, L.words, 'q-main', 'q-answer'));

    const remove = el('button', 'card-remove', '移除這張');
    remove.type = 'button';
    remove.setAttribute('aria-label', '從這次播放中移除這張問卷');
    remove.addEventListener('click', () => onRemove(remove));
    card.append(remove, el('span', 'card-seal', '祝'));
  }
  card.append(body);
  return card;
}

// 字太多時整張卡的字一起縮小，縮到 0.6 倍還放不下才捲動
function fitCard(card) {
  const body = card.querySelector('.card-body');
  let fit = 1;
  body.style.setProperty('--fit', '1');
  while (body.scrollHeight > body.clientHeight + 1 && fit > 0.6) {
    fit = Math.round((fit - 0.05) * 100) / 100;
    body.style.setProperty('--fit', String(fit));
  }
}

function doorCenter() {
  const d = els.doorFrame.getBoundingClientRect();
  return { x: d.left + d.width / 2, y: d.top + d.height / 2, w: d.width };
}

// 卡片從箱子飄出來 / 回到箱子（用同一組座標）
// 用卡片槽的位置計算（卡片本身可能正在動畫中）
function boxKeyframes() {
  const r = els.cardSlot.getBoundingClientRect();
  const d = doorCenter();
  const dx = d.x - (r.left + r.width / 2);
  const dy = d.y - (r.top + r.height / 2);
  const s = Math.max(0.06, d.w / r.width);
  return [
    { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(-14deg)`, opacity: 0 },
    { opacity: 1, offset: 0.2 },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.1 - unit() * 3}px) scale(0.72) rotate(5deg)`, offset: 0.6 },
    { transform: 'none', opacity: 1 },
  ];
}
// 卡片隨風飄走 / 從風裡飄回來
function windKeyframes() {
  return [
    { transform: 'none', opacity: 1 },
    { transform: `translate(${innerWidth * 0.55}px, ${-innerHeight * 0.32}px) rotate(18deg) scale(0.7)`, opacity: 0 },
  ];
}
const fade = [{ opacity: 0 }, { opacity: 1 }];
// 倒著播：順序反過來，offset 也要跟著換成 1 - offset（不然瀏覽器會報錯）
function reversed(frames) {
  return [...frames].reverse().map((f) => (f.offset == null ? f : { ...f, offset: 1 - f.offset }));
}

function animateIn(card, from) {
  if (reduceMotion.matches) return card.animate(fade, { duration: 220 }).finished;
  if (from === 'wind') return card.animate(reversed(windKeyframes()), { duration: 760, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' }).finished;
  return card.animate(boxKeyframes(), { duration: 980, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' }).finished;
}
function animateOut(card, to) {
  card.style.pointerEvents = 'none';
  if (reduceMotion.matches) return card.animate(reversed(fade), { duration: 180, fill: 'forwards' }).finished;
  if (to === 'wind') return card.animate(windKeyframes(), { duration: 620, easing: 'cubic-bezier(0.55, 0, 0.8, 0.4)', fill: 'forwards' }).finished;
  if (to === 'drop') return card.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(30px) scale(0.92)', opacity: 0 }], { duration: 360, easing: 'ease-in', fill: 'forwards' }).finished;
  return card.animate(reversed(boxKeyframes()), { duration: 620, easing: 'cubic-bezier(0.6, 0, 0.8, 0.5)', fill: 'forwards' }).finished;
}

// dir：enter（從箱子飄出）/ next（舊的隨風飄走、新的從箱子飄出）/ prev（舊的回到箱子、上一張從風裡飄回來）/ remove
// 「目前這張」記在 state.card：快速翻頁時，上一張可能還在飄走的動畫中，不能拿卡片槽裡的第一張來當目前這張
async function showCard(i, dir) {
  state.index = i;
  const old = state.card;
  const card = buildCard(i);
  state.card = card;
  els.cardSlot.append(card);
  fitCard(card);
  updateNav();
  const outTo = { next: 'wind', prev: 'return', remove: 'drop' }[dir];
  const jobs = [animateIn(card, dir === 'prev' ? 'wind' : 'box')];
  // 動畫不管成功或被打斷，舊卡片最後一定移除
  if (old) jobs.push(animateOut(old, outTo).catch(() => {}).finally(() => old.remove()));
  if (i >= state.letters.length) { celebrate(); Music.sfx.finale(); }
  await Promise.race([Promise.all(jobs).catch(() => {}), wait(CONFIG.navLockMs)]);
}

function updateNav() {
  const n = state.letters.length;
  const atEnd = state.index >= n;
  els.prev.disabled = state.index <= 0;
  els.next.disabled = atEnd;
  els.counter.textContent = atEnd ? `共 ${n} 張` : `${state.index + 1} / ${n}`;
}

async function go(delta) {
  if (state.phase !== 'open' || state.busy) return;
  const i = state.index + delta;
  if (i < 0 || i > state.letters.length) return;
  state.busy = true;
  try {
    await showCard(i, delta > 0 ? 'next' : 'prev');
  } finally {
    state.busy = false; // 就算動畫出錯也要解鎖，翻頁才不會卡住
  }
}
els.next.addEventListener('click', () => go(1));
els.prev.addEventListener('click', () => go(-1));

// 移除：按一次變成「確定移除？」，3 秒內再按一次才真的移除
function onRemove(btn) {
  if (state.busy) return;
  if (!btn.classList.contains('is-confirm')) {
    btn.classList.add('is-confirm');
    btn.textContent = '確定移除？';
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.classList.remove('is-confirm'); btn.textContent = '移除這張'; }, 3000);
    return;
  }
  clearTimeout(btn._t);
  state.busy = true;
  state.letters.splice(state.index, 1);
  showCard(Math.min(state.index, state.letters.length), 'remove').finally(() => { state.busy = false; });
}

document.addEventListener('keydown', (e) => {
  if (state.phase !== 'open' || Board.isOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  const onButton = e.target.closest && e.target.closest('button');
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !onButton)) { e.preventDefault(); go(1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
});

/* ==========================================================
   櫻花瓣：一般的畫在鳥居後面，離鏡頭近的（會模糊）畫在鳥居前面
   ========================================================== */
const ctx = els.canvas.getContext('2d');
const frontCtx = els.front.getContext('2d');
let W = 0, H = 0, DPR = 1;
let petals = [], burst = [];

function makePetalSprite(base, tip) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32);
  // 櫻花瓣形狀：下窄上寬，頂端有一個小缺口
  g.beginPath();
  g.moveTo(0, 26);
  g.bezierCurveTo(-22, 10, -20, -18, -7, -24);
  g.lineTo(0, -17);
  g.lineTo(7, -24);
  g.bezierCurveTo(20, -18, 22, 10, 0, 26);
  const grd = g.createLinearGradient(0, 26, 0, -24);
  grd.addColorStop(0, base);
  grd.addColorStop(1, tip);
  g.fillStyle = grd;
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(0, 22); g.lineTo(0, -10); g.stroke();
  return c;
}
function makeBlossomSprite(pale) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  Scenery.flower(c.getContext('2d'), 32, 32, 28, 0, pale);
  return c;
}
function makeMoteSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,245,240,1)');
  grd.addColorStop(0.18, 'rgba(255,220,230,0.85)');
  grd.addColorStop(0.5, 'rgba(255,190,210,0.25)');
  grd.addColorStop(1, 'rgba(255,190,210,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
}
// 離鏡頭近的花瓣用模糊版本（瀏覽器不支援 canvas filter 時就用原圖）
function blurred(src, px) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.filter = `blur(${px}px)`;
  g.drawImage(src, 8, 8, 48, 48);
  return c;
}
const SPRITES = {
  petal: [makePetalSprite('#ff9fbb', '#ffd6e1'), makePetalSprite('#ffb3c8', '#ffe8ee'), makePetalSprite('#f5e2e8', '#ffffff'), makePetalSprite('#f27c9c', '#ffc2d2')],
  blossom: [makeBlossomSprite(false), makeBlossomSprite(true)],
};
SPRITES.petalBlur = SPRITES.petal.map((c) => blurred(c, 3));
SPRITES.blossomBlur = SPRITES.blossom.map((c) => blurred(c, 3));
const moteSprite = makeMoteSprite();

// 花瓣 82%、整朵小花 8%、光點 10%。z 是遠近，越近越大、越快，最近的會模糊、畫在鳥居前面
function newPetal(anywhere) {
  const s = Math.max(0.6, unit() / 19.2);
  const roll = Math.random();
  const kind = roll < 0.82 ? 'petal' : roll < 0.9 ? 'blossom' : 'mote';
  const z = rand(0.5, 1.5);
  const near = z > 1.33;
  if (kind === 'mote') {
    return {
      kind, z, near: false,
      x: rand(0, W),
      y: anywhere ? rand(H * 0.1, H) : H + rand(10, 60),
      vx: rand(-6, 10) * s,
      vy: -rand(8, 20) * s * z,
      size: rand(14, 30) * s * z,
      phase: rand(0, Math.PI * 2),
      sway: rand(0.4, 1),
      tw: rand(1, 2.6),
      a: rand(0.4, 0.8),
    };
  }
  const list = SPRITES[near ? `${kind}Blur` : kind];
  // 從上方或左邊進來，往右下飄
  const fromTop = Math.random() < 0.65;
  return {
    kind, z, near,
    sprite: list[Math.floor(Math.random() * list.length)],
    x: anywhere ? rand(0, W) : fromTop ? rand(-W * 0.2, W) : rand(-W * 0.15, -40),
    y: anywhere ? rand(0, H) : fromTop ? rand(-80, -30) : rand(0, H * 0.7),
    vx: rand(18, 46) * s * z,
    vy: rand(22, 48) * s * z,
    size: (kind === 'petal' ? rand(18, 28) : rand(26, 36)) * s * z * (near ? 1.5 : 1),
    rot: rand(0, Math.PI * 2),
    spin: rand(-1.6, 1.6),
    flip: rand(0, Math.PI * 2),
    flipSpeed: rand(1.4, 3.4),
    phase: rand(0, Math.PI * 2),
    sway: rand(0.6, 1.4),
    a: near ? rand(0.55, 0.8) : rand(0.75, 1),
  };
}

function toriiLayout() {
  const t = els.torii; // offsetTop / offsetWidth 不受打開時的縮放影響
  return { groundY: t.offsetTop + t.offsetHeight, cx: t.offsetLeft + t.offsetWidth / 2, gateW: t.offsetWidth };
}

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  els.canvas.width = Math.round(W * DPR);
  els.canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  Scenery.resize(W, H, DPR, { bg: els.bg, front: els.front }, toriiLayout());
  els.cardSlot.querySelectorAll('.card').forEach(fitCard);
  const calm = reduceMotion.matches ? 0.35 : 1;
  const n = Math.round(Math.min(180, W * H * CONFIG.petalDensity) * calm);
  petals = Array.from({ length: n }, () => newPetal(true)).sort((a, b) => a.z - b.z);
}

// 結尾卡片：從卡片裡噴出一陣櫻花
function celebrate() {
  if (reduceMotion.matches) return;
  const r = els.cardSlot.getBoundingClientRect();
  const s = unit() / 19.2;
  for (let i = 0; i < 90; i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(100, 380) * s;
    const base = newPetal(true);
    if (base.kind === 'mote') continue;
    burst.push({
      ...base,
      x: r.left + r.width / 2 + rand(-r.width / 3, r.width / 3),
      y: r.top + r.height / 2 + rand(-r.height / 4, r.height / 4),
      bvx: Math.cos(a) * v, bvy: Math.sin(a) * v - 80 * s, life: 0, ttl: rand(2.6, 4.4),
    });
  }
}

function stepPetal(p, t, dt, wind) {
  if (p.kind === 'mote') {
    p.x += (p.vx + Math.sin(t * p.sway + p.phase) * 8) * dt;
    p.y += p.vy * dt;
    return;
  }
  p.x += (p.vx * wind + Math.sin(t * p.sway + p.phase) * 18 * p.z) * dt;
  p.y += (p.vy + Math.cos(t * p.sway * 1.3 + p.phase) * 10 * p.z) * dt;
  p.rot += p.spin * dt;
  p.flip += p.flipSpeed * dt;
}
function drawPetal(g, p, t, alpha) {
  if (p.kind === 'mote') {
    g.globalAlpha = alpha * p.a * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * p.tw + p.phase)));
    g.drawImage(moteSprite, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    return;
  }
  g.save();
  g.globalAlpha = alpha * p.a;
  g.translate(p.x, p.y);
  g.rotate(p.rot);
  // 用 scaleY 模擬花瓣在空中翻面
  g.scale(1, 0.25 + 0.75 * Math.abs(Math.cos(p.flip)));
  g.drawImage(p.sprite, -p.size / 2, -p.size / 2, p.size, p.size);
  g.restore();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  const calm = reduceMotion.matches;
  const speed = calm ? 0.35 : 1;
  const wind = (Math.sin(t * 0.23) * 0.5 + Math.sin(t * 0.61) * 0.3 + 0.9) * speed;

  ctx.clearRect(0, 0, W, H);
  Scenery.drawFront(frontCtx, t, wind, calm);

  for (const p of petals) {
    stepPetal(p, t, dt * speed, wind);
    if (p.x > W + 80 || p.y < -100 || p.y > H + 80) Object.assign(p, newPetal(false));
    drawPetal(p.near ? frontCtx : ctx, p, t, 1);
  }

  // 噴發的花瓣：先往外衝，慢慢減速後跟著風飄
  for (let i = burst.length - 1; i >= 0; i--) {
    const p = burst[i];
    p.life += dt;
    if (p.life >= p.ttl) { burst.splice(i, 1); continue; }
    const drag = Math.exp(-dt * 1.6);
    p.bvx *= drag; p.bvy *= drag;
    stepPetal(p, t, dt, wind);
    p.x += p.bvx * dt;
    p.y += p.bvy * dt;
    const k = Math.min(1, p.life / 0.2) * Math.min(1, (p.ttl - p.life) / 0.8);
    drawPetal(frontCtx, p, t, k);
  }
  ctx.globalAlpha = 1;
  frontCtx.globalAlpha = 1;
  requestAnimationFrame(frame);
}

/* ==========================================================
   背景音樂：開關與音量記在瀏覽器；瀏覽器規定要先點過畫面才能出聲，所以第一次點擊時才開始
   ========================================================== */
const musicBtn = $('musicBtn');
const musicVol = $('musicVol');
function loadPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch (e) { return fallback; }
}
function savePref(key, v) {
  try { localStorage.setItem(key, v); } catch (e) { /* 存不了就算了 */ }
}
function updateMusicBtn() {
  const on = Music.enabled;
  musicBtn.setAttribute('aria-pressed', String(on));
  musicBtn.classList.toggle('is-waiting', on && !Music.started);
  $('musicLabel').textContent = on && !Music.started ? '點畫面開始音樂' : '音樂';
  musicBtn.title = on ? '關掉背景音樂' : '打開背景音樂';
}
Music.setVolume(Number(loadPref('musicVol', '0.6')));
musicVol.value = loadPref('musicVol', '0.6');
if (loadPref('music', 'on') === 'off') Music.setEnabled(false);
updateMusicBtn();
musicBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  Music.setEnabled(!Music.enabled || !Music.started);
  savePref('music', Music.enabled ? 'on' : 'off');
  updateMusicBtn();
});
musicVol.addEventListener('input', () => {
  Music.setVolume(Number(musicVol.value));
  savePref('musicVol', musicVol.value);
});
function unlockAudio(e) {
  if (e.target.closest && e.target.closest('.controls')) return; // 音樂按鈕自己處理
  Music.unlock();
  updateMusicBtn();
  window.removeEventListener('pointerdown', unlockAudio, true);
  window.removeEventListener('keydown', unlockAudio, true);
}
window.addEventListener('pointerdown', unlockAudio, true);
window.addEventListener('keydown', unlockAudio, true);

/* ==========================================================
   Init
   ========================================================== */
resize();
let resizeTimer = 0;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });
requestAnimationFrame(frame);
