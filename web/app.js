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
};
const flag = (tla) => FLAGS[tla] || "🏳️";

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
    const badge = m.status === "LIVE" ? '<span class="badge live">LIVE</span>'
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
  });
});

/* ---------- 積分榜 ---------- */
async function loadStandings() {
  const el = document.getElementById("standings-grid");
  try {
    const data = await api("/api/standings");
    if (!data.groups?.length) { el.innerHTML = '<p class="muted">積分榜尚未同步</p>'; return; }
    el.innerHTML = data.groups.map((g) => `<div class="card">
      <div class="group-title">${g.group} 組</div>
      <table>
        <tr><th></th><th style="text-align:left">球隊</th><th>賽</th><th>勝</th><th>平</th><th>負</th><th>淨</th><th>分</th></tr>
        ${g.table.map((r) => `<tr class="${r.pos <= 2 ? "qualify" : ""}">
          <td>${r.pos}</td><td class="name">${flag(r.tla)} ${r.name_zh}</td>
          <td>${r.played}</td><td>${r.won}</td><td>${r.draw}</td><td>${r.lost}</td>
          <td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td><b>${r.points}</b></td>
        </tr>`).join("")}
      </table>
    </div>`).join("");
  } catch {
    el.innerHTML = '<p class="muted">⚠️ API 尚未連線</p>';
  }
}

/* ---------- 首頁：最新 AI 推薦 ---------- */
const pct = (x) => `${(x * 100).toFixed(0)}%`;
const selZhFull = (p) => {
  const m = Math.max(p.prob_home, p.prob_draw, p.prob_away);
  if (m === p.prob_home) return { label: `${p.home_zh} 勝`, p: m };
  if (m === p.prob_away) return { label: `${p.away_zh} 勝`, p: m };
  return { label: "和局", p: m };
};

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

    const evRows = oddsRes.tw_ev
      ? oddsRes.tw_ev.map((e) => {
          const lbl = { home: "主勝", draw: "平局", away: "客勝" }[e.selection];
          const cls = e.ev > 0 ? "ev-pos" : "ev-neg";
          return `<tr><td>${lbl}</td><td>${e.twOdds.toFixed(2)}</td>
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

      ${renderIntlOdds(oddsRes.sources)}

      <div class="dt-section">
        <h4>💰 台灣運彩期望值 (EV)</h4>
        ${evRows
          ? `<table class="ev-table"><tr><th>玩法</th><th>運彩賠率</th><th>真實機率</th><th>EV</th></tr>${evRows}</table>
             <p class="muted" style="font-size:.8rem;margin-top:8px">EV 為正代表該玩法在台灣運彩有價值（以 Pinnacle 去水機率為基準）</p>`
          : `<p class="muted">尚未取得台灣運彩 / Pinnacle 賠率對比資料。賠率資料接上後此處顯示各玩法期望值。</p>`}
      </div>

      <div id="report-slot" class="dt-section">
        <h4>📝 AI 白話分析報告</h4>
        <div class="report-md muted">載入中…</div>
      </div>

      <div class="disclaimer">⚠️ 以上分析由 AI 多模型自動生成，僅供娛樂參考，不構成投注建議。未滿 18 歲不得購買運動彩券，請理性投注。</div>`;

    // 非同步載入 AI 白話報告（生成需時，獨立抓取不阻塞詳情顯示）
    loadReport(matchId);
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
      return `<a class="card news-item" href="${n.url}" target="_blank" rel="noopener">
        <span class="news-src">${n.source}</span>${n.tags === "worldcup" ? '<span class="news-tag">世界盃</span>' : ""}
        <div class="news-title">${n.title}</div>
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

async function loadTrack() {
  const el = document.getElementById("track-body");
  try {
    const t = await api("/api/track");
    if (!t.total) {
      el.innerHTML = `<div class="track-empty">
        <h3>戰績累積中</h3>
        <p>系統只記錄「開賽前已預測」的場次，賽後自動對帳。<br>
        待已預測的比賽陸續完賽後，這裡會公開累積命中率與報酬率。</p>
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
      </div>
      ${grades ? `<div class="grade-stats">${grades}</div>` : ""}
      <div class="card">
        <table class="rec-table">
          <tr><th>比賽（實際比分）</th><th>AI 推薦</th><th>賠率</th><th>結果</th><th>損益</th></tr>
          ${rows}
        </table>
      </div>
      <p class="muted" style="font-size:.8rem;margin-top:14px">
        平準注：每場固定下注 1 注，命中得（賠率−1），未中失 1。賠率優先採台灣運彩，無則 Pinnacle，再無則以模型機率估算。僅供參考，不構成投注建議。
      </p>`;
  } catch {
    el.innerHTML = '<p class="muted">⚠️ API 尚未連線</p>';
  }
}

/* ---------- 球隊 ---------- */
let allTeams = [];
function renderTeams(teams) {
  document.getElementById("team-grid").innerHTML = teams.map((t) => `<div class="card team-card">
    <div class="tla">${flag(t.id)} ${t.id}</div>
    <div class="zh">${t.name_zh}</div>
    <div class="muted">${t.name_en}</div>
    <span class="badge">${t.grp ? `${t.grp} 組` : "分組未定"}</span>
  </div>`).join("") || '<p class="muted">沒有符合的球隊</p>';
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

loadHome();
loadMatches();
loadStandings();
loadTeams();
loadAnalysis();
loadTrack();
loadNews();
