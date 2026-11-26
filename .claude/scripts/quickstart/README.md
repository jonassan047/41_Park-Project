# クイックスタート（pptx）を作り直す道具

使い捨ての SQLite の見本データベースで PARK を起動し、画面を撮って pptx を組む（手元の DB と公開版は触らない。メールは送らずファイルに落とす）。

1. このフォルダの中身を `/tmp/park-qs` にコピーし、そこで `npm i playwright-core pptxgenjs`
2. 別の窓で `bash serve.sh`（http://127.0.0.1:8123）
3. `bash recap.sh`（撮影）→ `node build.js`（98_Outputs に pptx）→ `render.ps1`（PowerPoint で画像にして確かめる）

PHP は `D:/xampp/php`、park は `D:/xampp/htdocs/park` の前提（GENESIS）。
