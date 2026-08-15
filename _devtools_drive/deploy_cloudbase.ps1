#requires -Version 5.1
<#
  Xiaomiao Restaurant - Cloud Mode Deploy (command-line CloudBase route)
  Usage: right-click this file -> "Run with PowerShell"; or in its folder,
         Shift+right-click "Open PowerShell here" then run: .\deploy_cloudbase.ps1
  Note: messages are in English (ASCII) to avoid GBK/UTF-8 encoding issues
        on Chinese Windows when cmd invokes PowerShell.
#>
$ErrorActionPreference = 'Stop'
$ProjectRoot = 'C:\Users\Administrator\WorkBuddy\2026-08-07-10-09-09'
$AuthFnDir   = Join-Path $ProjectRoot 'weapp\cloudfunctions\auth'
$EnvIdFile   = Join-Path $ProjectRoot '_devtools_drive\envid.txt'

function Pause($msg) {
  if ($msg) { Write-Host $msg -ForegroundColor Yellow }
  Read-Host 'Press Enter to continue' | Out-Null
}

Clear-Host
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '   Xiaomiao Restaurant - Cloud Mode Deploy' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

# ---------- 0. Check node / npm ----------
Write-Host '[0] Checking Node.js / npm ...' -ForegroundColor Green
$node = Get-Command node -ErrorAction SilentlyContinue
$npm  = Get-Command npm  -ErrorAction SilentlyContinue
if (-not $node) {
  $cands = @(
    'C:\Program Files (x86)\Tencent\微信web开发者工具\node\node.exe',
    'C:\Program Files\Tencent\微信web开发者工具\node\node.exe'
  )
  foreach ($c in $cands) { if (Test-Path $c) { $node = Get-Item $c; break } }
}
if (-not $node) {
  Write-Host '  Node.js not found. Opening download page:' -ForegroundColor Red
  Start-Process 'https://nodejs.org/en/download/'
  Pause '  Install Node.js (LTS), then re-run this script.'
  exit 1
}
$npmPath = if ($npm) { 'npm' } else { (Split-Path $node.Path) + '\npm.cmd' }
Write-Host ('  node: ' + $node.Path) -ForegroundColor White

# ---------- 1. Install CloudBase CLI (China mirror) ----------
Write-Host '[1] Installing CloudBase CLI (@cloudbase/cli, via China mirror)...' -ForegroundColor Green
& $npmPath config set registry https://registry.npmmirror.com 2>&1 | Out-Null
$cli = Get-Command cloudbase -ErrorAction SilentlyContinue
if (-not $cli) {
  & $npmPath install -g @cloudbase/cli 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host '  CLI install failed. Check network/permissions and retry.' -ForegroundColor Red; Pause ''; exit 1 }
  $env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
}
Write-Host '  CLI ready.' -ForegroundColor White

# ---------- 2. Login (browser QR) ----------
Write-Host '[2] Logging into Tencent Cloud (browser QR with WeChat)...' -ForegroundColor Green
cloudbase login 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host '  Login failed. Retry.' -ForegroundColor Red; Pause ''; exit 1 }
Write-Host '  Login OK.' -ForegroundColor White

# ---------- 3. Determine env ID (list existing / create new) ----------
Write-Host '[3] Looking up cloud environments...' -ForegroundColor Green
cloudbase env list 2>&1 | Tee-Object -Variable envOut | Out-Null
Write-Host $envOut -ForegroundColor White
$envId = ''
$existing = @()
$existing += $envOut | Select-String -Pattern 'envId[:\s]+(\S+)' | ForEach-Object { $_.Matches[0].Groups[1].Value }
$existing += $envOut | Select-String -Pattern '\b[a-z0-9-]{8,}\b' | ForEach-Object { $_.Matches[0].Value }
$existing = $existing | Where-Object { $_ } | Select-Object -Unique
if ($existing.Count -gt 0) {
  Write-Host ('  Existing environments: ' + ($existing -join ', ')) -ForegroundColor White
  $envId = Read-Host '  Enter env ID to use (copy one above, then Enter)'
}
if (-not $envId) {
  Write-Host '  No environment found. Opening console to create one:' -ForegroundColor Yellow
  Start-Process 'https://console.cloud.tencent.com/tcb'
  Write-Host '  a. Click "New" -> name it xiaomiao -> Pay-as-you-go (has free tier) -> Create' -ForegroundColor White
  Write-Host '  b. After creation, copy the "Environment ID" (e.g. xiaomiao-7gabc123)' -ForegroundColor White
  $envId = Read-Host '  Paste the env ID here'
}
$envId = $envId.Trim()
if (-not $envId) { Write-Host '  Empty env ID. Aborting.' -ForegroundColor Red; Pause ''; exit 1 }
Write-Host ('  Using env ID: ' + $envId) -ForegroundColor Green

# ---------- 4. Deploy auth cloud function ----------
Write-Host '[4] Deploying auth cloud function (account system)...' -ForegroundColor Green
Set-Location $AuthFnDir
cloudbase fn deploy auth -e $envId 2>&1 | Tee-Object -Variable fnOut | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host '  Function deploy failed:' -ForegroundColor Red; Write-Host $fnOut; Pause ''; exit 1 }
Write-Host '  auth function deployed.' -ForegroundColor Green

# ---------- 5. Save env ID (for assistant to fill into website) ----------
Set-Content -Path $EnvIdFile -Value $envId -Encoding utf8
Write-Host ('  Env ID saved to ' + $EnvIdFile) -ForegroundColor White

# ---------- 6. Open console settings (anonymous login + Web whitelist) ----------
Write-Host '[5] Opening console security settings - please enable two items:' -ForegroundColor Yellow
Start-Process ('https://console.cloud.tencent.com/tcb/env/setting?envId=' + $envId)
Write-Host '  a. Login methods -> enable Anonymous login -> Save' -ForegroundColor White
Write-Host '  b. Security domains / Web security domains -> add https://dusk-collab.github.io -> Save' -ForegroundColor White
Pause ''

# ---------- Done ----------
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  Deploy complete! Send the env ID below to your assistant:' -ForegroundColor Green
Write-Host ('  ' + $envId) -ForegroundColor White
Write-Host '  I will fill it into the website. Then open admin.html and' -ForegroundColor White
Write-Host '  register once in cloud mode. After that, any device works.' -ForegroundColor White
Write-Host '============================================' -ForegroundColor Cyan