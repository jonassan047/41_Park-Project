W=$(cygpath -m /tmp/park-qs)
rm -f /tmp/park-qs/m.sqlite; touch /tmp/park-qs/m.sqlite
export APP_NAME=PARK APP_ENV=local APP_DEBUG=false APP_KEY="base64:$(head -c 32 /dev/urandom | base64)" APP_URL=http://127.0.0.1:8123 APP_LOCALE=ja
export DB_CONNECTION=sqlite DB_DATABASE="$W/m.sqlite" SESSION_DRIVER=file CACHE_STORE=array QUEUE_CONNECTION=sync LOG_CHANNEL=stderr
export MAIL_MAILER=sendmail MAIL_SENDMAIL_PATH="D:/xampp/php/php.exe $W/nomail.php -t" MAIL_FROM_ADDRESS=park@example.com MAIL_FROM_NAME="PARK 運営事務局"
export PARK_IMAP_HOST= PARK_AI_TOKEN= PARK_SKIP_2FA=false
cd /d/xampp/htdocs/park
PHP=/d/xampp/php/php.exe
$PHP artisan migrate --seed --force
$PHP artisan park:skills-sync
exec $PHP artisan serve --host=127.0.0.1 --port=8123
