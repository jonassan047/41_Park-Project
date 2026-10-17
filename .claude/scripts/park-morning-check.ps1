# PARK の朝の点検（2026-10-17 tezzo の指示）。
# FOCUS の起動（ログオン）のときにスタートアップから動き、その日の最初の1回だけ、
# park-manager に点検をさせて、結果を 40_動作確認 に書いて push させる。
# 記録：~/.park-ai/morning-check.log ／ その日に済んだ印：~/.park-ai/morning-check-last.txt
# 試すとき：powershell -ExecutionPolicy Bypass -File park-morning-check.ps1 -DryRun

param([switch]$DryRun, [switch]$Force)

$home2 = Join-Path $env:USERPROFILE '.park-ai'
New-Item -ItemType Directory -Force $home2 | Out-Null
$log = Join-Path $home2 'morning-check.log'
$last = Join-Path $home2 'morning-check-last.txt'
$today = Get-Date -Format 'yyyy-MM-dd'
function Log($m) { Add-Content -Path $log -Value ("[" + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "] " + $m) -Encoding UTF8 }

if (-not $Force -and (Test-Path $last) -and ((Get-Content $last -Raw).Trim() -eq $today)) { Log '今日はもう点検した。何もしない'; exit 0 }

$project = 'D:\Users\rock\Workspace\41_Parks-Project'
$claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
$prompt = @"
PARK の朝の点検をしてください（$today、FOCUS の起動時に自動で実行）。
あなたの定義の「点検」の1〜7を順に確かめてください。公開版の状態は bash .claude/scripts/park-remote-status.sh で見るだけにし（tezzo が了承済み）、公開版を書き換えないでください。
結果は 40_動作確認 に $today-NN-点検.md（NN はその日の次の番号）として書き、40_動作確認/CURRENT.md の「今の結論」に1行で足してください（命名規則.md の「3. ログと CURRENT.md」に従う）。
問題があったら、92_FromJoe/CURRENT.md の「次にやること」にも1行で足してください。返事待ちは足さないでください。
書いたら 41_Parks-Project を commit・push してください（コミットの最後に Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>）。park のコードは変えないでください。
"@

if ($DryRun) { Write-Output "（試し）$claude -p ... --agent park-manager --permission-mode auto（場所：$project）"; Write-Output $prompt; exit 0 }

# 起動の直後はネットワークがまだのことがあるので、少し待つ
Start-Sleep -Seconds 120
Log '点検を始める'
Push-Location $project
try {
    $out = & $claude -p $prompt --agent park-manager --permission-mode auto 2>&1 | Out-String
    Log ("終わった：" + ($out.Trim() -split "`n" | Select-Object -Last 3) -join ' / ')
    Set-Content -Path $last -Value $today -Encoding UTF8
} catch {
    Log ("失敗：" + $_.Exception.Message)
} finally {
    Pop-Location
}
