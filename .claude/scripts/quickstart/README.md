# クイックスタート（pptx）を作り直す道具

使い捨ての SQLite の見本データベースで PARK を起動し、画面を撮って pptx を組む（手元の DB と公開版は触らない。メールは送らずファイルに落とす）。

1. このフォルダの中身を `/tmp/park-qs` にコピーし、そこで `npm i playwright-core pptxgenjs`
2. 別の窓で `bash serve.sh`（http://127.0.0.1:8123）
3. `bash recap.sh`（撮影）→ `node build.js`（`98_Outputs/SES用クイックスタート` に pptx。版を上げるときは build.js と render.ps1 の番号を直す）→ `render.ps1`（PowerPoint で画像にして確かめる）

PHP は `D:/xampp/php`、park は `D:/xampp/htdocs/park` の前提（GENESIS）。

## 4ページ版（2026-11-26-03〜）

画面と画面を矢印でつなぎ、「どこを押すと次の画面が出るか」を見せる形（TEZZO の指示）。

- `login.js`：ログインの画面を撮る（serve.sh が動いている間に。meta.json に足す）
- `build3.js`：shots/ を切り抜いて（cuts/）4ページの pptx を組む。切り抜きの範囲と赤枠は `crops` に書く（'push' は「押す」の札つき）

## 6ページ版（2026-11-27-04〜）

-03 の前に「トップページ」「SES の作業（仕事の流れ）」の2ページを足した（TEZZO の指示）。

- `top.js`：はじめの設定（管理者）を済ませてから、ログインなしでトップ（`/`）と `/start/ses` を撮る（serve.sh が動いている間に。meta.json に足す）
- `build4.js`：6ページの pptx を組む。スクロールの矢印は「同じ画面」、押す矢印は「次の画面」と書き分ける

## 5ページ版（2026-11-27-05〜）

1 表紙（トップのデザイン）／2 PARK システムの流れ／3 はじめての本登録／4 ダッシュボードと上のメニュー／5 エンジニアの登録と本登録（SES）。見出しの左に若芽のアイコンと「対象：全員／SES」の札（TEZZO の指示）。

- `art.js`：park の `public/img`（sprig.jpg・hero.jpg）から、表紙 `cover.png` と若芽だけを切り抜いた `sprout.png` を作る（sprig.jpg・hero.jpg をこのフォルダにコピーしてから）
- `build5.js`：5ページの pptx を組む（`node art.js` のあとに）。`render5.ps1` で画像にして確かめる
