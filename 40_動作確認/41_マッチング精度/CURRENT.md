# 現状（41_マッチング精度）

最終更新: 2026-11-12（[2026-11-12-01-案件メールの抽出精度.md](2026-11-12-01-案件メールの抽出精度.md)）

PARK のマッチング精度を上げるための調査の記録。調査用のサイトは PARK と別に立ち上げ、PARK が完成したら消す（2026-11-12 ビジョンで TEZZO さんと決めた）。メール本文・正解表は公開リポジトリに置かず、GENESIS のローカル `C:\Users\rock\Documents\park-lab\` に置く。

## 今の結論

- 案件メール 13 件で、必須・尚可が取れたのは今の PARK で 24%・35%。`<<必須>>` 形式の見出しを読めないのが原因。見出しの読み方を広げた調査案では 100%。
- 取れた要件の6割は、技術・役割・工程の言葉に当たらない（業界・業務経験・ソフトスキル・条件）。SES の手入力が要るのはここ。

## 未決事項

- SES の入力のさじ加減（今の案：決まらない行だけ一覧に出し、「候補から選ぶ／文章のまま残す」の2択。選んだ結果は次から自動）。
- 「業務経験」のマスタを作るか。
- 調査サイトの置き場所・名前。

## 測定のやり方（GENESIS）

- `C:\Users\rock\Documents\park-lab\`：`mails/01〜13.txt`（案件の本文）、`lab.php`（今の CaseParser と調査案を比べる。正解の行数は中の `$GOLD`）、`result-01.txt`（2026-11-12 の結果）。
- GENESIS の park には `.env` が無いので、環境変数を付けて動かす（Git Bash）：

```
cd /d/xampp/htdocs/park && APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= DB_CONNECTION=mysql DB_HOST=127.0.0.1 DB_DATABASE=jonassan_park DB_USERNAME=root DB_PASSWORD= /d/xampp/php/php.exe C:/Users/rock/Documents/park-lab/lab.php
```

- メールは Gmail のラベル「03-阿部さん」から Gmail の道具（get_message）で読み、案件の部分だけを `mails/` に保存した。

## 次にやること

- 件数を増やし、「どれにも当たらない」行に正解の分類を付けて、業界・業務経験の辞書でどこまで自動になるかを測る。
