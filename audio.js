/* ==========================================================
   背景音樂與音效（全部用 Web Audio 即時合成，沒有版權問題，直播可以放心用）
   - 琴（箏）：Karplus-Strong 撥弦，櫻花調音階（A B C E F），每次隨機產生旋律
   - 低音的持續音、偶爾的風鈴
   - 音效：香油錢落下的叮、開箱的琴音、結尾的風鈴
   瀏覽器規定要使用者先點過畫面才能發出聲音，所以第一次點擊時才真正開始
   ========================================================== */
const Music = (() => {
  const BPM = 74;
  const EIGHTH = 60 / BPM / 2;
  const BAR = EIGHTH * 8;
  // 櫻花調（都節音階）：A B C E F
  const SCALE = [45, 47, 48, 52, 53, 57, 59, 60, 64, 65, 69, 71, 72, 76, 77, 81];
  const MEL_LO = 5, MEL_HI = 14; // 旋律用的音域（SCALE 的索引）
  // 和弦根音：A → F → E → A，每兩小節換一次（MIDI，低音區）
  const ROOTS = [45, 41, 40, 45];
  const RHYTHMS = [[2, 1, 1, 2, 2], [3, 1, 2, 2], [1, 1, 2, 4], [2, 2, 4], [4, 2, 2], [2, 1, 1, 4], [2, 2, 2, 2], [3, 1, 4]];

  let ctx = null, master, musicBus, sfxBus, verb;
  let enabled = true, volume = 0.6, started = false;
  let timer = 0, nextBar = 0, bar = 0, phrase = [], drone = null;
  const plucks = new Map();

  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    // 殘響：用衰減的雜訊做一個 3.5 秒的空間感
    verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 3.5);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.38;
    verb.connect(wet).connect(master);
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    for (const bus of [musicBus, sfxBus]) { bus.connect(master); bus.connect(verb); }
    sfxBus.gain.value = 0.8;
  }

  // 撥弦：先算好一段聲音存起來，同一個音重複使用
  function pluckBuffer(midi) {
    if (plucks.has(midi)) return plucks.get(midi);
    const sr = ctx.sampleRate, f = midiHz(midi);
    const n = Math.floor(sr * 3.2);
    const p = Math.max(2, Math.floor(sr / f));
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const ring = new Float32Array(p);
    let lp = 0;
    for (let i = 0; i < p; i++) { lp = lp * 0.45 + (Math.random() * 2 - 1) * 0.55; ring[i] = lp; }
    const loss = Math.pow(0.18, 1 / f); // 每個週期的衰減：每個音大約一秒掉到 18%
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const cur = ring[idx], nxt = ring[(idx + 1) % p];
      ring[idx] = loss * 0.5 * (cur + nxt);
      d[i] = cur * Math.min(1, (n - i) / (sr * 0.2)); // 尾巴淡出，避免爆音
      idx = (idx + 1) % p;
    }
    // 平均濾波讓實際音高變成 sr / (p + 0.5)，播放時用 playbackRate 修正回準確音高
    const entry = { buf, rate: (f * (p + 0.5)) / sr };
    plucks.set(midi, entry);
    return entry;
  }

  function pluck(midi, time, gain = 0.5, bus = musicBus, pan = (Math.random() - 0.5) * 0.6) {
    const { buf, rate } = pluckBuffer(midi);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3800;
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    src.connect(tone).connect(g).connect(pn).connect(bus);
    src.start(time);
  }

  function bell(freq, time, gain = 0.06, decay = 4, bus = musicBus) {
    for (const [ratio, amp] of [[1, 1], [2.76, 0.45], [5.4, 0.2]]) {
      const o = ctx.createOscillator();
      o.frequency.value = freq * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(gain * amp, time + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, time + decay / ratio);
      const pn = ctx.createStereoPanner();
      pn.pan.value = (Math.random() - 0.5) * 0.9;
      o.connect(g).connect(pn).connect(bus);
      o.start(time);
      o.stop(time + decay / ratio + 0.1);
    }
  }

  // 低音持續音：根音 + 五度，慢慢淡入淡出
  function setDrone(root, time) {
    if (drone) {
      const old = drone;
      old.g.gain.setTargetAtTime(0, time, 0.8);
      setTimeout(() => old.oscs.forEach((o) => o.stop()), (time - ctx.currentTime + 5) * 1000);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.setTargetAtTime(0.045, time, 1.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.connect(g).connect(musicBus);
    const oscs = [0, 7, 12].map((iv, k) => {
      const o = ctx.createOscillator();
      o.type = k === 2 ? 'sine' : 'triangle';
      o.frequency.value = midiHz(root + iv);
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(lp);
      o.start(time);
      return o;
    });
    drone = { g, oscs };
  }

  /* ---------- 旋律：兩小節的動機，A A' B A 組成一段，然後重新產生 ---------- */
  function nearestIdx(midi) {
    let best = MEL_LO;
    for (let i = MEL_LO; i <= MEL_HI; i++) if (Math.abs(SCALE[i] - midi) < Math.abs(SCALE[best] - midi)) best = i;
    return best;
  }
  function motif(root) {
    const notes = [];
    let idx = nearestIdx(root + 24 + pick([0, 7, 12]));
    for (let b = 0; b < 2; b++) {
      let pos = 0;
      for (const len of pick(RHYTHMS)) {
        if (Math.random() < 0.12 && pos > 0) { pos += len; continue; } // 偶爾留白
        notes.push({ at: b * 8 + pos, idx, len });
        const step = pick([-2, -1, -1, 0, 1, 1, 2, 3, -3]);
        idx = Math.max(MEL_LO, Math.min(MEL_HI, idx + step));
        pos += len;
      }
    }
    return notes;
  }
  function vary(m) {
    return m.map((n, i) => (i >= m.length - 2 ? { ...n, idx: Math.max(MEL_LO, Math.min(MEL_HI, n.idx + pick([-1, 1, 2]))) } : n));
  }
  function newPhrase() {
    const a = motif(ROOTS[0]);
    const b = motif(ROOTS[2]);
    return [a, vary(a), b, vary(a)];
  }

  function scheduleBar(t) {
    const chord = Math.floor(bar / 2) % ROOTS.length;
    const root = ROOTS[chord];
    if (bar % 2 === 0) setDrone(root, t);
    if (bar % 8 === 0) phrase = newPhrase();
    // 低音的琴：每小節第一拍，偶爾第五拍再撥一次
    pluck(root + 12, t, 0.32, musicBus, -0.2);
    if (Math.random() < 0.5) pluck(root + 19, t + EIGHTH * 4, 0.2, musicBus, -0.2);

    const m = phrase[Math.floor((bar % 8) / 2)];
    const half = bar % 2;
    for (const n of m) {
      if (Math.floor(n.at / 8) !== half) continue;
      const nt = t + (n.at % 8) * EIGHTH + (Math.random() - 0.5) * 0.02;
      const midi = SCALE[n.idx];
      // 偶爾加一個從上面滑下來的裝飾音（箏的感覺）
      if (Math.random() < 0.15 && n.idx < MEL_HI) pluck(SCALE[n.idx + 1], nt - 0.07, 0.16);
      pluck(midi, nt, n.len >= 4 ? 0.42 : 0.34);
      // 長音後面補一個低八度的回音
      if (n.len >= 4 && Math.random() < 0.4) pluck(midi - 12, nt + EIGHTH * 2, 0.15);
    }
    // 段落結尾：三個音往上的掃弦
    if (bar % 8 === 7 && Math.random() < 0.7) {
      const base = nearestIdx(root + 24);
      for (let k = 0; k < 4; k++) pluck(SCALE[Math.min(MEL_HI, base + k)], t + EIGHTH * 6 + k * 0.08, 0.18);
    }
    // 風鈴
    if (Math.random() < 0.3) bell(midiHz(pick([88, 91, 93, 96])), t + Math.random() * BAR, 0.035);
    bar++;
  }

  function tick() {
    // 背景分頁的計時器會被放慢到一秒一次，所以提早排好一整小節
    while (nextBar < ctx.currentTime + BAR + 0.5) {
      scheduleBar(nextBar);
      nextBar += BAR;
    }
  }

  function start() {
    if (!ctx || started) return;
    started = true;
    ctx.resume();
    nextBar = ctx.currentTime + 0.2;
    bar = 0;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(volume * 0.5, ctx.currentTime, 1.2);
    tick();
    timer = setInterval(tick, 200);
  }
  function stop() {
    if (!ctx || !started) return;
    started = false;
    clearInterval(timer);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    if (drone) { const old = drone; drone = null; setTimeout(() => old.oscs.forEach((o) => o.stop()), 2500); }
  }

  /* ---------- 對外 ---------- */
  // 使用者第一次點擊 / 按鍵時呼叫
  function unlock() {
    init();
    if (enabled) start();
    else ctx.resume();
  }
  function setEnabled(on) {
    enabled = on;
    if (on) { init(); start(); } else stop();
  }
  function setVolume(v) {
    volume = v;
    if (ctx && started) master.gain.setTargetAtTime(volume * 0.5, ctx.currentTime, 0.1);
  }
  const ready = () => ctx && started;

  const sfx = {
    // 香油錢落進箱子：清脆的叮
    coin() {
      if (!ready()) return;
      const t = ctx.currentTime;
      bell(pick([1568, 1760, 2093]), t, 0.05, 1.2, sfxBus);
      pluck(pick([76, 77, 81]), t + 0.03, 0.12, sfxBus);
    },
    // 開箱：往上的琴音
    open() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [57, 60, 64, 69, 72, 76].forEach((m, i) => pluck(m, t + i * 0.09, 0.3, sfxBus));
    },
    // 結尾：一串風鈴往下灑
    finale() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [93, 89, 88, 84, 81, 77, 76].forEach((m, i) => bell(midiHz(m), t + i * 0.12, 0.045, 3, sfxBus));
      [57, 64, 69].forEach((m) => pluck(m, t + 0.9, 0.3, sfxBus));
    },
  };

  return { unlock, setEnabled, setVolume, sfx, get enabled() { return enabled; }, get started() { return started; } };
})();
