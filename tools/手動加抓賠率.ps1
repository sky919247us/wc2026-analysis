# 臨場手動加抓賠率 — 雙擊或在 PowerShell 執行即可
# 從 OddsPapi（你的電腦住宅IP）抓 Pinnacle/Bet365 賠率，灌進網站，零 Odds API 點數消耗。
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$devvars = Join-Path $root "workers\.dev.vars"

# 從 workers\.dev.vars 讀金鑰（已 gitignore，不會外洩）
$admin = (Get-Content $devvars | Select-String 'ADMIN_KEY=(.+)').Matches[0].Groups[1].Value.Trim()
$papi  = (Get-Content $devvars | Select-String 'ODDSPAPI_KEY=(.+)').Matches[0].Groups[1].Value.Trim()

$env:WC_ADMIN_KEY = $admin
$env:ODDSPAPI_KEY  = $papi
$env:WC_API_BASE   = "https://wc2026-api.sky919247us.workers.dev"

Write-Host "正在臨場加抓賠率..." -ForegroundColor Cyan
node (Join-Path $PSScriptRoot "manual-odds.mjs")
Write-Host "`n按任意鍵關閉..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
