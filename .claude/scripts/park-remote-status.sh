#!/usr/bin/env bash
# 公開版（www.jona.jp/parks）の状態を見るだけ（書き換えはしない）。PARK の点検用。
# 出すのは数と日時だけ（個人情報は出さない。park の park:status）。
set -euo pipefail
ssh -o BatchMode=yes -o ConnectTimeout=15 -p 10022 jonassan@jonassan.xsrv.jp \
  'cd ~/parks && git log --oneline -1 && /opt/php-8.3/bin/php artisan park:status'
