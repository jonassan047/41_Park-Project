@echo off
rem PARK を起動して、ブラウザで開く（止めるときは、この黒い画面を閉じる）
cd /d "%~dp0"
start "" http://localhost:4100/
node --no-warnings server.js
pause
