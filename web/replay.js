// F1 TOP — レースリプレイ（コース図＋マシン＋ステアリング計器）
// データ: TracingInsights/2026 (Apache-2.0) — FastF1 由来のラップ/テレメトリ
export const TI_BASE = "https://raw.githubusercontent.com/TracingInsights/2026/main";

const COMPOUND = {
  SOFT: { c: "#E10600", s: "S" }, MEDIUM: { c: "#F5C518", s: "M" }, HARD: { c: "#EEF1F3", s: "H" },
  INTERMEDIATE: { c: "#35D07F", s: "I" }, WET: { c: "#3B82F6", s: "W" },
};
const JP = {
  ANT: "アントネッリ", RUS: "ラッセル", HAM: "ハミルトン", NOR: "ノリス", LEC: "ルクレール", VER: "フェルスタッペン",
  PIA: "ピアストリ", HAD: "ハジャー", LAW: "ローソン", GAS: "ガスリー", LIN: "リンドブラッド", COL: "コラピント",
  BEA: "ベアマン", BOR: "ボルトレト", HUL: "ヒュルケンベルグ", SAI: "サインツ", ALB: "アルボン", OCO: "オコン",
  ALO: "アロンソ", TSU: "角田", STR: "ストロール", BOT: "ボッタス", PER: "ペレス",
};
const SPEEDS = [1, 4, 16, 64];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (v === null || v === undefined || v === "None" || v === "" || Number.isNaN(+v) ? null : +v);
const fmtLap = (s) => (s == null ? "—" : `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}`);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================= データソース ================= */
export class RemoteSource {
  constructor(base = TI_BASE) { this.base = base; }
  url(ev, ...p) { return [this.base, ev, "Race", ...p].map((s, i) => (i ? encodeURIComponent(s) : s)).join("/"); }
  async json(u) { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status}`); return r.json(); }
  async session(ev) {
    const [drivers, session, rcm] = await Promise.all([
      this.json(this.url(ev, "drivers.json")), this.json(this.url(ev, "session_laptimes.json")),
      this.json(this.url(ev, "rcm.json")).catch(() => null),
    ]);
    return { drivers, session, rcm };
  }
  lap(ev, drv, lap) { return this.json(this.url(ev, drv, `${lap}_tel.json`)); }
  canTel() { return true; }
}
export class EmbeddedSource {
  constructor(data) { this.d = data; }
  async session() { return { drivers: this.d.drivers, session: this.d.session, rcm: this.d.rcm }; }
  async lap(ev, drv, lap) { const t = this.d.tel[drv]?.[lap]; if (!t) throw new Error("no tel"); return t; }
  canTel(drv) { return !!this.d.tel[drv]; }
}

/* ================= データ整形 ================= */
function buildRace({ drivers, session, rcm }) {
  const n = session.lap.length;
  const by = {};
  for (let i = 0; i < n; i++) {
    const d = session.drv[i];
    (by[d] ??= []).push({
      lap: +session.lap[i], start: num(session.lST[i]), dur: num(session.time[i]), compound: session.compound[i],
      stint: num(session.stint[i]), life: num(session.life[i]), pos: num(session.pos[i]),
      pin: num(session.pin[i]) != null, pout: num(session.pout[i]) != null, team: session.team[i],
      s1: num(session.s1[i]), s2: num(session.s2[i]), s3: num(session.s3[i]),
    });
  }
  for (const d in by) {
    const L = by[d].filter((l) => l.start != null).sort((a, b) => a.lap - b.lap);
    L.forEach((l, i) => { if (l.dur == null) l.dur = L[i + 1] ? L[i + 1].start - l.start : 100; l.end = l.start + l.dur; });
    by[d] = L;
  }
  const maxLap = Math.max(...Object.values(by).map((L) => L.at(-1)?.lap || 0));
  const T0 = Math.min(...Object.values(by).map((L) => L[0]?.start ?? Infinity));
  const Tend = Math.max(...Object.values(by).map((L) => L.at(-1)?.end ?? 0));
  const info = {};
  for (const x of drivers?.drivers || []) info[x.driver] = { code: x.driver, team: x.team, color: `#${x.tc || "9CA6B0"}`, name: `${x.fn} ${x.ln}`, jp: JP[x.driver] || x.ln, no: x.dn };
  for (const d in by) info[d] ??= { code: d, team: by[d][0]?.team || "", color: "#9CA6B0", name: d, jp: JP[d] || d };
  // 2台目（同チームで番号の大きい方）に白ストライプ
  const teams = {};
  for (const d in by) (teams[info[d].team] ??= []).push(d);
  for (const t in teams) teams[t].sort((a, b) => (+info[a].no || 0) - (+info[b].no || 0)).forEach((d, i) => (info[d].second = i === 1));
  // レースコントロール（時刻をセッション秒に変換）
  const msgs = [];
  if (rcm?.msg) {
    const i0 = session.lSD ? 0 : -1;
    const aDate = i0 === 0 ? Date.parse(String(session.lSD[0]).slice(0, 23) + "Z") : null;
    const aT = num(session.lST[0]);
    for (let i = 0; i < rcm.msg.length; i++) {
      const t = aDate ? (Date.parse(String(rcm.time[i]).slice(0, 23) + "Z") - aDate) / 1000 + aT : null;
      if (t != null) msgs.push({ t, msg: rcm.msg[i], flag: rcm.flag[i], cat: rcm.cat[i] });
    }
  }
  return { by, info, teams, maxLap, T0, Tend, msgs };
}

function prepTel(raw) {
  const t = raw.tel || raw;
  const n = t.time.length;
  const o = { n };
  for (const k of ["time", "x", "y", "speed", "rpm", "gear", "throttle", "brake", "drs", "acc_x", "acc_y", "distance"]) {
    const a = new Float32Array(n);
    const src = t[k] || [];
    for (let i = 0; i < n; i++) a[i] = num(src[i]) ?? 0;
    o[k] = a;
  }
  return o;
}
function seek(arr, v, n = arr.length) {
  let lo = 0, hi = n - 1;
  if (v <= arr[0]) return 0;
  if (v >= arr[hi]) return hi;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; }
  return lo;
}

/* ================= マシンのシルエット（上面図・機首 +x） ================= */
function carPath() {
  const p = new Path2D();
  // 車体
  p.moveTo(0.5, 0); p.lineTo(0.3, 0.04); p.lineTo(0.14, 0.06); p.lineTo(0.08, 0.15); p.lineTo(-0.2, 0.15);
  p.lineTo(-0.3, 0.075); p.lineTo(-0.42, 0.06); p.lineTo(-0.42, -0.06); p.lineTo(-0.3, -0.075); p.lineTo(-0.2, -0.15);
  p.lineTo(0.08, -0.15); p.lineTo(0.14, -0.06); p.lineTo(0.3, -0.04); p.closePath();
  // フロントウイング・リアウイング
  p.rect(0.4, -0.19, 0.075, 0.38);
  p.rect(-0.5, -0.16, 0.08, 0.32);
  return p;
}
function wheelsPath() {
  const p = new Path2D();
  p.rect(0.2, 0.13, 0.13, 0.08); p.rect(0.2, -0.21, 0.13, 0.08);
  p.rect(-0.37, 0.14, 0.15, 0.09); p.rect(-0.37, -0.23, 0.15, 0.09);
  return p;
}
const CAR = typeof Path2D !== "undefined" ? carPath() : null;
const WHEELS = typeof Path2D !== "undefined" ? wheelsPath() : null;

/* ================= 本体 ================= */
export async function mountReplay(root, opts) {
  const { source, events, event: ev0, a: a0 = "ANT", b: b0 = "VER", credit = true } = opts;
  const st = {
    ev: ev0 || events?.[0]?.name, race: null, ref: null, tel: new Map(), queue: [], active: 0,
    A: a0, B: b0, T: 0, playing: false, speed: 16, showAll: true, trails: { A: [], B: [] }, lastTs: 0, lastUi: 0,
  };
  root.innerHTML = `
  <div class="rp">
    <div class="rp-bar">
      <label class="rp-f"><span>レース</span><select id="rp-ev">${(events || []).map((e) => `<option value="${esc(e.name)}">${esc(e.label || e.name)}</option>`).join("")}</select></label>
      <label class="rp-f"><span class="rp-dot" id="rp-dotA"></span><span>マシンA</span><select id="rp-a"></select></label>
      <label class="rp-f"><span class="rp-dot rp-dot-b" id="rp-dotB"></span><span>マシンB</span><select id="rp-b"></select></label>
      <label class="rp-f"><span>チームメイト対決</span><select id="rp-team"><option value="">チームを選ぶ</option></select></label>
    </div>
    <div class="rp-main">
      <section class="rp-mapbox">
        <div class="rp-flag" id="rp-flag" hidden></div>
        <canvas id="rp-map" aria-label="コース図とマシン位置"></canvas>
        <div class="rp-loading" id="rp-load">データを読み込み中…</div>
        <div class="rp-ctrl">
          <button class="rp-play" id="rp-play" aria-label="再生">▶</button>
          <div class="rp-time"><b id="rp-lap">LAP —</b><span id="rp-clock">0:00:00</span></div>
          <input type="range" id="rp-seek" min="0" max="1" step="0.5" value="0" aria-label="再生位置">
          <div class="rp-speeds" role="group" aria-label="再生速度">${SPEEDS.map((s) => `<button data-s="${s}" aria-pressed="${s === st.speed}">${s}×</button>`).join("")}</div>
          <label class="rp-all"><input type="checkbox" id="rp-all" checked> 全車</label>
        </div>
      </section>
      <aside class="rp-side">
        <div class="rp-gap" id="rp-gap"></div>
        <div class="rp-wheels"><div class="wheel" id="rp-wA"></div><div class="wheel" id="rp-wB"></div></div>
      </aside>
    </div>
    <div class="rp-lower">
      <section class="rp-card"><h3>タイヤ戦略</h3><div id="rp-strat"></div><h3 style="margin-top:14px">ラップタイム</h3><div id="rp-laps"></div></section>
      <section class="rp-card"><h3>隊列（推定）</h3><ol class="rp-tower" id="rp-tower"></ol></section>
    </div>
    ${credit ? `<p class="rp-credit">テレメトリ: <a href="https://github.com/TracingInsights/2026" target="_blank" rel="noopener">TracingInsights</a>（FastF1由来・Apache-2.0）。選んだ2台は実測の位置、それ以外はラップタイムからの推定位置です。</p>` : ""}
  </div>`;
  const $ = (s) => root.querySelector(s);
  const canvas = $("#rp-map"), ctx = canvas.getContext("2d");
  if (events?.length) $("#rp-ev").value = st.ev;
  $("#rp-ev").disabled = !events || events.length < 2;

  /* ---------- 読み込み ---------- */
  async function loadEvent() {
    st.playing = false; syncPlay();
    $("#rp-load").hidden = false; $("#rp-load").textContent = "データを読み込み中…";
    st.tel.clear(); st.queue = []; st.ref = null;
    try {
      st.race = buildRace(await source.session(st.ev));
    } catch {
      $("#rp-load").textContent = "このレースのデータはまだ公開されていません。別のレースを選んでください。";
      return;
    }
    const R = st.race;
    const cand = Object.keys(R.by).sort((a, b) => (finalPos(a) ?? 99) - (finalPos(b) ?? 99));
    if (!R.by[st.A] || !source.canTel(st.A)) st.A = cand.find((d) => source.canTel(d));
    if (!R.by[st.B] || !source.canTel(st.B) || st.B === st.A) st.B = cand.find((d) => d !== st.A && source.canTel(d));
    fillSelects(cand);
    st.T = R.T0 - 3;
    $("#rp-seek").min = R.T0 - 3; $("#rp-seek").max = R.Tend; $("#rp-seek").value = st.T;
    if (!(await buildRef())) {
      $("#rp-load").textContent = "選んだマシンの計測データがまだ公開されていません。別のドライバーを選んでください。";
      return;
    }
    $("#rp-load").hidden = true;
    resize(); drawStatic(); prefetch();
  }
  function finalPos(d) { const L = st.race.by[d]; return L?.at(-1)?.pos; }
  function fillSelects(cand) {
    const R = st.race;
    const opt = (sel) => cand.map((d) => `<option value="${d}" ${d === sel ? "selected" : ""} ${source.canTel(d) ? "" : "disabled"}>${esc(R.info[d].jp)}（${esc(R.info[d].team)}）${finalPos(d) ? ` P${finalPos(d)}` : ""}</option>`).join("");
    $("#rp-a").innerHTML = opt(st.A);
    $("#rp-b").innerHTML = opt(st.B);
    const teams = Object.keys(R.teams).filter((t) => R.teams[t].length >= 2 && R.teams[t].every((d) => source.canTel(d)));
    $("#rp-team").innerHTML = `<option value="">${teams.length ? "チームを選ぶ" : "（このデータでは選べません）"}</option>` + teams.map((t) => `<option>${esc(t)}</option>`).join("");
    $("#rp-team").disabled = !teams.length;
    $("#rp-dotA").style.background = R.info[st.A].color;
    $("#rp-dotB").style.background = R.info[st.B].color;
  }
  async function getLap(drv, lap) {
    const k = `${drv}-${lap}`;
    const v = st.tel.get(k);
    if (v && v !== "loading") return v === "miss" ? null : v;
    if (v === "loading") return null;
    st.tel.set(k, "loading");
    try { const t = prepTel(await source.lap(st.ev, drv, lap)); st.tel.set(k, t); return t; }
    catch { st.tel.set(k, "miss"); return null; }
  }
  // 基準ラップ（Aの最速のクリーンラップ）→ コース形状と「時間→位置」の対応表
  async function buildRef() {
    for (const d of [st.A, st.B]) {
      const L = st.race.by[d].filter((l) => l.lap > 1 && !l.pin && !l.pout).sort((a, b) => a.dur - b.dur);
      for (const l of L.slice(0, 3)) {
        const t = await getLap(d, l.lap);
        if (t && t.n > 50) { st.ref = { ...t, dur: l.dur }; return true; }
      }
    }
    return false;
  }
  function prefetch() {
    // 現在地の前後を優先し、残りは裏で順番に取得（同時3本まで）
    const lap = currentLap(st.A);
    const order = [];
    for (const d of [st.A, st.B]) for (let l = Math.max(1, lap - 1); l <= Math.min(st.race.maxLap, lap + 3); l++) order.push([d, l]);
    for (const d of [st.A, st.B]) for (let l = 1; l <= st.race.maxLap; l++) order.push([d, l]);
    st.queue = order.filter(([d, l]) => !st.tel.has(`${d}-${l}`));
    pump();
  }
  function pump() {
    while (st.active < 3 && st.queue.length) {
      const [d, l] = st.queue.shift();
      if (st.tel.has(`${d}-${l}`)) continue;
      st.active++;
      getLap(d, l).finally(() => { st.active--; pump(); });
    }
  }

  /* ---------- 位置計算 ---------- */
  function lapAt(drv, T) {
    const L = st.race.by[drv];
    if (!L?.length) return null;
    if (T < L[0].start) return { l: L[0], t: 0, pre: true };
    if (T >= L.at(-1).end) return { l: L.at(-1), t: L.at(-1).dur, done: true };
    let lo = 0, hi = L.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (L[m].start <= T) lo = m; else hi = m - 1; }
    return { l: L[lo], t: T - L[lo].start };
  }
  const currentLap = (drv) => lapAt(drv, st.T)?.l.lap || 1;
  function refPoint(frac) {
    const r = st.ref; if (!r) return null;
    const i = seek(r.time, frac * r.time[r.n - 1], r.n), j = Math.min(i + 1, r.n - 1);
    const span = r.time[j] - r.time[i] || 1, k = clamp((frac * r.time[r.n - 1] - r.time[i]) / span, 0, 1);
    return { x: r.x[i] + (r.x[j] - r.x[i]) * k, y: r.y[i] + (r.y[j] - r.y[i]) * k, hx: r.x[j] - r.x[i], hy: r.y[j] - r.y[i] };
  }
  function stateOf(drv, T, wantTel) {
    const a = lapAt(drv, T);
    if (!a) return null;
    const frac = clamp(a.t / a.l.dur, 0, 1);
    const prog = a.l.lap - 1 + (a.pre ? 0 : frac);
    const base = { drv, lap: a.l, frac, prog, done: a.done, pre: a.pre, retired: a.done && a.l.lap < st.race.maxLap };
    const tel = wantTel ? st.tel.get(`${drv}-${a.l.lap}`) : null;
    if (tel && typeof tel === "object") {
      const t = a.pre ? 0 : a.t;
      const i = seek(tel.time, t, tel.n), j = Math.min(i + 1, tel.n - 1);
      const span = tel.time[j] - tel.time[i] || 1, k = clamp((t - tel.time[i]) / span, 0, 1);
      const L = (key) => tel[key][i] + (tel[key][j] - tel[key][i]) * k;
      let hx = tel.x[j] - tel.x[i], hy = tel.y[j] - tel.y[i];
      if (!hx && !hy && i > 0) { hx = tel.x[i] - tel.x[i - 1]; hy = tel.y[i] - tel.y[i - 1]; }
      return { ...base, real: true, x: L("x"), y: L("y"), hx, hy, speed: L("speed"), rpm: L("rpm"), gear: tel.gear[i],
        throttle: L("throttle"), brake: tel.brake[i], drs: tel.drs[i], gx: L("acc_x") / 9.81, gy: L("acc_y") / 9.81 };
    }
    const p = refPoint(a.pre ? 0 : frac);
    return p ? { ...base, real: false, ...p } : null;
  }
  // 「前のマシンが、後ろのマシンの現在地を通過してから何秒か」でギャップを算出
  function timeAtProg(drv, prog) {
    const L = st.race.by[drv]; const lap = Math.floor(prog) + 1, f = prog - Math.floor(prog);
    const l = L.find((x) => x.lap === lap) || L.at(-1);
    return l.start + f * l.dur;
  }

  /* ---------- 描画 ---------- */
  let view = null, dpr = 1, W = 0, H = 0, trackCanvas = null;
  function css(name) { return getComputedStyle(root.querySelector(".rp") || root).getPropertyValue(name).trim(); }
  function resize() {
    if (!st.ref) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.parentElement.clientWidth;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < st.ref.n; i++) { const x = st.ref.x[i], y = st.ref.y[i]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const ratio = clamp((maxY - minY) / (maxX - minX), 0.5, 1.1);
    H = Math.round(W * ratio);
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = `${H}px`;
    const pad = W * 0.07, s = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY));
    const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;
    view = { s, px: (x) => ox + (x - minX) * s, py: (y) => oy + (maxY - y) * s };
    drawStatic();
  }
  function drawStatic() {
    if (!view) return;
    trackCanvas = document.createElement("canvas");
    trackCanvas.width = canvas.width; trackCanvas.height = canvas.height;
    const c = trackCanvas.getContext("2d");
    c.scale(dpr, dpr);
    const r = st.ref, tw = clamp(W / 55, 7, 16);
    c.beginPath();
    for (let i = 0; i < r.n; i++) { const x = view.px(r.x[i]), y = view.py(r.y[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.closePath();
    c.lineJoin = c.lineCap = "round";
    c.strokeStyle = css("--rp-kerb"); c.lineWidth = tw + 4; c.stroke();
    c.strokeStyle = css("--rp-track"); c.lineWidth = tw; c.stroke();
    // スタート/フィニッシュライン（市松模様）
    const x0 = view.px(r.x[0]), y0 = view.py(r.y[0]);
    const ang = Math.atan2(view.py(r.y[3]) - y0, view.px(r.x[3]) - x0) + Math.PI / 2;
    c.save(); c.translate(x0, y0); c.rotate(ang);
    for (let i = -2; i < 2; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? "#000" : "#fff"; c.fillRect((i * tw) / 4, (j - 1) * 3, tw / 4, 3); }
    c.restore();
  }
  function drawCar(c, s, info, size, halo) {
    const ang = Math.atan2(-(s.hy) * 1, s.hx); // y反転
    const x = view.px(s.x), y = view.py(s.y);
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(size, size);
    c.shadowColor = halo; c.shadowBlur = 10 / size;
    c.fillStyle = info.color; c.fill(CAR, "evenodd"); c.shadowBlur = 0;
    c.lineWidth = 1.2 / size; c.strokeStyle = "rgba(0,0,0,.55)"; c.stroke(CAR);
    if (info.second) { c.fillStyle = "#fff"; c.fillRect(-0.4, -0.022, 0.86, 0.044); }
    c.fillStyle = "#111"; c.fill(WHEELS);
    c.fillStyle = "#1b1b1b"; c.beginPath(); c.ellipse(-0.02, 0, 0.07, 0.04, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    return { x, y };
  }
  function draw(states) {
    if (!view) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(trackCanvas, 0, 0, W, H);
    const R = st.race;
    if (st.showAll) {
      for (const d in R.by) {
        if (d === st.A || d === st.B) continue;
        const s = stateOf(d, st.T, false);
        if (!s || s.retired) continue;
        ctx.beginPath(); ctx.arc(view.px(s.x), view.py(s.y), clamp(W / 190, 3, 5), 0, Math.PI * 2);
        ctx.fillStyle = R.info[d].color; ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    const size = clamp(W / 15, 26, 50);
    for (const slot of ["B", "A"]) {
      const s = states[slot]; if (!s) continue;
      const info = R.info[st[slot]];
      // 軌跡
      const tr = st.trails[slot];
      if (st.playing && !s.done) { tr.push([view.px(s.x), view.py(s.y)]); if (tr.length > 40) tr.shift(); }
      for (let i = 1; i < tr.length; i++) {
        ctx.strokeStyle = info.color; ctx.globalAlpha = (i / tr.length) * 0.6; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(tr[i - 1][0], tr[i - 1][1]); ctx.lineTo(tr[i][0], tr[i][1]); ctx.stroke();
      }
      ctx.globalAlpha = s.retired ? 0.35 : 1;
      const p = drawCar(ctx, s, info, size, info.color);
      ctx.globalAlpha = 1;
      // ラベル
      const label = `${info.code}  P${s.lap.pos ?? "-"}`;
      ctx.font = `700 ${clamp(W / 60, 11, 14)}px "Saira Condensed", sans-serif`;
      const w = ctx.measureText(label).width + 12, h = clamp(W / 42, 16, 21);
      const lx = clamp(p.x - w / 2, 2, W - w - 2), ly = clamp(p.y - size * 0.75 - h, 2, H - h - 2);
      ctx.fillStyle = "rgba(10,12,14,.82)"; roundRect(ctx, lx, ly, w, h, 4); ctx.fill();
      ctx.fillStyle = info.color; ctx.fillRect(lx, ly, 3, h);
      ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(label, lx + 8, ly + h / 2 + 1);
    }
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  /* ---------- 計器（ステアリング・ディスプレイ） ---------- */
  function wheelHtml(slot) {
    return `<div class="wh-top"><span class="wh-bar"></span><b class="wh-code"></b><span class="wh-name"></span><span class="wh-pos"></span></div>
      <div class="wh-leds">${Array.from({ length: 15 }, (_, i) => `<i class="${i < 5 ? "g" : i < 10 ? "r" : "b"}"></i>`).join("")}</div>
      <div class="wh-mid">
        <div class="wh-spd"><b class="wh-speed">—</b><span>km/h</span></div>
        <div class="wh-gear">—</div>
        <div class="wh-rpm"><b class="wh-rpmv">—</b><span>rpm</span></div>
      </div>
      <div class="wh-low">
        <div class="wh-ped"><span>アクセル</span><div class="wh-trk"><i class="wh-thr"></i></div><span>ブレーキ</span><div class="wh-trk"><i class="wh-brk"></i></div></div>
        <svg class="wh-g" viewBox="-30 -30 60 60" aria-label="Gフォース（外周6G）"><circle r="27"/><circle r="13.5"/><line x1="-27" x2="27"/><line y1="-27" y2="27"/><circle class="wh-gdot" r="4"/></svg>
      </div>
      <div class="wh-info"><span class="wh-tyre"></span><span class="wh-wing">ウイング開</span><span class="wh-lt"></span></div>
      <p class="wh-note" hidden>このラップの計測データを読み込み中</p>`;
  }
  $("#rp-wA").innerHTML = wheelHtml("A");
  $("#rp-wB").innerHTML = wheelHtml("B");
  function updWheel(el, drv, s) {
    const info = st.race.info[drv];
    const q = (c) => el.querySelector(c);
    el.style.setProperty("--team", info.color);
    el.classList.toggle("second", !!info.second);
    q(".wh-code").textContent = info.code;
    q(".wh-name").textContent = info.jp;
    q(".wh-pos").textContent = s?.retired ? "リタイア" : s ? `P${s.lap.pos ?? "-"}` : "";
    const real = s?.real;
    q(".wh-note").hidden = !s || real || s.done;
    const sp = real ? Math.round(s.speed) : null;
    q(".wh-speed").textContent = sp ?? "—";
    q(".wh-gear").textContent = real ? (s.gear || "N") : "—";
    q(".wh-rpmv").textContent = real ? Math.round(s.rpm / 100) * 100 : "—";
    const lit = real ? clamp(Math.round(((s.rpm - 9000) / 3200) * 15), 0, 15) : 0;
    el.querySelectorAll(".wh-leds i").forEach((d, i) => d.classList.toggle("on", i < lit));
    q(".wh-thr").style.transform = `scaleX(${real ? s.throttle / 100 : 0})`;
    q(".wh-brk").style.transform = `scaleX(${real && s.brake ? 1 : 0})`;
    const gx = real ? clamp(s.gy * 4.5, -27, 27) : 0, gy = real ? clamp(-s.gx * 4.5, -27, 27) : 0;
    q(".wh-gdot").setAttribute("cx", gx.toFixed(1)); q(".wh-gdot").setAttribute("cy", gy.toFixed(1));
    q(".wh-wing").classList.toggle("on", !!(real && s.drs));
    if (s) {
      const c = COMPOUND[s.lap.compound] || { c: "#9CA6B0", s: "?" };
      q(".wh-tyre").innerHTML = `<i style="--c:${c.c}">${c.s}</i>${s.lap.life ?? "-"}周目`;
      const prev = st.race.by[drv].find((l) => l.lap === s.lap.lap - 1);
      q(".wh-lt").textContent = `前周 ${fmtLap(prev?.dur)}`;
    }
  }

  function updGap(sA, sB) {
    const R = st.race, iA = R.info[st.A], iB = R.info[st.B];
    const el = $("#rp-gap");
    if (!sA || !sB) { el.innerHTML = ""; return; }
    if (sA.pre && sB.pre) { el.innerHTML = `<span class="rp-gapv">スタート前</span>`; return; }
    const aAhead = sA.prog >= sB.prog;
    const ahead = aAhead ? st.A : st.B, behind = aAhead ? st.B : st.A;
    const sBehind = aAhead ? sB : sA;
    const gap = sBehind.retired ? null : st.T - timeAtProg(ahead, (aAhead ? sB : sA).prog);
    const lapsDown = Math.floor(Math.abs(sA.prog - sB.prog));
    el.innerHTML = `
      <span class="rp-gapw"><i style="background:${R.info[ahead].color}"></i>${esc(R.info[ahead].jp)} が前</span>
      <span class="rp-gapv">${gap == null ? "—" : lapsDown >= 1 ? `+${lapsDown}周` : `${gap.toFixed(1)}<small>秒</small>`}</span>
      <span class="rp-gapw muted">${esc(R.info[behind].jp)}</span>`;
    void iA; void iB;
  }

  /* ---------- 戦略・ラップタイム・隊列 ---------- */
  function drawStrategy() {
    const R = st.race, max = R.maxLap, W2 = 600, rowH = 22, pad = 50;
    const rows = [st.A, st.B];
    const x = (lap) => pad + ((lap - 1) / max) * (W2 - pad - 6);
    const svg = rows.map((d, r) => {
      const L = R.by[d], y = 6 + r * (rowH + 8);
      const stints = [];
      for (const l of L) { const last = stints.at(-1); if (!last || last.stint !== l.stint) stints.push({ stint: l.stint, from: l.lap, to: l.lap, c: l.compound }); else last.to = l.lap; }
      return `<text x="0" y="${y + 15}" class="lbl">${esc(R.info[d].code)}</text>` +
        stints.map((s) => `<rect x="${x(s.from)}" y="${y}" width="${Math.max(2, x(s.to + 1) - x(s.from) - 2)}" height="${rowH}" rx="4" fill="${(COMPOUND[s.c] || {}).c || "#888"}"/><text x="${x(s.from) + 6}" y="${y + 15}" class="in">${(COMPOUND[s.c] || { s: "?" }).s} ${s.to - s.from + 1}</text>`).join("");
    }).join("");
    const ticks = [1, ...[10, 20, 30, 40, 50, 60, 70].filter((v) => v < max), max].map((l) => `<text x="${x(l)}" y="72" class="tk">${l}</text>`).join("");
    $("#rp-strat").innerHTML = `<svg viewBox="0 0 ${W2} 78" class="rp-svg" id="rp-stsvg">${svg}${ticks}<line id="rp-cur1" y1="0" y2="60" class="cur"/></svg>`;
    // ラップタイム
    const pts = rows.map((d) => R.by[d].filter((l) => l.lap > 1 && !l.pin && !l.pout).map((l) => [l.lap, l.dur]));
    const all = pts.flat().map((p) => p[1]).sort((a, b) => a - b);
    const lo = all[0] ?? 90, hi = Math.min(all.at(-1) ?? 100, (all[Math.floor(all.length / 2)] ?? 95) * 1.08);
    const H2 = 150, y = (v) => 8 + (1 - (clamp(v, lo, hi) - lo) / (hi - lo || 1)) * (H2 - 30);
    const lines = rows.map((d, i) => `<polyline fill="none" stroke="${R.info[d].color}" stroke-width="2" ${i ? 'stroke-dasharray="5 4"' : ""} points="${pts[i].map(([l, v]) => `${x(l).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`).join("");
    const yt = [lo, (lo + hi) / 2, hi].map((v) => `<text x="0" y="${y(v) + 4}" class="yl">${fmtLap(v).slice(0, -2)}</text>`).join("");
    $("#rp-laps").innerHTML = `<svg viewBox="0 0 ${W2} ${H2}" class="rp-svg" id="rp-ltsvg">${yt}${lines}${ticks.replaceAll('y="72"', `y="${H2 - 4}"`)}<line id="rp-cur2" y1="0" y2="${H2 - 18}" class="cur"/></svg>`;
    const onClick = (e) => {
      const svgEl = e.currentTarget, b = svgEl.getBoundingClientRect();
      const vx = ((e.clientX - b.left) / b.width) * W2;
      const lap = clamp(Math.round(((vx - pad) / (W2 - pad - 6)) * max) + 1, 1, max);
      const l = R.by[st.A].find((q) => q.lap === lap) || R.by[st.A].at(-1);
      jump(l.start + 0.1);
    };
    $("#rp-stsvg").addEventListener("click", onClick);
    $("#rp-ltsvg").addEventListener("click", onClick);
    st.xOfLap = x;
  }
  function updCursor(prog) {
    if (!st.xOfLap) return;
    const xv = st.xOfLap(prog + 1).toFixed(1);
    for (const id of ["#rp-cur1", "#rp-cur2"]) { const l = $(id); if (l) { l.setAttribute("x1", xv); l.setAttribute("x2", xv); } }
  }
  function updTower() {
    const R = st.race;
    const rows = Object.keys(R.by).map((d) => stateOf(d, st.T, false)).filter(Boolean)
      .sort((a, b) => (a.retired - b.retired) || (b.prog - a.prog) || ((a.lap.pos ?? 99) - (b.lap.pos ?? 99)));
    const lead = rows[0];
    $("#rp-tower").innerHTML = rows.map((s, i) => {
      const info = R.info[s.drv];
      const gap = i === 0 ? (s.pre ? "スタート前" : "先頭") : s.retired ? "リタイア" : s.pre ? "—" : (lead.prog - s.prog >= 1 ? `+${Math.floor(lead.prog - s.prog)}周` : `+${(st.T - timeAtProg(lead.drv, s.prog)).toFixed(1)}`);
      const c = COMPOUND[s.lap.compound] || { c: "#888", s: "?" };
      const focus = s.drv === st.A ? "fa" : s.drv === st.B ? "fb" : "";
      return `<li class="${focus} ${s.retired ? "ret" : ""}"><span class="p">${i + 1}</span><span class="tb" style="background:${info.color}"></span><b>${info.code}</b><span class="g">${gap}</span><span class="ty" style="--c:${c.c}">${c.s}</span></li>`;
    }).join("");
  }
  function updFlag() {
    const m = st.race.msgs.filter((x) => x.t <= st.T && (x.cat === "Flag" || x.cat === "SafetyCar" || /SAFETY CAR|VSC|RED FLAG/i.test(x.msg))).at(-1);
    const el = $("#rp-flag");
    if (!m || st.T - m.t > 25) { el.hidden = true; return; }
    el.hidden = false;
    const f = (m.flag || "").toUpperCase();
    el.className = `rp-flag ${/YELLOW|VSC|SAFETY/.test(f + m.msg.toUpperCase()) ? "y" : f === "RED" ? "r" : f === "GREEN" || f === "CLEAR" ? "g" : f === "CHEQUERED" ? "c" : ""}`;
    el.textContent = m.msg;
  }

  /* ---------- ループ ---------- */
  function frame(ts) {
    if (!canvas.isConnected || st.dead) { ro.disconnect(); return; }
    if (!st.race || !st.ref) { requestAnimationFrame(frame); return; }
    const dt = st.lastTs ? Math.min(0.1, (ts - st.lastTs) / 1000) : 0;
    st.lastTs = ts;
    if (st.playing) {
      st.T = Math.min(st.race.Tend, st.T + dt * st.speed);
      if (st.T >= st.race.Tend) { st.playing = false; syncPlay(); }
    }
    const sA = stateOf(st.A, st.T, true), sB = stateOf(st.B, st.T, true);
    draw({ A: sA, B: sB });
    if (ts - st.lastUi > 90) {
      st.lastUi = ts;
      updWheel($("#rp-wA"), st.A, sA); updWheel($("#rp-wB"), st.B, sB); updGap(sA, sB);
      $("#rp-lap").textContent = `LAP ${Math.min(st.race.maxLap, Math.max(1, sA?.lap.lap || 1))} / ${st.race.maxLap}`;
      const e = Math.max(0, st.T - st.race.T0);
      $("#rp-clock").textContent = `${Math.floor(e / 3600)}:${String(Math.floor((e % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(e % 60)).padStart(2, "0")}`;
      if (document.activeElement !== $("#rp-seek")) $("#rp-seek").value = st.T;
      updCursor(sA?.prog || 0);
      if (ts - (st.lastTower || 0) > 400) { st.lastTower = ts; updTower(); updFlag(); }
    }
    requestAnimationFrame(frame);
  }
  function jump(T) {
    st.T = clamp(T, st.race.T0 - 3, st.race.Tend);
    st.trails = { A: [], B: [] };
    prefetch();
  }
  function syncPlay() { const b = $("#rp-play"); b.textContent = st.playing ? "❚❚" : "▶"; b.setAttribute("aria-label", st.playing ? "一時停止" : "再生"); }

  /* ---------- 操作 ---------- */
  $("#rp-play").addEventListener("click", () => { if (st.T >= st.race?.Tend) jump(st.race.T0 - 3); st.playing = !st.playing; syncPlay(); });
  $("#rp-seek").addEventListener("input", (e) => jump(+e.target.value));
  root.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => {
    st.speed = +b.dataset.s;
    root.querySelectorAll("[data-s]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  }));
  $("#rp-all").addEventListener("change", (e) => (st.showAll = e.target.checked));
  const pick = async (A, B) => {
    const changedA = A !== st.A;
    st.A = A; st.B = B; st.trails = { A: [], B: [] };
    fillSelects(Object.keys(st.race.by).sort((a, b) => (finalPos(a) ?? 99) - (finalPos(b) ?? 99)));
    if (changedA || !st.ref) { if (await buildRef()) { $("#rp-load").hidden = true; resize(); } }
    drawStrategy(); prefetch();
  };
  $("#rp-a").addEventListener("change", (e) => pick(e.target.value, e.target.value === st.B ? st.A : st.B));
  $("#rp-b").addEventListener("change", (e) => pick(e.target.value === st.A ? st.B : st.A, e.target.value));
  $("#rp-team").addEventListener("change", (e) => {
    const t = st.race.teams[e.target.value]; if (!t) return;
    const s = [...t].sort((a, b) => (finalPos(a) ?? 99) - (finalPos(b) ?? 99));
    pick(s[0], s[1]); e.target.value = "";
  });
  $("#rp-ev").addEventListener("change", async (e) => { st.ev = e.target.value; await loadEvent(); drawStrategy(); });
  root.addEventListener("keydown", (e) => {
    if (e.target.matches("select, input[type=range]")) return;
    if (e.code === "Space") { e.preventDefault(); $("#rp-play").click(); }
  });
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas.parentElement);
  let themeT;
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { clearTimeout(themeT); themeT = setTimeout(drawStatic, 50); });

  await loadEvent();
  if (st.race) drawStrategy();
  requestAnimationFrame(frame);
  return { destroy: () => { st.dead = true; ro.disconnect(); } };
}
