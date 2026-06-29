/** API 位置：部署後改成你的 Worker 網址（如 https://wc2026-api.<subdomain>.workers.dev） */
const API_BASE = window.WC_API_BASE || "https://wc2026-api.sky919247us.workers.dev";

const FLAGS = {
  ARG:"🇦🇷",FRA:"🇫🇷",ENG:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",BEL:"🇧🇪",BRA:"🇧🇷",POR:"🇵🇹",NED:"🇳🇱",ESP:"🇪🇸",
  URU:"🇺🇾",COL:"🇨🇴",GER:"🇩🇪",MAR:"🇲🇦",JPN:"🇯🇵",CRO:"🇭🇷",USA:"🇺🇸",MEX:"🇲🇽",
  SEN:"🇸🇳",DEN:"🇩🇰",SUI:"🇨🇭",AUS:"🇦🇺",IRN:"🇮🇷",KOR:"🇰🇷",ECU:"🇪🇨",CAN:"🇨🇦",
  QAT:"🇶🇦",WAL:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",NZL:"🇳🇿",CZE:"🇨🇿",RSA:"🇿🇦",KSA:"🇸🇦",TUN:"🇹🇳",NGA:"🇳🇬",
  CMR:"🇨🇲",GHA:"🇬🇭",EGY:"🇪🇬",ALG:"🇩🇿",CIV:"🇨🇮",PAN:"🇵🇦",CRC:"🇨🇷",HON:"🇭🇳",
  JAM:"🇯🇲",PAR:"🇵🇾",PER:"🇵🇪",CHI:"🇨🇱",VEN:"🇻🇪",BOL:"🇧🇴",SCO:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",IRL:"🇮🇪",
  NOR:"🇳🇴",SWE:"🇸🇪",POL:"🇵🇱",AUT:"🇦🇹",SRB:"🇷🇸",TUR:"🇹🇷",UKR:"🇺🇦",HUN:"🇭🇺",
  SVK:"🇸🇰",SVN:"🇸🇮",ROU:"🇷🇴",GRE:"🇬🇷",ALB:"🇦🇱",GEO:"🇬🇪",UZB:"🇺🇿",JOR:"🇯🇴",
  IRQ:"🇮🇶",UAE:"🇦🇪",CUW:"🇨🇼",HAI:"🇭🇹",CPV:"🇨🇻",
  URY:"🇺🇾",BIH:"🇧🇦",COD:"🇨🇩",CUR:"🇨🇼",
};
// 子地區（無 ISO 兩碼旗，emoji 會變黑旗）→ 用文字代碼
const TEXTCODE = { ENG: "ENG", SCO: "SCO", WAL: "WAL" };
const flag = (tla) =>
  TEXTCODE[tla] ? `<span class="ncode">${TEXTCODE[tla]}</span>`
  : FLAGS[tla] || `<span class="ncode">${tla || "?"}</span>`;

/* 自選關注（localStorage，無需登入） */
const FAV_KEY = "wc:favs";
const getFavs = () => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch { return []; } };
const isFav = (tla) => getFavs().includes(tla);
function toggleFav(tla) {
  const f = getFavs();
  const i = f.indexOf(tla);
  if (i >= 0) f.splice(i, 1); else f.push(tla);
  localStorage.setItem(FAV_KEY, JSON.stringify(f));
}

async function api(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/* ---------- 分頁切換 ---------- */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

/* ---------- 比分盤 ---------- */
// LIVE 概估進行時間（從開球推算，處理中場休息）。非官方精準分鐘，標「約」。
function liveMinute(kickoffUtc) {
  const raw = Math.floor((Date.now() - new Date(kickoffUtc).getTime()) / 60000);
  if (raw < 0) return "";
  if (raw <= 45) return `約 ${raw}'`;
  if (raw <= 60) return "中場附近";
  const m = Math.min(90, raw - 15);
  return m >= 90 ? "約 90'+" : `約 ${m}'`;
}

const stageZh = (s) =>
  s.startsWith("GROUP_") ? `小組賽 ${s.replace("GROUP_", "")} 組`
  : { LAST_32: "32 強", LAST_16: "16 強", QUARTER_FINALS: "8 強", SEMI_FINALS: "4 強",
      THIRD_PLACE: "季軍戰", FINAL: "決賽" }[s] || s;

function renderMatches(matches) {
  const el = document.getElementById("match-list");
  if (!matches.length) { el.innerHTML = '<p class="muted">沒有符合的比賽</p>'; return; }
  el.innerHTML = matches.map((m) => {
    const t = new Date(m.kickoff_utc);
    const local = t.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", weekday: "short" });
    const mid = m.status === "FINISHED" || m.status === "LIVE"
      ? `<div class="score">${m.home_score ?? "-"} : ${m.away_score ?? "-"}</div>`
      : `<div>VS</div>`;
    const badge = m.status === "LIVE" ? `<span class="badge live">🔴 LIVE ${liveMinute(m.kickoff_utc)}</span>`
      : m.status === "FINISHED" ? '<span class="badge">已完賽</span>'
      : `<span class="badge">${local}</span>`;
    return `<div class="card match">
      <div class="team">${flag(m.home_id)} ${m.home_zh}</div>
      <div class="mid">${stageZh(m.stage)}<br>${mid}${badge}</div>
      <div class="team away">${m.away_zh} ${flag(m.away_id)}</div>
    </div>`;
  }).join("");
}

let allMatches = [];
async function loadMatches() {
  try {
    const data = await api("/api/matches");
    allMatches = data.matches || [];
    renderMatches(allMatches);
  } catch {
    document.getElementById("match-list").innerHTML =
      '<p class="muted">⚠️ API 尚未連線（部署 Worker 並設定 app.js 的 API_BASE 後即可顯示）</p>';
  }
}
document.querySelectorAll(".filter").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const f = btn.dataset.filter;
    if (f === "all") return renderMatches(allMatches);
    if (f === "upcoming") return renderMatches(allMatches.filter((m) => m.status === "SCHEDULED"));
    if (f === "today") {
      const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
      return renderMatches(allMatches.filter((m) =>
        new Date(m.kickoff_utc).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }) === today));
    }
    if (f === "favs") {
      const favs = getFavs();
      const list = allMatches.filter((m) => favs.includes(m.home_id) || favs.includes(m.away_id));
      return renderMatches(list.length ? list : []);
    }
  });
});

/* ---------- 積分榜 ---------- */
// 小組賽 3 場的積分組成對照（積分 = 3×勝 + 1×和）
const PTS_DESC = {
  9: "3戰全勝", 7: "2勝1和", 6: "2勝", 5: "1勝2和",
  4: "1勝1和", 3: "1勝 或 3和", 2: "2和", 1: "1和", 0: "全敗",
};
function renderRankBoard(ranking) {
  const el = document.getElementById("rank-board");
  if (!el || !ranking?.length) { if (el) el.innerHTML = ""; return; }
  // 依積分分群（高→低），同分隊列在一起；晉級白、淘汰淺灰
  const tiers = [];
  for (const r of ranking) {
    let t = tiers[tiers.length - 1];
    if (!t || t.points !== r.points) { t = { points: r.points, teams: [] }; tiers.push(t); }
    t.teams.push(r);
  }
  el.innerHTML = `<div class="card rank-board">
    <div class="group-title">📊 積分排行榜</div>
    <p class="muted rank-legend"><span class="rank-team">晉級</span><span class="rank-team out">淘汰</span></p>
    ${tiers.map((t) => `<div class="rank-tier">
      <span class="rank-pts">
        <span class="rank-pts-n">${t.points} 分</span>
        ${PTS_DESC[t.points] ? `<span class="rank-pts-d">${PTS_DESC[t.points]}</span>` : ""}
      </span>
      <span class="rank-teams">${t.teams.map((r) =>
        `<span class="rank-team ${r.status === "out" ? "out" : ""}" title="${r.group} 組">${flag(r.tla)} ${r.name_zh}</span>`).join("")}</span>
    </div>`).join("")}
  </div>`;
}

async function loadStandings() {
  const el = document.getElementById("standings-grid");
  try {
    const data = await api("/api/standings");
    if (!data.groups?.length) { el.innerHTML = '<p class="muted">積分榜尚未同步</p>'; return; }
    renderRankBoard(data.ranking);
    el.innerHTML = data.groups.map((g) => `<div class="card">
      <div class="group-title">${g.group} 組</div>
      <table>
        <tr><th></th><th style="text-align:left">球隊</th><th>賽</th><th>勝</th><th>平</th><th>負</th><th>進</th><th>失</th><th>淨</th><th>分</th></tr>
        ${g.table.map((r) => `<tr class="${r.pos <= 2 ? "qualify" : ""}">
          <td>${r.pos}</td><td class="name">${flag(r.tla)} ${r.name_zh}</td>
          <td>${r.played}</td><td>${r.won}</td><td>${r.draw}</td><td>${r.lost}</td>
          <td>${r.gf ?? "-"}</td><td>${r.ga ?? "-"}</td>
          <td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td><b>${r.points}</b></td>
        </tr>`).join("")}
      </table>
    </div>`).join("");
  } catch {
    el.innerHTML = '<p class="muted">⚠️ API 尚未連線</p>';
  }
}

/* ---------- 進球王（2026 當屆 / 歷史總榜） ---------- */
let scorersData = null;
function renderScorers(view) {
  const el = document.getElementById("scorers-body");
  const note = document.getElementById("scorers-note");
  if (!scorersData) { el.innerHTML = '<p class="muted">進球王尚未同步</p>'; return; }
  const rows = view === "alltime" ? scorersData.allTime : scorersData.current2026;
  note.textContent = view === "alltime"
    ? "生涯世界盃總進球（歷屆加總，截至2022 + 2026即時）。顯示 6 球以上。"
    : "2026 世界盃當屆進球榜，隨比賽自動更新。";
  if (!rows?.length) { el.innerHTML = '<p class="muted">尚無資料</p>'; return; }
  const isCur = view !== "alltime";
  el.innerHTML = `<div class="card"><table class="scorer-table">
    <tr><th></th><th style="text-align:left">球員</th><th style="text-align:left">國別</th><th>最近</th><th>進球</th></tr>
    ${rows.map((r, i) => `<tr class="${isCur && r.eliminated ? "sc-out" : ""}">
      <td>${i + 1}</td>
      <td class="name"><b>${r.zh || r.en}</b>${r.zh ? ` <span class="muted">${r.en}</span>` : ""}${isCur && r.outLabel ? ` <span class="out-tag">${r.outLabel}</span>` : ""}</td>
      <td>${r.country}</td>
      <td>${r.last}</td>
      <td><b>${r.goals}</b></td>
    </tr>`).join("")}
  </table></div>`;
}
async function loadScorers() {
  try {
    scorersData = await api("/api/scorers");
  } catch {
    document.getElementById("scorers-body").innerHTML = '<p class="muted">⚠️ API 尚未連線</p>';
    return;
  }
  const active = document.querySelector(".sfilter.active")?.dataset.sview || "current";
  renderScorers(active);
}
document.querySelectorAll(".sfilter").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".sfilter").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    renderScorers(b.dataset.sview);
  });
});

/* ---------- 淘汰賽對戰表 ---------- */
const BK_ROUNDS = [
  ["LAST_32", "32 強"], ["LAST_16", "16 強"], ["QUARTER_FINALS", "8 強"],
  ["SEMI_FINALS", "4 強"], ["FINAL", "決賽"],
];
function bkTeam(name, tla, score, win, played) {
  const label = name ? `${flag(tla)} ${name}` : `<span class="muted">待定</span>`;
  return `<div class="bk-team ${win ? "winner" : ""}">
    <span>${label}</span>
    <span class="bk-score">${played && name ? (score ?? "-") : ""}</span>
  </div>`;
}
function bkMatch(m) {
  const played = m.status === "FINISHED" || m.status === "LIVE";
  const fin = m.status === "FINISHED";
  const hWin = fin && m.home_score > m.away_score;
  const aWin = fin && m.away_score > m.home_score;
  return `<div class="bk-match">
    ${bkTeam(m.home_zh, m.home_id, m.home_score, hWin, played)}
    ${bkTeam(m.away_zh, m.away_id, m.away_score, aWin, played)}
  </div>`;
}
async function loadBracket() {
  const el = document.getElementById("bracket-body");
  let matches;
  try {
    matches = (await api("/api/bracket")).matches || [];
  } catch {
    el.innerHTML = '<p class="muted">⚠️ API 尚未連線</p>';
    return;
  }
  const byStage = {};
  for (const m of matches) (byStage[m.stage] ??= []).push(m);
  const cols = BK_ROUNDS.map(([stage, label]) => {
    const list = byStage[stage] || [];
    const body = list.length
      ? list.map(bkMatch).join("")
      : '<div class="bk-match bk-pending">待定</div>';
    return `<div class="bk-round"><h3>${label}</h3>${body}</div>`;
  }).join("");
  const third = (byStage["THIRD_PLACE"] || [])[0];
  const thirdHtml = third
    ? `<div class="card bk-third"><div class="group-title">🥉 季軍戰</div>${bkMatch(third)}</div>`
    : "";
  el.innerHTML = `<div class="bracket">${cols}</div>${thirdHtml}`;
}

/* ---------- 首頁：最新 AI 推薦 ---------- */
const pct = (x) => `${(x * 100).toFixed(0)}%`;
const selZhFull = (p) => {
  const m = Math.max(p.prob_home, p.prob_draw, p.prob_away);
  if (m === p.prob_home) return { label: `${p.home_zh} 勝`, p: m };
  if (m === p.prob_away) return { label: `${p.away_zh} 勝`, p: m };
  return { label: "和局", p: m };
};

async function loadDailySummary() {
  const el = document.getElementById("daily-summary");
  if (!el) return;
  try {
    const d = await api("/api/daily-summary");
    if (d.summary?.content && d.summary.content.length > 20) {
      el.innerHTML = `<div class="card daily-card">
        <div class="daily-title">📰 今日總覽・未來24小時 <span class="muted">${d.summary.date}</span></div>
        <div class="report-md">${mdToHtml(d.summary.content)}</div>
      </div>`;
    }
  } catch {}
}

async function loadHome() {
  const el = document.getElementById("home-picks");
  try {
    const data = await api("/api/top-picks?limit=6");
    const picks = data.picks || [];
    if (!picks.length) { el.innerHTML = '<p class="muted">尚無推薦（預測產生後顯示）</p>'; return; }
    el.innerHTML = picks.map((p, i) => {
      const sel = selZhFull(p);
      const t = new Date(p.kickoff_utc).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", weekday: "short" });
      return `<div class="pick-card" data-mid="${p.match_id}">
        <div class="pick-rank">#${i + 1} 信心 ${p.confidence}</div>
        <div class="pick-teams">${flag(p.home_id)} ${p.home_zh} <span class="muted">vs</span> ${p.away_zh} ${flag(p.away_id)}</div>
        <div class="pick-time">${t}・${p.stage?.startsWith("GROUP_") ? p.stage.replace("GROUP_", "") + " 組" : p.stage}</div>
        <div class="pick-conf">
          <div class="ring" style="--p:${p.confidence}"><span class="num">${p.confidence}</span></div>
          <div class="meta">
            <div>AI 看好：<span class="pick-sel">${sel.label}</span>（${pct(sel.p)}）</div>
            <div class="muted">風險 ${p.risk_grade} 級・爆冷 ${p.upset_index}・xG ${p.xg_home}-${p.xg_away}</div>
          </div>
        </div>
        <div class="pick-report muted" data-report="${p.match_id}">
          ${p.has_report ? "載入 AI 白話分析…" : "完整分析請點開"}
        </div>
      </div>`;
    }).join("");
    el.querySelectorAll(".pick-card").forEach((c) =>
      c.addEventListener("click", () => openDetail(c.dataset.mid)));
    // 補抓有報告者的摘要
    picks.filter((p) => p.has_report).forEach(async (p) => {
      try {
        const r = await api(`/api/report?match_id=${p.match_id}`);
        const slot = el.querySelector(`[data-report="${p.match_id}"]`);
        if (slot && r.report?.content_md) {
          // 取報告純文字前 80 字當摘要
          const plain = r.report.content_md.replace(/[#*`>_]/g, "").replace(/\n+/g, " ").trim();
          slot.textContent = plain.slice(0, 80) + "…";
        }
      } catch {}
    });
  } catch {
    el.innerHTML = '<p class="muted">⚠️ API 尚未連線</p>';
  }
}

/* ---------- AI 分析列表 ---------- */

async function loadAnalysis() {
  const el = document.getElementById("analysis-list");
  try {
    const data = await api("/api/predict");
    const preds = data.predictions || [];
    if (!preds.length) { el.innerHTML = '<p class="muted">尚無預測資料</p>'; return; }
    el.innerHTML = preds.map((p) => `
      <div class="card analysis-card" data-mid="${p.match_id}">
        <div class="ac-head">
          <div class="ac-teams">${p.home_zh} <span class="muted">vs</span> ${p.away_zh}</div>
          <div class="ac-grade grade-${p.risk_grade}">${p.risk_grade}</div>
        </div>
        <div class="wld-bar">
          <div class="h" style="width:${p.prob_home * 100}%"></div>
          <div class="d" style="width:${p.prob_draw * 100}%"></div>
          <div class="a" style="width:${p.prob_away * 100}%"></div>
        </div>
        <div class="wld-legend">
          <span>主勝 ${pct(p.prob_home)}</span>
          <span>平 ${pct(p.prob_draw)}</span>
          <span>客勝 ${pct(p.prob_away)}</span>
        </div>
        <div class="ac-meta">
          <span>🎯 信心 ${p.confidence}</span>
          <span>⚡ 爆冷 ${p.upset_index}</span>
          <span>⚽ xG ${p.xg_home} - ${p.xg_away}</span>
          <span class="muted">點擊看完整分析 →</span>
        </div>
      </div>`).join("");
    el.querySelectorAll(".analysis-card").forEach((c) =>
      c.addEventListener("click", () => openDetail(c.dataset.mid)));
  } catch {
    el.innerHTML = '<p class="muted">⚠️ API 尚未連線</p>';
  }
}

/* ---------- 賽事詳情彈窗 ---------- */
const overlay = document.getElementById("detail-overlay");
document.getElementById("detail-close").addEventListener("click", () => (overlay.hidden = true));
overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.hidden = true; });

const modelRow = (name, m) => `
  <div class="model-row">
    <div class="lbl"><span>${name}</span></div>
    <div class="tri-bar">
      <span class="h" style="width:${m.home * 100}%">${pct(m.home)}</span>
      <span class="d" style="width:${m.draw * 100}%">${pct(m.draw)}</span>
      <span class="a" style="width:${m.away * 100}%">${pct(m.away)}</span>
    </div>
  </div>`;

async function openDetail(matchId) {
  overlay.hidden = false;
  const body = document.getElementById("detail-body");
  body.innerHTML = '<p class="muted">載入中…</p>';
  try {
    const [predRes, oddsRes] = await Promise.all([
      api(`/api/predict?match_id=${matchId}`),
      api(`/api/odds?match_id=${matchId}`).catch(() => ({ tw_ev: null })),
    ]);
    const p = predRes.prediction;
    if (!p) { body.innerHTML = '<p class="muted">查無預測</p>'; return; }
    const d = JSON.parse(p.detail_json);
    const pd = d.poissonDetail;

    const twAt = oddsRes.sources?.tw?.["1x2"]?.home?.at;
    const twTime = twAt ? new Date(twAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
    const evRows = oddsRes.tw_ev
      ? oddsRes.tw_ev.map((e) => {
          const cls = e.ev > 0 ? "ev-pos" : "ev-neg";
          return `<tr><td>${e.label ?? e.selection}</td><td>${e.twOdds.toFixed(2)}</td>
            <td>${pct(e.trueProb)}</td>
            <td class="${cls}">${e.ev > 0 ? "+" : ""}${(e.ev * 100).toFixed(1)}%</td></tr>`;
        }).join("")
      : null;

    body.innerHTML = `
      <div class="dt-title">${p.home_zh ?? ""} vs ${p.away_zh ?? ""}</div>
      <div class="dt-stage">🔮 五模型融合分析</div>

      <div class="dt-top">
        <div class="ring" style="--p:${p.confidence}"><span class="num">${p.confidence}</span></div>
        <div class="dt-cards">
          <div class="dt-stat"><div class="v grade-${p.risk_grade}" style="background:none">${p.risk_grade}</div><div class="l">風險評級</div></div>
          <div class="dt-stat"><div class="v">${p.upset_index}</div><div class="l">爆冷指數</div></div>
          <div class="dt-stat"><div class="v">${pd.over25 ? pct(pd.over25) : "-"}</div><div class="l">大球 2.5</div></div>
          <div class="dt-stat"><div class="v">${pd.btts ? pct(pd.btts) : "-"}</div><div class="l">雙方進球</div></div>
        </div>
      </div>

      <div class="dt-section">
        <h4>📊 各模型預測對比</h4>
        ${modelRow("Elo 實力模型", d.elo)}
        ${modelRow("Poisson 進球模型", d.poisson)}
        ${modelRow("特徵加權模型", d.feature)}
        ${d.market ? modelRow("市場信號 (Pinnacle 去水)", d.market) : ""}
        <div style="border-top:1px solid #ffffff14;margin:10px 0"></div>
        ${modelRow("🎯 融合結果", d.fused)}
      </div>

      <div class="dt-section">
        <h4>⚽ Poisson 最可能比分（xG ${pd.xgHome} - ${pd.xgAway}）</h4>
        <div class="score-grid">
          ${pd.topScores.map((s) => `<div class="score-cell"><div class="s">${s.score}</div><div class="p">${pct(s.prob)}</div></div>`).join("")}
        </div>
      </div>

      ${oddsRes.tw_handicap ? `<div class="dt-section">
        <h4>🅗 台灣運彩讓分盤（模型 EV）</h4>
        <table class="ev-table"><tr><th>玩法</th><th>運彩賠率</th><th>模型機率</th><th>EV</th></tr>
        ${oddsRes.tw_handicap.map((e) => `<tr><td>${e.label}</td><td>${e.twOdds.toFixed(2)}</td><td>${pct(e.trueProb)}</td><td class="${e.ev > 0 ? "ev-pos" : "ev-neg"}">${e.ev > 0 ? "+" : ""}${(e.ev * 100).toFixed(1)}%</td></tr>`).join("")}</table>
        <p class="muted" style="font-size:.8rem;margin-top:6px">讓分 EV 以 Poisson 進球模型機率估算（非市場去水），僅供參考。運彩僅在大比分場次開讓分盤。</p>
      </div>` : ""}
      ${renderIntlOdds(oddsRes.sources)}
      <div id="odds-chart-slot"></div>

      <div class="dt-section">
        <h4>💰 台灣運彩期望值 (EV)</h4>
        ${evRows
          ? `<table class="ev-table"><tr><th>玩法</th><th>運彩賠率</th><th>真實機率</th><th>EV</th></tr>${evRows}</table>
             <p class="muted" style="font-size:.8rem;margin-top:8px">EV 為正代表該玩法在台灣運彩有價值（以 Pinnacle 去水機率為基準）${twTime ? `・運彩賠率資料時間：${twTime}` : ""}</p>`
          : `<p class="muted">尚未取得台灣運彩 / Pinnacle 賠率對比資料。賠率資料接上後此處顯示各玩法期望值。</p>`}
      </div>

      <div id="report-slot" class="dt-section">
        <h4>📝 AI 白話分析報告</h4>
        <div class="report-md muted">載入中…</div>
      </div>

      <div class="disclaimer">⚠️ 以上分析由 AI 多模型自動生成，僅供娛樂參考，不構成投注建議。未滿 18 歲不得購買運動彩券，請理性投注。</div>`;

    // 非同步載入 AI 白話報告 + 賠率走勢圖
    loadReport(matchId);
    loadOddsChart(matchId);
  } catch (e) {
    body.innerHTML = '<p class="muted">⚠️ 載入失敗</p>';
  }
}

// 國際盤賠率顯示（Pinnacle / Bet365 的 1X2，含與前次比較的箭頭）
function renderIntlOdds(sources) {
  if (!sources) return "";
  const srcZh = { pinnacle: "Pinnacle（鋭盤）", bet365: "Bet365" };
  const rows = Object.entries(sources)
    .filter(([s]) => srcZh[s])
    .map(([s, m]) => {
      const x = m["1x2"]; if (!x) return "";
      const cell = (o) => {
        if (!o) return "<td>-</td>";
        const arrow = o.change > 0 ? `<span style="color:var(--win)">▲${o.change}%</span>`
          : o.change < 0 ? `<span style="color:var(--lose)">▼${Math.abs(o.change)}%</span>` : "";
        return `<td>${o.odds.toFixed(2)} ${arrow}</td>`;
      };
      return `<tr><td class="name">${srcZh[s]}</td>${cell(x.home)}${cell(x.draw)}${cell(x.away)}</tr>`;
    }).join("");
  if (!rows) return "";
  return `<div class="dt-section">
    <h4>🌍 國際盤賠率（即時，輔助參考）</h4>
    <table class="ev-table"><tr><th>盤口</th><th>主勝</th><th>和局</th><th>客勝</th></tr>${rows}</table>
    <p class="muted" style="font-size:.8rem;margin-top:6px">箭頭為與前次快照比較的賠率變動。Pinnacle 為公認最準的市場真實機率基準。</p>
  </div>`;
}

// 賠率走勢圖：tw + pinnacle 的主勝賠率隨時間（SVG 折線）
async function loadOddsChart(matchId) {
  const slot = document.getElementById("odds-chart-slot");
  if (!slot) return;
  try {
    const d = await api(`/api/odds-history?match_id=${matchId}`);
    const lines = [];
    const colors = { tw: "var(--gold)", pinnacle: "var(--accent2)" };
    const names = { tw: "台灣運彩", pinnacle: "Pinnacle" };
    let allOdds = [], allT = [];
    for (const src of ["tw", "pinnacle"]) {
      const pts = d.series?.[src]?.home;
      if (pts && pts.length >= 2) {
        lines.push({ src, pts });
        pts.forEach((p) => { allOdds.push(p.odds); allT.push(new Date(p.t).getTime()); });
      }
    }
    if (lines.length === 0) { slot.innerHTML = ""; return; }
    const minO = Math.min(...allOdds), maxO = Math.max(...allOdds), minT = Math.min(...allT), maxT = Math.max(...allT);
    const W = 320, H = 90, pad = 6;
    const x = (t) => pad + (maxT === minT ? 0 : ((new Date(t).getTime() - minT) / (maxT - minT)) * (W - 2 * pad));
    const y = (o) => pad + (maxO === minO ? (H - 2 * pad) / 2 : (1 - (o - minO) / (maxO - minO)) * (H - 2 * pad));
    const paths = lines.map((l) => {
      const dpath = l.pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.odds).toFixed(1)}`).join(" ");
      return `<path d="${dpath}" fill="none" stroke="${colors[l.src]}" stroke-width="2"/>`;
    }).join("");
    const legend = lines.map((l) => `<span style="color:${colors[l.src]}">● ${names[l.src]}</span>`).join("　");
    slot.innerHTML = `<div class="dt-section"><h4>📉 主勝賠率走勢</h4>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;background:var(--panel);border-radius:10px">${paths}</svg>
      <div style="font-size:.8rem;margin-top:4px">${legend}　<span class="muted">高→低＝資金看好主隊</span></div></div>`;
  } catch { slot.innerHTML = ""; }
}

// 極簡 Markdown → HTML（標題/粗體/清單/段落），報告由 LLM 產出 markdown
function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(md)
    .replace(/^###?\s+(.+)$/gm, "<strong>$1</strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^[-*]\s+(.+)$/gm, "• $1")
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

async function loadReport(matchId) {
  const slot = document.querySelector("#report-slot .report-md");
  if (!slot) return;
  try {
    const r = await api(`/api/report?match_id=${matchId}`);
    if (r.report?.content_md) {
      slot.classList.remove("muted");
      slot.innerHTML = mdToHtml(r.report.content_md);
    } else {
      slot.textContent = "本場 AI 白話報告尚未生成（系統每小時自動為近期賽事產生）。";
    }
  } catch {
    slot.textContent = "報告載入失敗。";
  }
}

/* ---------- 冠軍盤 ---------- */
async function loadOutright() {
  const el = document.getElementById("outright-body");
  try {
    const d = await api("/api/outright");
    const board = d.board || [];
    if (!board.length) { el.innerHTML = '<p class="muted">冠軍盤資料尚未同步</p>'; return; }
    const hasTw = board.some((b) => b.twOdds != null);
    const arrow = (c) => c > 0 ? '<span class="rk rk-up">▲</span>' : c < 0 ? '<span class="rk rk-down">▼</span>' : '<span class="rk rk-flat">—</span>';
    const rows = board.map((b, i) => `<tr>
      <td>${i + 1} ${arrow(b.rankChange)}</td>
      <td class="name">${flag(b.team_id)} ${b.name}</td>
      <td><b>${(b.trueProb * 100).toFixed(1)}%</b></td>
      <td>${b.marketOdds?.toFixed(1) ?? "-"}</td>
      ${hasTw ? `<td>${b.twOdds?.toFixed(1) ?? "-"}</td><td class="${b.ev > 0 ? "ev-pos" : b.ev != null ? "ev-neg" : ""}">${b.ev != null ? (b.ev > 0 ? "+" : "") + (b.ev * 100).toFixed(1) + "%" : "-"}</td>` : ""}
    </tr>`).join("");
    el.innerHTML = `<div class="card"><table class="rec-table">
      <tr><th>#</th><th style="text-align:left">球隊</th><th>奪冠機率</th><th>參考盤</th>${hasTw ? "<th>運彩</th><th>EV</th>" : ""}</tr>
      ${rows}</table>
      ${!hasTw ? '<p class="muted" style="font-size:.8rem;margin-top:10px">尚無台灣運彩冠軍賠率（需爬蟲抓取冠軍盤）。目前顯示市場真實奪冠機率排行。</p>' : ""}
    </div>`;
  } catch { el.innerHTML = '<p class="muted">⚠️ API 尚未連線</p>'; }
}

/* ---------- 串關建議 ---------- */
async function loadParlays() {
  const el = document.getElementById("parlays-body");
  try {
    const d = await api("/api/parlays");
    const legs = d.valueLegs || [], parlays = d.parlays || [];
    if (!legs.length) {
      el.innerHTML = `<div class="empty-note">目前沒有偵測到正期望值（+EV）的單注。<br>
        台灣運彩水位較重時這是正常的——有價值的盤口出現時會自動列出。<br>
        <span style="font-size:.85rem">（需先用「手動加抓運彩賠率」更新運彩盤）</span></div>`;
      return;
    }
    const legChips = legs.map((l) => `<span class="value-leg">${l.match}・${l.pick} @${l.odds}<span class="ev">+${l.ev}%</span></span>`).join("");
    const cards = parlays.map((p) => `
      <div class="parlay-card">
        <div class="parlay-head">
          <span class="parlay-type">${p.type}</span>
          <div class="parlay-metrics">
            <span>合併賠率 <b>${p.combinedOdds}</b></span>
            <span>命中率 <b>${p.hitProb}%</b></span>
            <span>EV <b class="ev-pos">+${p.combinedEv}%</b></span>
          </div>
        </div>
        ${p.legs.map((l) => `<div class="parlay-leg"><span>${l.match}</span><span class="pick">${l.pick} @${l.odds}</span></div>`).join("")}
      </div>`).join("");
    el.innerHTML = `
      <h4 style="color:var(--accent2);margin-bottom:10px">💎 偵測到的價值單注（+EV）</h4>
      <div class="value-legs">${legChips}</div>
      <h4 style="color:var(--accent2);margin:18px 0 10px">🎯 推薦串關組合</h4>
      ${cards || '<p class="muted">價值單注不足 2 注，暫無串關組合。</p>'}
      <div class="disclaimer">⚠️ 串關風險隨關數放大，命中率下降。EV 為統計期望值，非保證。僅供參考，未滿18歲不得購買運動彩券，理性投注。</div>`;
  } catch {
    el.innerHTML = '<p class="muted">⚠️ API 尚未連線</p>';
  }
}

/* ---------- 新聞中心 ---------- */
async function loadNews(tag = "worldcup") {
  const el = document.getElementById("news-list");
  el.innerHTML = '<p class="muted">載入中…</p>';
  try {
    const data = await api(`/api/news${tag ? `?tag=${tag}` : ""}`);
    const news = data.news || [];
    if (!news.length) { el.innerHTML = '<p class="muted">尚無新聞（每 30 分鐘自動更新）</p>'; return; }
    el.innerHTML = news.map((n) => {
      const t = n.published_at ? new Date(n.published_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
      const title = n.title_zh || n.title;
      const orig = n.title_zh ? `<div class="news-orig">${n.title}</div>` : "";
      return `<a class="card news-item" href="${n.url}" target="_blank" rel="noopener">
        <span class="news-src">${n.source}</span>${n.tags === "worldcup" ? '<span class="news-tag">世界盃</span>' : ""}
        <div class="news-title">${title}</div>
        ${orig}
        ${n.summary ? `<div class="news-sum">${n.summary}</div>` : ""}
        <div class="news-time">${t}</div>
      </a>`;
    }).join("");
  } catch {
    el.innerHTML = '<p class="muted">⚠️ API 尚未連線</p>';
  }
}
document.querySelectorAll(".nfilter").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".nfilter").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    loadNews(b.dataset.ntag);
  }));

/* ---------- 戰績頁 ---------- */
const selZh = (s) => ({ home: "主勝", draw: "平局", away: "客勝" }[s] || s);

// 正確比數預測戰績（獨立區塊）
function buildScoreBlock(t) {
  const s = t.score;
  if (!s || !s.total) return "";
  const rows = (s.recent || []).map((r) => `<tr>
    <td>${r.home_zh} ${r.actual} ${r.away_zh}</td>
    <td class="muted">${r.predicted}</td>
    <td class="${r.hit ? "tag-hit" : "tag-miss"}">${r.hit ? "✓ 中" : "✗ 未中"}</td>
  </tr>`).join("");
  return `<div class="card" style="margin-bottom:16px">
    <h4 style="color:var(--accent2);margin-bottom:4px">🎯 正確比數預測（Poisson 前 4 比分任一命中）</h4>
    <div style="font-size:1.4rem;font-weight:800;margin:6px 0">命中率 ${s.hitRate}% <span class="muted" style="font-size:.9rem">（${s.hits}/${s.total}）</span></div>
    <table class="rec-table"><tr><th style="text-align:left">比賽（實際比分）</th><th>預測比分</th><th>結果</th></tr>${rows}</table>
    <p class="muted" style="font-size:.8rem;margin-top:8px">正確比數是難度最高的玩法，命中率自然低於勝平負；此為模型比分預測的獨立準確度，與上方投注戰績分開計算。</p>
  </div>`;
}

// 已預測、待開賽區塊（戰績頁共用）
function buildPendingBlock(t) {
  if (!t.pending || !t.pending.length) return "";
  const pick = (p) => { const mx = Math.max(p.prob_home, p.prob_draw, p.prob_away); return mx === p.prob_home ? "home" : mx === p.prob_away ? "away" : "draw"; };
  const rows = t.pending.map((p) => {
    const kt = new Date(p.kickoff_utc).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return `<tr><td>${p.home_zh} vs ${p.away_zh}</td><td>${selZh(pick(p))}</td><td>${p.pick_odds ? p.pick_odds.toFixed(2) : "-"}</td><td class="muted">信心 ${p.confidence}</td><td class="muted">${kt}</td></tr>`;
  }).join("");
  return `<div class="card" style="margin-bottom:16px">
    <h4 style="color:var(--accent2);margin-bottom:10px">📋 已預測・待開賽（${t.pending.length} 場）</h4>
    <table class="rec-table"><tr><th style="text-align:left">比賽</th><th>AI 推薦</th><th>賠率</th><th>信心</th><th>開賽</th></tr>${rows}</table>
    <p class="muted" style="font-size:.8rem;margin-top:8px">這些是 AI 已鎖定的預測；比賽結束後會自動移到上方戰績並結算損益與 CLV。</p>
  </div>`;
}

async function loadTrack() {
  const el = document.getElementById("track-body");
  try {
    const t = await api("/api/track");
    if (!t.total) {
      el.innerHTML = `${buildScoreBlock(t)}${buildPendingBlock(t)}<div class="track-empty">
        <h3>戰績累積中</h3>
        <p>上方為 AI 已預測、尚未開賽的場次。<br>
        比賽結束後會自動結算，於此公開累積命中率、報酬率與 CLV。</p>
      </div>`;
      return;
    }
    const roiCls = t.roi >= 0 ? "pos" : "neg";
    const grades = (t.byGrade || []).map((g) => {
      const rate = g.total ? ((g.hits / g.total) * 100).toFixed(0) : 0;
      return `<div class="grade-stat">
        <div class="big grade-${g.grade}" style="background:none">${g.grade} 級</div>
        <div class="lbl">${g.hits}/${g.total} 命中 · ${rate}%</div>
      </div>`;
    }).join("");
    const rows = (t.recent || []).map((r) => `<tr>
      <td>${r.home_zh} ${r.home_score}-${r.away_score} ${r.away_zh}</td>
      <td>${selZh(r.recommended_market)}</td>
      <td>${r.recommended_odds?.toFixed(2) ?? "-"}</td>
      <td class="${r.hit ? "tag-hit" : "tag-miss"}">${r.hit ? "✓ 中" : "✗ 未中"}</td>
      <td class="${r.profit_units >= 0 ? "tag-hit" : "tag-miss"}">${r.profit_units >= 0 ? "+" : ""}${r.profit_units?.toFixed(2)}</td>
    </tr>`).join("");


    el.innerHTML = `
      <div class="track-hero">
        <div class="track-stat"><div class="big">${t.total}</div><div class="lbl">已對帳場次</div></div>
        <div class="track-stat"><div class="big">${t.hitRate}%</div><div class="lbl">命中率（${t.hits}/${t.total}）</div></div>
        <div class="track-stat"><div class="big ${t.profitUnits >= 0 ? "pos" : "neg"}">${t.profitUnits >= 0 ? "+" : ""}${t.profitUnits}</div><div class="lbl">平準注累積損益</div></div>
        <div class="track-stat"><div class="big ${roiCls}">${t.roi >= 0 ? "+" : ""}${t.roi}%</div><div class="lbl">平均每注報酬 (ROI)</div></div>
        ${t.avgClv != null ? `<div class="track-stat"><div class="big ${t.avgClv >= 0 ? "pos" : "neg"}">${t.avgClv >= 0 ? "+" : ""}${t.avgClv}%</div><div class="lbl">平均 CLV（贏過收盤線 ${t.clvPositiveRate ?? 0}%）</div></div>` : ""}
      </div>
      ${t.avgClv != null ? '<p class="muted" style="font-size:.8rem;margin:-10px 0 18px">CLV（收盤線價值）：推薦時機的賠率相對開賽前收盤賠率。長期為正＝系統性領先市場，是真實 edge 的指標。</p>' : ""}
      ${grades ? `<div class="grade-stats">${grades}</div>` : ""}
      <div class="card">
        <h4 style="color:var(--accent2);margin-bottom:10px">✅ 已結算</h4>
        <table class="rec-table">
          <tr><th style="text-align:left">比賽（實際比分）</th><th>AI 推薦</th><th>賠率</th><th>結果</th><th>損益</th></tr>
          ${rows}
        </table>
      </div>
      ${buildScoreBlock(t)}
      ${buildPendingBlock(t)}
      <p class="muted" style="font-size:.8rem;margin-top:14px">
        平準注：每場固定下注 1 注，命中得（賠率−1），未中失 1。只記錄有真實賠率的場次。僅供參考，不構成投注建議。
      </p>`;
  } catch {
    el.innerHTML = '<p class="muted">⚠️ API 尚未連線</p>';
  }
}

/* ---------- 球員名單 ---------- */
let allPlayers = [];
const playerById = new Map();

function plInitials(p) {
  if (p.zh) return p.zh.slice(-2);
  const parts = (p.name || "").split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
function playerCard(p) {
  const name = p.zh || p.name;
  const en = p.zh ? p.name : "";
  return `<div class="card player-card" data-pid="${p.id}">
    <div class="pl-avatar">${plInitials(p)}</div>
    <div class="pl-body">
      <div class="pl-name">${name}</div>
      ${en ? `<div class="muted pl-en">${en}</div>` : ""}
      <div class="pl-meta">${flag(p.team_id)} ${p.team_zh || p.nationality || ""} · ${p.posZh || "-"} · ${p.age ?? "-"}歲</div>
    </div>
    ${p.goals ? `<span class="pl-goals">${p.goals}⚽</span>` : ""}
  </div>`;
}
function bindPlayerCards(el, onClick) {
  el.querySelectorAll(".player-card").forEach((c) =>
    c.addEventListener("click", () => {
      const p = playerById.get(c.dataset.pid);
      if (p) (onClick || openPlayerDetail)(p);
    }));
}
function renderPlayerGrid(list) {
  const el = document.getElementById("player-grid");
  if (!list.length) { el.innerHTML = '<p class="muted">沒有符合的球員</p>'; return; }
  el.innerHTML = list.map(playerCard).join("");
  bindPlayerCards(el);
}
function openPlayerDetail(p, backFn) {
  overlay.hidden = false;
  const body = document.getElementById("detail-body");
  const stat = (v, l) => `<div class="pl-stat"><div class="big">${v}</div><div class="lbl">${l}</div></div>`;
  body.innerHTML = `
    ${backFn ? '<button class="pl-back" id="pl-back">← 返回名單</button>' : ""}
    <div class="pl-detail-head">
      <div class="pl-avatar lg">${plInitials(p)}</div>
      <div>
        <h2>${p.zh || p.name}</h2>
        ${p.zh ? `<p class="muted">${p.name}</p>` : ""}
        <p class="muted">${flag(p.team_id)} ${p.team_zh || ""} · ${p.posZh || "-"} · ${p.age ?? "-"}歲</p>
      </div>
    </div>
    <div class="pl-stats">
      ${stat(p.posZh || "-", "位置")}
      ${stat(p.age ?? "-", "年齡")}
      ${stat(p.goals || 0, "2026 進球")}
      ${stat(p.dob || "-", "生日")}
      ${stat(p.nationality || "-", "國籍")}
      ${stat(p.team_zh || "-", "所屬隊")}
    </div>
    <p class="muted" style="font-size:.78rem;margin-top:14px">基本資料來自 football-data 免費層（陣容名單）。射門 / 傳球 / 過人等細部數據需付費資料源，暫不提供。</p>`;
  if (backFn) document.getElementById("pl-back").addEventListener("click", backFn);
}
function openTeamSquad(teamId, teamZh) {
  overlay.hidden = false;
  const body = document.getElementById("detail-body");
  const squad = allPlayers.filter((p) => p.team_id === teamId);
  const order = [["GK", "守門員"], ["DF", "後衛"], ["MF", "中場"], ["FW", "前鋒"], ["", "其他"]];
  body.innerHTML = `
    <div class="pl-detail-head">
      <div class="pl-avatar lg">${flag(teamId)}</div>
      <div><h2>${teamZh}</h2><p class="muted">共 ${squad.length} 位球員</p></div>
    </div>
    ${order.map(([c, lbl]) => {
      const list = squad.filter((p) => p.pos4 === c);
      if (!list.length) return "";
      return `<div class="squad-group"><div class="group-title">${lbl}（${list.length}）</div>
        <div class="player-grid sq">${list.map(playerCard).join("")}</div></div>`;
    }).join("")}`;
  bindPlayerCards(body, (p) => openPlayerDetail(p, () => openTeamSquad(teamId, teamZh)));
}
function applyPlayerFilters() {
  const q = document.getElementById("player-search").value.trim().toLowerCase();
  const team = document.getElementById("player-team").value;
  const pos = document.getElementById("player-pos").value;
  let list = allPlayers;
  if (team) list = list.filter((p) => p.team_zh === team);
  if (pos) list = list.filter((p) => p.pos4 === pos);
  if (q) list = list.filter((p) =>
    (p.zh && p.zh.includes(q)) || p.name.toLowerCase().includes(q) || (p.team_zh && p.team_zh.includes(q)));
  document.getElementById("player-count").textContent = `共 ${list.length} 位`;
  renderPlayerGrid(list);
}
async function loadPlayers() {
  try {
    const d = await api("/api/players");
    allPlayers = d.players || [];
  } catch {
    document.getElementById("player-grid").innerHTML = '<p class="muted">⚠️ API 尚未連線</p>';
    return;
  }
  playerById.clear();
  for (const p of allPlayers) playerById.set(String(p.id), p);
  const teams = [...new Set(allPlayers.map((p) => p.team_zh).filter(Boolean))].sort();
  document.getElementById("player-team").innerHTML =
    '<option value="">全部隊伍</option>' + teams.map((t) => `<option value="${t}">${t}</option>`).join("");
  applyPlayerFilters();
}
["player-search", "player-team", "player-pos"].forEach((id) =>
  document.getElementById(id).addEventListener("input", applyPlayerFilters));

/* ---------- 球隊 ---------- */
let allTeams = [];
function renderTeams(teams) {
  const formHtml = (f) => f ? `<div class="form-row">${[...f].map((r) => `<span class="form-dot f-${r}">${r}</span>`).join("")}</div>` : "";
  document.getElementById("team-grid").innerHTML = teams.map((t) => `<div class="card team-card" data-team="${t.id}" data-teamzh="${t.name_zh}">
    <button class="fav-btn ${isFav(t.id) ? "on" : ""}" data-fav="${t.id}">${isFav(t.id) ? "★" : "☆"}</button>
    <div class="tla">${t.id}</div>
    <div class="zh">${t.name_zh}</div>
    <div class="muted">${t.name_en}</div>
    <span class="badge">${t.grp ? `${t.grp} 組` : "分組未定"}</span>
    ${formHtml(t.form)}
  </div>`).join("") || '<p class="muted">沒有符合的球隊</p>';
  document.querySelectorAll("[data-fav]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFav(b.dataset.fav);
      b.classList.toggle("on");
      b.textContent = b.classList.contains("on") ? "★" : "☆";
    }));
  document.querySelectorAll("#team-grid .team-card").forEach((c) =>
    c.addEventListener("click", () => openTeamSquad(c.dataset.team, c.dataset.teamzh)));
}
async function loadTeams() {
  try {
    const data = await api("/api/teams");
    allTeams = data.teams || [];
    renderTeams(allTeams);
  } catch {
    document.getElementById("team-grid").innerHTML = '<p class="muted">⚠️ API 尚未連線</p>';
  }
}
document.getElementById("team-search").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  renderTeams(allTeams.filter((t) =>
    t.name_zh.includes(q) || t.name_en.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)));
});

/* ---------- 健康狀態 ---------- */
api("/api/health").then((h) => {
  if (h.lastSync)
    document.getElementById("last-sync").textContent =
      `資料更新：${new Date(h.lastSync).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`;
}).catch(() => {});

loadDailySummary();
loadHome();
loadMatches();
loadStandings();
loadScorers();
loadBracket();
loadPlayers();
loadTeams();
loadAnalysis();
loadTrack();
loadNews();
loadParlays();
loadOutright();
