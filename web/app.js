/** API 位置：部署後改成你的 Worker 網址（如 https://wc2026-api.<subdomain>.workers.dev） */
const API_BASE = window.WC_API_BASE || "https://wc2026-api.example.workers.dev";

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

loadMatches();
loadStandings();
loadTeams();
