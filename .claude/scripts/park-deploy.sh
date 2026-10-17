#!/usr/bin/env bash
# park の最新（GitHub の main）を公開版（www.jona.jp/park）に反映する。
# tezzo の常時の了承（2026-10-17「毎回反映して」）の範囲：コードの更新・DB の列やテーブルの追加（migrate）・キャッシュの作り直しだけ。
# .env の書き換え、データの削除（migrate:fresh など）、メールの一斉送信は、ここではしない（それは毎回 tezzo の了承を取る）。
set -euo pipefail
ssh -o BatchMode=yes -o ConnectTimeout=15 -p 10022 jonassan@jonassan.xsrv.jp 'set -e; cd ~/park
git pull -q --ff-only
/opt/php-8.3/bin/php /usr/bin/composer install --no-dev --optimize-autoloader -q
/opt/php-8.3/bin/php artisan migrate --force
/opt/php-8.3/bin/php artisan config:cache -q
/opt/php-8.3/bin/php artisan view:cache -q
git log --oneline -1'
for p in "" login manual; do curl -s -o /dev/null -w "/$p %{http_code}\n" "https://www.jona.jp/park/$p"; done
