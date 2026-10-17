#!/usr/bin/env bash
# 公開版（www.jona.jp/park）で、1人の確認コード（2要素認証）の記録を見るだけ（書き換えはしない）。
# 出すのは日時・状態・理由だけ（コード・メールの件名や本文は出さない。park の park:twofactor）。
# 使い方：bash .claude/scripts/park-remote-twofactor.sh <メールアドレス>
# 結果を公開リポジトリ（40_動作確認 など）に書くときは、メールアドレスを書かない。
set -euo pipefail
email="${1:-}"
if ! [[ "$email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  echo "メールアドレスの形ではありません。" >&2; exit 2
fi
ssh -o BatchMode=yes -o ConnectTimeout=15 -p 10022 jonassan@jonassan.xsrv.jp \
  "cd ~/park && /opt/php-8.3/bin/php artisan park:twofactor '$email'"
