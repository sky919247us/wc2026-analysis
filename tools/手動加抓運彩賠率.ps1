# 手動加抓「台灣運彩」賠率 — 雙擊或在 PowerShell 執行
# 用 Playwright 開真實瀏覽器通過 Cloudflare、直達足球 coupon、抓世界盃賠率灌進網站。
# 需在你的電腦執行（Cloudflare 擋伺服器 IP；且需 headful 過質詢）。會跳出瀏覽器視窗，跑完自動關。
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$admin = (Get-Content (Join-Path $root "workers\.dev.vars") | Select-String 'ADMIN_KEY=(.+)').Matches[0].Groups[1].Value.Trim()
$env:WC_ADMIN_KEY = $admin
$env:WC_API_BASE  = "https://wc2026-api.sky919247us.workers.dev"
$env:HEADLESS     = "0"   # 必須開真實視窗才能通過 Cloudflare 質詢

Write-Host "正在抓取台灣運彩賠率（瀏覽器視窗會自動操作，請勿關閉）..." -ForegroundColor Cyan
node (Join-Path $root "scraper\scrape.mjs")
Write-Host "`n完成。按任意鍵關閉..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
