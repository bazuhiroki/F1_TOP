// F1 TOP — Notion と相互連携する F1 ダッシュボード
const SEASON = "2026";
const KEY_STORE = "f1top.key";
const TZ = "Asia/Tokyo";

/* ================= 辞書 ================= */
const TEAM = {
  mercedes: { c: "#27F4D2", jp: "メルセデス" },
  ferrari: { c: "#E8002D", jp: "フェラーリ" },
  mclaren: { c: "#FF8000", jp: "マクラーレン" },
  red_bull: { c: "#3671C6", jp: "レッドブル" },
  rb: { c: "#6692FF", jp: "レーシングブルズ" },
  alpine: { c: "#0093CC", jp: "アルピーヌ" },
  haas: { c: "#DEE1E2", jp: "ハース" },
  audi: { c: "#9EA3A6", jp: "アウディ" },
  williams: { c: "#64C4FF", jp: "ウィリアムズ" },
  aston_martin: { c: "#229971", jp: "アストンマーティン" },
  cadillac: { c: "#C9A15B", jp: "キャデラック" },
};
const DRIVER_JP = {
  antonelli: "アントネッリ", russell: "ラッセル", hamilton: "ハミルトン", norris: "ノリス", leclerc: "ルクレール",
  max_verstappen: "フェルスタッペン", piastri: "ピアストリ", hadjar: "ハジャー", lawson: "ローソン", gasly: "ガスリー",
  arvid_lindblad: "リンドブラッド", colapinto: "コラピント", bearman: "ベアマン", bortoleto: "ボルトレト",
  hulkenberg: "ヒュルケンベルグ", sainz: "サインツ", albon: "アルボン", ocon: "オコン", alonso: "アロンソ",
  tsunoda: "角田裕毅", stroll: "ストロール", bottas: "ボッタス", perez: "ペレス",
};
const GP_JP = {
  "Australian Grand Prix": "オーストラリアGP", "Chinese Grand Prix": "中国GP", "Japanese Grand Prix": "日本GP",
  "Miami Grand Prix": "マイアミGP", "Canadian Grand Prix": "カナダGP", "Monaco Grand Prix": "モナコGP",
  "Barcelona Grand Prix": "バルセロナ・カタルーニャGP", "Austrian Grand Prix": "オーストリアGP",
  "British Grand Prix": "イギリスGP", "Belgian Grand Prix": "ベルギーGP", "Hungarian Grand Prix": "ハンガリーGP",
  "Dutch Grand Prix": "オランダGP", "Italian Grand Prix": "イタリアGP", "Spanish Grand Prix": "スペインGP",
  "Azerbaijan Grand Prix": "アゼルバイジャンGP", "Bahrain Grand Prix in Malaysia": "バーレーンGP in マレーシア",
  "Singapore Grand Prix": "シンガポールGP", "United States Grand Prix": "アメリカGP",
  "Mexico City Grand Prix": "メキシコシティGP", "Brazilian Grand Prix": "サンパウロGP",
  "Las Vegas Grand Prix": "ラスベガスGP", "Qatar Grand Prix": "カタールGP", "Abu Dhabi Grand Prix": "アブダビGP",
};
const SESSIONS = [
  ["FirstPractice", "FP1", 60], ["SecondPractice", "FP2", 60], ["ThirdPractice", "FP3", 60],
  ["SprintQualifying", "SQ", 45], ["Sprint", "スプリント", 45], ["Qualifying", "予選", 60], ["Race", "決勝", 120],
];
const SESSION_LONG = { FP1: "フリー走行1", FP2: "フリー走行2", FP3: "フリー走行3", SQ: "スプリント予選", "スプリント": "スプリント", "予選": "予選", "決勝": "決勝" };

/* ================= 状態 ================= */
const S = { races: [], dStand: [], cStand: [], standRound: null, winners: {}, notion: null, notionErr: null, progression: null, cache: {} };
const $view = document.getElementById("view");
let tickTimer = null;

/* ================= ユーティリティ ================= */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (d, opt) => new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, ...opt }).format(d);
const fDay = (d) => fmt(d, { month: "numeric", day: "numeric", weekday: "short" });
const fTime = (d) => fmt(d, { hour: "2-digit", minute: "2-digit", hour12: false });
const fFull = (d) => `${fDay(d)} ${fTime(d)}`;
const toDate = (o) => (o?.date ? new Date(`${o.date}T${o.time || "12:00:00Z"}`) : null);
const teamOf = (id) => TEAM[id] || { c: "#9CA6B0", jp: id };
const getKey = () => localStorage.getItem(KEY_STORE) || "";

function toast(msg, err = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `show${err ? " err" : ""}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = ""), 2600);
}

async function f1(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const ck = `${path}?${qs}`;
  if (S.cache[ck]) return S.cache[ck];
  const tries = [`/api/f1/${path}?${qs}`, `https://api.jolpi.ca/ergast/f1/${path}/?${qs}`];
  let lastErr;
  for (const url of tries) {
    try {
      const r = await fetch(url);
      if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) throw new Error(r.status);
      const data = (await r.json()).MRData;
      S.cache[ck] = data;
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// 1ページ100件制限を越えて全件取得（同じ Round が2ページにまたがる場合は結合）
async function f1All(path, tableKey, listKey, rowKey) {
  const out = new Map();
  let offset = 0, total = Infinity;
  while (offset < total) {
    const d = await f1(path, { limit: 100, offset });
    total = +d.total;
    for (const race of d[tableKey][listKey]) {
      const prev = out.get(race.round);
      if (prev) prev[rowKey].push(...race[rowKey]); else out.set(race.round, { ...race, [rowKey]: [...race[rowKey]] });
    }
    offset += 100;
    if (!d[tableKey][listKey].length) break;
  }
  return [...out.values()].sort((a, b) => a.round - b.round);
}

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { "content-type": "application/json", "x-app-key": getKey(), ...(opts.headers || {}) } });
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("json")) throw new Error("サーバー関数が見つかりません。Cloudflare Pages で公開しているか確認してください。");
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `エラー ${r.status}`);
  return data;
}

/* ================= データ読み込み ================= */
async function loadCore() {
  const [races, ds, cs, win] = await Promise.all([
    f1(`${SEASON}/races`, { limit: 100 }),
    f1(`${SEASON}/driverstandings`),
    f1(`${SEASON}/constructorstandings`),
    f1(`${SEASON}/results/1`, { limit: 100 }).catch(() => null),
  ]);
  S.races = races.RaceTable.Races.map((r) => ({ ...r, round: +r.round, sessions: sessionsOf(r) }));
  const dl = ds.StandingsTable.StandingsLists[0];
  S.dStand = dl ? dl.DriverStandings : [];
  S.standRound = dl ? +dl.round : 0;
  S.cStand = cs.StandingsTable.StandingsLists[0]?.ConstructorStandings || [];
  if (win) for (const r of win.RaceTable.Races) S.winners[+r.round] = r.Results[0];
}

async function loadNotion() {
  if (!getKey()) { S.notion = null; S.notionErr = null; return; }
  try { S.notion = await api("/api/notion"); S.notionErr = null; }
  catch (e) { S.notion = null; S.notionErr = e.message; }
}

function sessionsOf(r) {
  return SESSIONS.map(([k, label, mins]) => {
    const start = k === "Race" ? toDate(r) : toDate(r[k]);
    return start ? { key: k, label, start, end: new Date(+start + mins * 60000) } : null;
  }).filter(Boolean).sort((a, b) => a.start - b.start);
}

/* ================= Notion ヘルパー ================= */
const nDriver = (id) => S.notion?.drivers.find((d) => d.driverId === id);
const nRace = (round) => S.notion?.races.find((r) => r.key === `${SEASON}-${round}`);
const oshiIds = () => new Set((S.notion?.drivers || []).filter((d) => d.oshi).map((d) => d.driverId));
const jpName = (drv) => nDriver(drv.driverId)?.jpName || (DRIVER_JP[drv.driverId] ? DRIVER_JP[drv.driverId] : `${drv.givenName} ${drv.familyName}`);
const shortJp = (drv) => DRIVER_JP[drv.driverId] || drv.familyName;
function raceName(r) {
  const t = nRace(r.round)?.title;
  if (t) return t.replace(/^R\d+\s*/, "");
  return GP_JP[r.raceName] || r.raceName;
}
const teamIdOf = (st) => st.Constructors[st.Constructors.length - 1]?.constructorId;

async function save(type, pageId, field, value, okMsg) {
  try {
    await api("/api/update", { method: "POST", body: JSON.stringify({ type, pageId, field, value }) });
    toast(okMsg);
    return true;
  } catch (e) { toast(e.message, true); return false; }
}

/* ================= 画面：ホーム ================= */
function currentRace(now = new Date()) {
  return S.races.find((r) => r.sessions.at(-1).end > now) || S.races.at(-1);
}

function viewHome() {
  const race = currentRace();
  const oshi = oshiIds();
  const leader = S.dStand[0];
  const top = S.dStand.slice(0, 10);
  const unread = (S.notion?.news || []).filter((n) => !n.read).slice(0, 5);
  const oshiRows = S.dStand.filter((d) => oshi.has(d.Driver.driverId));
  $view.innerHTML = `
    <div class="home-head"><span class="num">F1 TOP</span><a href="#/settings" class="btn">設定</a></div>
    ${heroHtml(race)}
    ${S.notionErr ? `<p class="empty" style="margin-top:14px">Notionに接続できません：${esc(S.notionErr)}　<a href="#/settings">設定を確認</a></p>` : ""}
    <div class="grid-2">
      <section class="section">
        <h2>ドライバーズ ランキング <a href="#/standings">全員を見る</a></h2>
        <div class="panel">${towerHtml(top, leader, oshi)}</div>
      </section>
      <div>
        <section class="section">
          <h2>タイトル争い</h2>
          <div class="panel">${fightHtml()}</div>
        </section>
        <section class="section">
          <h2>推し <a href="#/drivers">選び直す</a></h2>
          ${oshiRows.length ? `<div class="panel">${towerHtml(oshiRows, leader, oshi)}</div>`
            : `<p class="empty">${S.notion ? `ドライバー画面で推しを選ぶと、ここに順位が出ます。<a href="#/drivers">推しを選ぶ</a>` : `Notionと接続すると推しを登録できます。<a href="#/settings">接続する</a>`}</p>`}
        </section>
      </div>
    </div>
    <section class="section">
      <h2>未読ニュース <a href="#/news">すべて</a></h2>
      ${S.notion ? (unread.length ? newsListHtml(unread) : `<p class="empty">未読ニュースはありません。</p>`)
        : `<p class="empty">NotionのF1ニュース・アーカイブを表示するには接続が必要です。<a href="#/settings">接続する</a></p>`}
    </section>`;
  bindNews();
  startTick(race);
}

function heroHtml(race) {
  if (!race) return `<div class="hero"><p>カレンダーを読み込めませんでした。</p></div>`;
  // 5灯 = 決勝前の4セッション + 決勝
  const pods = race.sessions.slice(-5);
  return `
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-top">
        <div>
          <div class="hero-round">ROUND ${race.round} / ${S.races.length}</div>
          <h1 id="hero-title">${esc(raceName(race))}</h1>
          <div class="circuit">${esc(nRace(race.round)?.circuit || race.Circuit.circuitName)}　${esc(race.Circuit.Location.locality)}</div>
        </div>
        <a class="btn" href="#/race/${race.round}">詳細</a>
      </div>
      <div class="gantry intro" id="gantry" role="list" aria-label="週末のセッション">
        ${pods.map((s, i) => `
          <div class="pod" role="listitem" data-i="${i}" style="--i:${i}">
            <div class="lamp"></div>
            <div class="s-name">${esc(s.label)}</div>
            <div class="s-time">${esc(fmt(s.start, { month: "numeric", day: "numeric" }))}<br>${esc(fTime(s.start))}</div>
          </div>`).join("")}
      </div>
      <div class="countdown" id="countdown" aria-live="off"></div>
    </section>`;
}

function startTick(race) {
  clearInterval(tickTimer);
  if (!race) return;
  const pods = race.sessions.slice(-5);
  const g = document.getElementById("gantry");
  setTimeout(() => g?.classList.remove("intro"), 1600);
  const tick = () => {
    const now = new Date();
    const el = document.getElementById("countdown");
    if (!el || !g) return clearInterval(tickTimer);
    const live = pods.find((s) => s.start <= now && now < s.end);
    const next = pods.find((s) => s.start > now);
    g.querySelectorAll(".pod").forEach((p, i) => {
      const s = pods[i];
      p.classList.toggle("done", s.end <= now);
      p.classList.toggle("live", s === live);
      p.classList.toggle("next", !live && s === next);
    });
    const raceLive = live && live.key === "Race";
    g.classList.toggle("out", !!raceLive);
    if (raceLive) {
      el.innerHTML = `<span class="lights-out">ライツアウト！</span><span class="tag live">決勝 LIVE</span>`;
    } else if (live) {
      el.innerHTML = `<span class="label">${esc(SESSION_LONG[live.label])} 走行中</span><span class="tag live">LIVE</span>`;
    } else if (next) {
      let sec = Math.max(0, Math.floor((next.start - now) / 1000));
      const d = Math.floor(sec / 86400); sec %= 86400;
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
      const pad = (n) => String(n).padStart(2, "0");
      el.innerHTML = `<span class="label">${esc(SESSION_LONG[next.label])}まで</span>
        <span class="clock">${d ? `${d}<small>日</small>` : ""}${pad(h)}<small>:</small>${pad(m)}<small>:</small>${pad(s2)}</span>
        <span class="muted">${esc(fFull(next.start))} 日本時間</span>`;
    } else {
      el.innerHTML = `<span class="label">今週末のセッションは終了しました</span>`;
    }
  };
  tick();
  tickTimer = setInterval(tick, 1000);
}

function towerHtml(rows, leader, oshi) {
  if (!rows.length) return `<p class="muted">まだ順位がありません。</p>`;
  return `<ol class="tower">${rows.map((d) => {
    const t = teamOf(teamIdOf(d));
    const gap = +leader.points - +d.points;
    const cls = [d.position === "1" ? "leader" : "", oshi.has(d.Driver.driverId) ? "oshi" : ""].join(" ");
    return `<li class="${cls}">
      <span class="pos">${esc(d.positionText)}</span>
      <span class="team-bar" style="--team:${t.c}"></span>
      <span class="who"><b>${esc(d.Driver.code || d.Driver.familyName)}</b><span>${esc(jpName(d.Driver))}・${esc(t.jp)}</span></span>
      <span class="pts">${esc(d.points)}</span>
      <span class="gap">${gap ? `−${gap}` : "首位"}</span>
    </li>`;
  }).join("")}</ol>`;
}

function fightHtml() {
  const [a, b] = S.dStand;
  if (!a || !b) return `<p class="muted">データがありません。</p>`;
  const left = S.races.filter((r) => r.round > S.standRound);
  const maxLeft = left.length * 25 + left.filter((r) => r.Sprint).length * 8;
  const gap = +a.points - +b.points;
  const total = +a.points + +b.points || 1;
  let note;
  if (gap > maxLeft) note = `<b>${esc(jpName(a.Driver))}のチャンピオンが確定</b>しています。`;
  else note = `差は<b class="num">${gap}</b>pt。残り${left.length}戦（スプリント${left.filter((r) => r.Sprint).length}回）で最大<b class="num">${maxLeft}</b>ptが残っています。${
    gap > maxLeft - 26 ? "次戦の結果次第で王座が決まる可能性があります。" : "まだ逆転は十分可能です。"}`;
  return `
    <div class="fight-names">
      <div><span class="pts" style="color:var(--purple)">${esc(a.points)}</span>${esc(jpName(a.Driver))}</div>
      <div class="right"><span class="pts">${esc(b.points)}</span>${esc(jpName(b.Driver))}</div>
    </div>
    <div class="gapbar" role="img" aria-label="ポイント比 ${a.points} 対 ${b.points}">
      <i style="width:${(+a.points / total) * 100}%;background:var(--purple)"></i><i style="flex:1;background:#5A6570"></i>
    </div>
    <p class="fight-note">${note}</p>`;
}

/* ================= 画面：カレンダー ================= */
function viewCalendar() {
  const now = new Date();
  const next = currentRace(now);
  $view.innerHTML = `
    <div class="page-title"><h1>${SEASON} カレンダー</h1><span class="muted" style="font-size:14px">時刻はすべて日本時間</span></div>
    <div class="races">${S.races.map((r) => {
      const done = r.sessions.at(-1).end <= now;
      const w = S.winners[r.round];
      const nr = nRace(r.round);
      const raceStart = toDate(r);
      return `<a class="race-row ${done ? "done" : ""} ${r === next ? "next" : ""}" href="#/race/${r.round}">
        <span class="rnd">${r.round}</span>
        <span><span class="ttl">${esc(raceName(r))}</span>
          <span class="sub"><span>決勝 ${esc(fFull(raceStart))}</span>${r.Sprint ? `<span class="tag sprint">スプリント</span>` : ""}${nr?.watched ? `<span class="watched">観た</span>` : ""}</span></span>
        <span class="win">${w ? `<b style="color:${teamOf(w.Constructor.constructorId).c}">${esc(w.Driver.code)}</b><span class="muted">優勝</span>` : r === next ? `<span class="tag" style="color:var(--yellow)">次戦</span>` : ""}</span>
      </a>`;
    }).join("")}</div>`;
}

/* ================= 画面：レース詳細 ================= */
async function viewRace(round) {
  const r = S.races.find((x) => x.round === +round);
  if (!r) { $view.innerHTML = `<p class="empty">第${esc(round)}戦は見つかりません。<a href="#/calendar">カレンダーへ戻る</a></p>`; return; }
  const nr = nRace(r.round);
  const done = r.sessions.at(-1).end <= new Date();
  $view.innerHTML = `
    <p><a href="#/calendar" class="muted" style="text-decoration:none">‹ カレンダー</a></p>
    <div class="page-title"><h1>R${r.round} ${esc(raceName(r))}</h1>${done ? `<a class="btn primary" href="#/replay/${r.round}">リプレイで見る</a>` : ""}</div>
    <p class="muted" style="margin-top:-10px">${esc(r.Circuit.circuitName)}（${esc(r.Circuit.Location.locality)}, ${esc(r.Circuit.Location.country)}）</p>
    <div class="grid-2">
      <section class="section">
        <h2>結果</h2>
        <div class="panel">
          <div class="tabs" role="group" aria-label="セッション">
            <button class="chip" aria-pressed="true" data-res="results">決勝</button>
            <button class="chip" aria-pressed="false" data-res="qualifying">予選</button>
            ${r.Sprint ? `<button class="chip" aria-pressed="false" data-res="sprint">スプリント</button>` : ""}
          </div>
          <div id="res" class="scroll-x"><p class="loading">読み込み中…</p></div>
        </div>
      </section>
      <div>
        <section class="section">
          <h2>スケジュール（日本時間）</h2>
          <div class="panel sessions">${r.sessions.map((s) => `<div><span>${esc(SESSION_LONG[s.label])}</span><span class="num">${esc(fFull(s.start))}</span></div>`).join("")}</div>
        </section>
        <section class="section">
          <h2>観戦メモ</h2>
          ${nr ? `<div class="panel">
              <label for="memo" class="muted" style="font-size:13px">Notionの「観戦メモ」に保存されます</label>
              <textarea id="memo" placeholder="印象に残ったシーン、無線、戦略の感想など">${esc(nr.memo)}</textarea>
              <div class="memo-actions">
                <button class="btn primary" id="save-memo">メモを保存</button>
                <label class="check"><input type="checkbox" id="watched" ${nr.watched ? "checked" : ""}> 観た</label>
              </div>
            </div>`
          : `<p class="empty">${S.notion ? "このレースはNotionのカレンダーにありません。" : `Notionと接続するとメモを書けます。<a href="#/settings">接続する</a>`}</p>`}
        </section>
      </div>
    </div>`;

  const box = document.getElementById("res");
  const load = async (kind) => {
    box.innerHTML = `<p class="loading">読み込み中…</p>`;
    try {
      const d = await f1(`${SEASON}/${r.round}/${kind}`, { limit: 30 });
      const race = d.RaceTable.Races[0];
      const rows = race?.Results || race?.QualifyingResults || race?.SprintResults || [];
      if (!rows.length) { box.innerHTML = `<p class="empty">${done ? "結果はまだ反映されていません。" : "このセッションはまだ行われていません。"}</p>`; return; }
      box.innerHTML = kind === "qualifying" ? qualiTable(rows) : resultTable(rows);
    } catch { box.innerHTML = `<p class="empty">結果を読み込めませんでした。時間をおいて再読み込みしてください。</p>`; }
  };
  document.querySelectorAll("[data-res]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-res]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    load(b.dataset.res);
  }));
  load("results");

  if (nr) {
    document.getElementById("save-memo").addEventListener("click", async () => {
      const v = document.getElementById("memo").value;
      if (await save("race", nr.pageId, "memo", v, "メモを保存しました")) nr.memo = v;
    });
    document.getElementById("watched").addEventListener("change", async (e) => {
      const ok = await save("race", nr.pageId, "watched", e.target.checked, e.target.checked ? "観たにしました" : "観たを外しました");
      if (ok) nr.watched = e.target.checked; else e.target.checked = !e.target.checked;
    });
  }
}

function resultTable(rows) {
  const oshi = oshiIds();
  return `<table class="res"><thead><tr><th>順位</th><th>ドライバー</th><th>タイム/状態</th><th>Pt</th></tr></thead><tbody>
    ${rows.map((x) => {
      const t = teamOf(x.Constructor.constructorId);
      const fl = x.FastestLap?.rank === "1";
      return `<tr class="${fl ? "fl" : ""}"><td class="n">${esc(x.positionText)}</td>
        <td><span style="display:inline-block;width:3px;height:14px;background:${t.c};margin-right:8px;vertical-align:-2px"></span>${esc(jpName(x.Driver))}${oshi.has(x.Driver.driverId) ? ` <span style="color:var(--green);font-size:11px">推し</span>` : ""}</td>
        <td class="t num">${esc(x.Time?.time || x.status)}${fl ? " ⏱" : ""}</td><td class="n">${esc(x.points)}</td></tr>`;
    }).join("")}</tbody></table>`;
}
function qualiTable(rows) {
  return `<table class="res"><thead><tr><th>順位</th><th>ドライバー</th><th>Q1</th><th>Q2</th><th>Q3</th></tr></thead><tbody>
    ${rows.map((x) => `<tr><td class="n">${esc(x.position)}</td>
      <td><span style="display:inline-block;width:3px;height:14px;background:${teamOf(x.Constructor.constructorId).c};margin-right:8px;vertical-align:-2px"></span>${esc(jpName(x.Driver))}</td>
      <td class="num">${esc(x.Q1 || "")}</td><td class="num">${esc(x.Q2 || "")}</td><td class="num">${esc(x.Q3 || "")}</td></tr>`).join("")}
  </tbody></table>`;
}

/* ================= 画面：順位 ================= */
async function viewStandings() {
  const oshi = oshiIds();
  const maxC = +(S.cStand[0]?.points || 1);
  $view.innerHTML = `
    <div class="page-title"><h1>順位</h1><span class="muted" style="font-size:14px">第${S.standRound}戦終了時点</span></div>
    <div class="grid-2">
      <section class="section" style="margin-top:0">
        <h2>ドライバーズ</h2>
        <div class="panel">${towerHtml(S.dStand, S.dStand[0], oshi)}</div>
      </section>
      <div>
        <section class="section" style="margin-top:0">
          <h2>コンストラクターズ</h2>
          <div class="panel bars">${S.cStand.map((c) => {
            const t = teamOf(c.Constructor.constructorId);
            return `<div class="bar-row" style="--team:${t.c}"><span>${esc(t.jp)}</span><span class="track"><span class="fill" style="display:block;width:${(+c.points / maxC) * 100}%"></span></span><span class="v">${esc(c.points)}</span></div>`;
          }).join("")}</div>
        </section>
        <section class="section">
          <h2>ポイント推移</h2>
          <div class="panel" id="prog"><p class="loading">レース結果を集計中…</p></div>
        </section>
      </div>
    </div>`;
  try {
    if (!S.progression) S.progression = await buildProgression();
    const el = document.getElementById("prog");
    if (el) el.innerHTML = progressionSvg(S.progression, oshi);
  } catch {
    const el = document.getElementById("prog");
    if (el) el.innerHTML = `<p class="empty">推移グラフを作れませんでした。再読み込みしてください。</p>`;
  }
}

async function buildProgression() {
  const [res, spr] = await Promise.all([
    f1All(`${SEASON}/results`, "RaceTable", "Races", "Results"),
    f1All(`${SEASON}/sprint`, "RaceTable", "Races", "SprintResults").catch(() => []),
  ]);
  const rounds = res.map((r) => +r.round);
  const pts = {};
  const add = (round, rows) => rows.forEach((x) => {
    const id = x.Driver.driverId;
    pts[id] ??= {};
    pts[id][round] = (pts[id][round] || 0) + +x.points;
  });
  res.forEach((r) => add(+r.round, r.Results));
  spr.forEach((r) => add(+r.round, r.SprintResults));
  const series = {};
  for (const id in pts) {
    let sum = 0;
    series[id] = rounds.map((rd) => (sum += pts[id][rd] || 0));
  }
  return { rounds, series };
}

function progressionSvg({ rounds, series }, oshi) {
  const pick = S.dStand.slice(0, 6).map((d) => d.Driver.driverId);
  oshi.forEach((id) => { if (!pick.includes(id) && series[id]) pick.push(id); });
  const W = 560, H = 260, L = 34, R = 10, T = 10, B = 26;
  const max = Math.max(10, ...pick.map((id) => Math.max(...(series[id] || [0]))));
  const x = (i) => L + (i / Math.max(1, rounds.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, .25, .5, .75, 1].map((f) => Math.round(max * f / 10) * 10);
  const stand = Object.fromEntries(S.dStand.map((d) => [d.Driver.driverId, d]));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="上位ドライバーのポイント推移">
    ${ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join("")}
    ${rounds.map((rd, i) => (i % 2 === 0 || i === rounds.length - 1) ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">R${rd}</text>` : "").join("")}
    ${pick.map((id) => {
      const s = series[id]; if (!s) return "";
      const c = teamOf(teamIdOf(stand[id] || { Constructors: [] })).c;
      const dash = S.dStand.findIndex((d) => d.Driver.driverId === id) % 2 === 1 ? ` stroke-dasharray="6 4"` : "";
      return `<polyline fill="none" stroke="${c}" stroke-width="${oshi.has(id) ? 3.5 : 2.2}"${dash} stroke-linejoin="round" points="${s.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`;
    }).join("")}
  </svg>
  <div class="legend">${pick.map((id) => stand[id] ? `<span style="--team:${teamOf(teamIdOf(stand[id])).c}"><i></i>${esc(shortJp(stand[id].Driver))}</span>` : "").join("")}</div>
  <p class="muted" style="font-size:12px;margin:8px 0 0">同じチームの2人目は点線。推しは太線で表示します。</p>`;
}

/* ================= 画面：ドライバー ================= */
function viewDrivers() {
  const oshi = oshiIds();
  $view.innerHTML = `
    <div class="page-title"><h1>ドライバー</h1></div>
    ${!S.notion ? `<p class="empty" style="margin-bottom:14px">推しの登録にはNotion接続が必要です。<a href="#/settings">接続する</a></p>` : ""}
    <div class="dgrid">${S.dStand.map((d) => {
      const t = teamOf(teamIdOf(d));
      const nd = nDriver(d.Driver.driverId);
      const on = oshi.has(d.Driver.driverId);
      return `<article class="dcard" style="--team:${t.c}">
        <div><div class="nm">${esc(jpName(d.Driver))}</div><div class="tm">${esc(t.jp)}${nd?.role && nd.role !== "レギュラー" ? `・${esc(nd.role)}` : ""}</div></div>
        <div class="no">${esc(d.Driver.permanentNumber || "")}</div>
        <div class="st"><span><span class="num">P${esc(d.positionText)}</span>　<span class="num">${esc(d.points)}</span><span class="muted" style="font-size:12px"> pt</span></span>
          <button class="star" aria-pressed="${on}" data-driver="${esc(d.Driver.driverId)}" ${nd ? "" : "disabled"}>${on ? "推し" : "推しにする"}</button></div>
      </article>`;
    }).join("")}</div>`;
  $view.querySelectorAll(".star").forEach((b) => b.addEventListener("click", async () => {
    const nd = nDriver(b.dataset.driver);
    const next = b.getAttribute("aria-pressed") !== "true";
    b.disabled = true;
    if (await save("driver", nd.pageId, "oshi", next, next ? "推しに登録しました" : "推しから外しました")) {
      nd.oshi = next;
      b.setAttribute("aria-pressed", next);
      b.textContent = next ? "推し" : "推しにする";
    }
    b.disabled = false;
  }));
}

/* ================= 画面：ニュース ================= */
let newsFilter = "unread";
function newsListHtml(items) {
  return `<ul class="news">${items.map((n) => {
    const imp = n.importance?.startsWith("★★★") ? 3 : n.importance?.startsWith("★★") ? 2 : 1;
    return `<li class="${n.read ? "read" : ""}" data-news="${esc(n.pageId)}">
      ${n.link ? `<a class="h" href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>` : `<span class="h">${esc(n.title)}</span>`}
      ${n.summary ? `<p class="sum">${esc(n.summary)}</p>` : ""}
      <div class="meta"><span class="imp-${imp}">${esc(n.importance || "")}</span><span>${esc(n.date || "")}</span>
        ${n.category ? `<span class="tag">${esc(n.category)}</span>` : ""}${(n.related || []).map((r) => `<span class="tag">${esc(r)}</span>`).join("")}
        <button class="chip" data-read="${n.read ? "0" : "1"}" style="margin-left:auto">${n.read ? "未読に戻す" : "既読にする"}</button></div>
    </li>`;
  }).join("")}</ul>`;
}
function bindNews() {
  $view.querySelectorAll("[data-read]").forEach((b) => b.addEventListener("click", async () => {
    const li = b.closest("li");
    const n = S.notion.news.find((x) => x.pageId === li.dataset.news);
    const next = b.dataset.read === "1";
    if (await save("news", n.pageId, "read", next, next ? "既読にしました" : "未読に戻しました")) {
      n.read = next;
      route();
    }
  }));
}
function viewNews() {
  if (!S.notion) {
    $view.innerHTML = `<div class="page-title"><h1>ニュース</h1></div><p class="empty">NotionのF1ニュース・アーカイブを読むには接続が必要です。<a href="#/settings">接続する</a></p>`;
    return;
  }
  const items = S.notion.news.filter((n) => newsFilter === "all" || !n.read);
  $view.innerHTML = `
    <div class="page-title"><h1>ニュース</h1>
      <div class="chips"><button class="chip" data-f="unread" aria-pressed="${newsFilter === "unread"}">未読</button><button class="chip" data-f="all" aria-pressed="${newsFilter === "all"}">すべて</button></div></div>
    ${items.length ? newsListHtml(items) : `<p class="empty">未読ニュースはありません。</p>`}`;
  $view.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { newsFilter = b.dataset.f; viewNews(); }));
  bindNews();
}

/* ================= 画面：用語 ================= */
let glossCat = "すべて", glossQ = "";
function viewGlossary() {
  if (!S.notion) {
    $view.innerHTML = `<div class="page-title"><h1>用語集</h1></div><p class="empty">Notionの用語集を表示するには接続が必要です。<a href="#/settings">接続する</a></p>`;
    return;
  }
  const cats = ["すべて", ...new Set(S.notion.glossary.map((g) => g.cat).filter(Boolean))];
  $view.innerHTML = `
    <div class="page-title"><h1>用語集</h1><span class="muted" style="font-size:14px">${S.notion.glossary.length}語</span></div>
    <input type="search" id="gq" placeholder="用語を検索（例：アンダーカット、VSC）" value="${esc(glossQ)}" aria-label="用語を検索">
    <div class="chips" style="margin-top:12px">${cats.map((c) => `<button class="chip" data-c="${esc(c)}" aria-pressed="${c === glossCat}">${esc(c)}</button>`).join("")}</div>
    <div class="gloss" id="glist"></div>`;
  const draw = () => {
    const q = glossQ.trim().toLowerCase();
    const items = S.notion.glossary.filter((g) => (glossCat === "すべて" || g.cat === glossCat) &&
      (!q || [g.term, g.en, g.desc].join(" ").toLowerCase().includes(q)));
    document.getElementById("glist").innerHTML = items.length ? items.map((g) => `
      <article><h3>${esc(g.term)}</h3><div class="en">${esc(g.en || "")}　<span class="lv-${esc(g.level)}" style="font-family:var(--jp);font-size:12px">${esc(g.level || "")}</span></div>
      <p>${esc(g.desc || "")}</p>${g.tip ? `<p class="tip">${esc(g.tip)}</p>` : ""}</article>`).join("")
      : `<p class="empty">「${esc(glossQ)}」に一致する用語はありません。Notionの用語集に追加できます。</p>`;
  };
  document.getElementById("gq").addEventListener("input", (e) => { glossQ = e.target.value; draw(); });
  $view.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => { glossCat = b.dataset.c; viewGlossary(); }));
  draw();
}

/* ================= 画面：設定 ================= */
function viewSettings() {
  const connected = !!S.notion;
  $view.innerHTML = `
    <div class="page-title"><h1>設定</h1></div>
    <section class="panel form">
      <h2 style="font-size:17px">Notion連携</h2>
      <p class="${connected ? "status-ok" : "status-ng"}">${connected ? "接続中：推し・観戦メモ・観た・ニュース既読がNotionと同期します。" : S.notionErr ? `未接続：${esc(S.notionErr)}` : "未接続：合言葉を入れると接続します。"}</p>
      <label for="key">合言葉（Cloudflareに設定した APP_KEY）</label>
      <input type="password" id="key" value="${esc(getKey())}" autocomplete="off">
      <div class="memo-actions"><button class="btn primary" id="save-key">接続する</button><button class="btn" id="clear-key">この端末から削除</button></div>
      <p class="muted" style="font-size:13px">合言葉はこの端末のブラウザにだけ保存されます。</p>
    </section>
    <section class="section">
      <h2>データについて</h2>
      <p class="muted">順位・結果・カレンダーは <a href="https://github.com/jolpica/jolpica-f1" target="_blank" rel="noopener">Jolpica-F1</a>、推し・メモ・ニュース・用語はNotionのF1 HQから読み込みます。</p>
    </section>`;
  document.getElementById("save-key").addEventListener("click", async () => {
    localStorage.setItem(KEY_STORE, document.getElementById("key").value.trim());
    await loadNotion();
    toast(S.notion ? "Notionに接続しました" : S.notionErr || "接続できませんでした", !S.notion);
    viewSettings();
  });
  document.getElementById("clear-key").addEventListener("click", () => {
    localStorage.removeItem(KEY_STORE);
    S.notion = null; S.notionErr = null;
    toast("合言葉を削除しました");
    viewSettings();
  });
}

/* ================= 画面：リプレイ ================= */
let replayHandle = null;
async function viewReplay(round) {
  const now = new Date();
  const done = S.races.filter((r) => r.sessions.at(-1).end <= now).reverse();
  if (!done.length) { $view.innerHTML = `<p class="empty">まだ終わったレースがありません。</p>`; return; }
  const target = done.find((r) => r.round === +round) || done[0];
  const codeOf = (id) => S.dStand.find((d) => d.Driver.driverId === id)?.Driver.code;
  const oshi = [...oshiIds()].map(codeOf).filter(Boolean);
  const top = S.dStand.slice(0, 2).map((d) => d.Driver.code);
  const [a, b] = [...new Set([...oshi, ...top])];
  $view.innerHTML = `<div class="page-title"><h1>レースリプレイ</h1><span class="muted" style="font-size:14px">2台を選んで走りと計器を比較</span></div><div id="rp-root"><p class="loading">コースとテレメトリを読み込み中…</p></div>`;
  const { mountReplay, RemoteSource } = await import("./replay.js");
  const el = document.getElementById("rp-root");
  if (!el) return;
  replayHandle = await mountReplay(el, {
    source: new RemoteSource(),
    events: done.map((r) => ({ name: r.raceName, label: `R${r.round} ${raceName(r)}` })),
    event: target.raceName, a, b,
  });
}

/* ================= ルーター ================= */
const ROUTES = { replay: viewReplay, home: viewHome, calendar: viewCalendar, race: viewRace, standings: viewStandings, drivers: viewDrivers, news: viewNews, glossary: viewGlossary, settings: viewSettings };
function route() {
  clearInterval(tickTimer);
  replayHandle?.destroy(); replayHandle = null;
  const [name = "home", arg] = location.hash.replace(/^#\/?/, "").split("/");
  const fn = ROUTES[name] || viewHome;
  const active = name === "race" ? "calendar" : (ROUTES[name] ? name : "home");
  document.querySelectorAll(".nav a[data-route]").forEach((a) => {
    if (a.dataset.route === active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  fn(arg);
}

async function boot() {
  $view.innerHTML = `<p class="loading">最新データを読み込み中…</p>`;
  try {
    await Promise.all([loadCore(), loadNotion()]);
  } catch {
    $view.innerHTML = `<p class="empty">F1データを取得できませんでした。通信状況を確認して再読み込みしてください。</p>`;
    return;
  }
  window.addEventListener("hashchange", () => { route(); $view.focus({ preventScroll: true }); window.scrollTo(0, 0); });
  route();
  // タブに戻ってきたら最新化（5分以上経過時）
  let last = Date.now();
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && Date.now() - last > 300000) {
      last = Date.now(); S.cache = {}; S.progression = null;
      await Promise.all([loadCore(), loadNotion()]).catch(() => {});
      route();
    }
  });
}
boot();
