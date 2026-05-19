# 启动 QQ 机器人（需已配置 .env 与人设 profile）
Set-Location $PSScriptRoot
if (-not (Test-Path ".env")) {
  Write-Host "请先复制 .env.example 为 .env 并填写 CURSOR_API_KEY、BOT_QQ_ID 等" -ForegroundColor Yellow
  exit 1
}
npm run start
