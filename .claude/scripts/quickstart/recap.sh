export APP_ENV=local APP_KEY="base64:$(head -c 32 /dev/urandom | base64)" DB_CONNECTION=sqlite DB_DATABASE="$(cygpath -m /tmp/park-qs)/m.sqlite" CACHE_STORE=array LOG_CHANNEL=stderr
(cd /d/xampp/htdocs/park && /d/xampp/php/php.exe artisan migrate:fresh --seed --force >/dev/null)
cd /tmp/park-qs && rm -rf shots && node cap.js 2>&1 | grep -v -i warning
