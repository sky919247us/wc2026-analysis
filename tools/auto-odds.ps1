# 自動加抓運彩賠率（無視窗、不暫停）— 供 Windows 工作排程器背景執行
# 與手動版差別：HEADLESS=1（不開視窗）、跑完即結束（不等待按鍵）
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$admin = (Get-Content (Join-Path $root "workers\.dev.vars") | Select-String 'ADMIN_KEY=(.+)').Matches[0].Groups[1].Value.Trim()
$env:WC_ADMIN_KEY = $admin
$env:WC_API_BASE  = "https://wc2026-api.sky919247us.workers.dev"
$env:HEADLESS     = "1"   # 無視窗背景執行
node (Join-Path $root "scraper\scrape.mjs")
