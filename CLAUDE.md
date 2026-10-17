# CLAUDE.md

Park プロジェクト（Ministry of Business、41）。**SES を GP としてグループ化し、案件を EG に割り振るシステムを提供して、成功報酬を得る**事業の検討・計画の場所。2026-10-14 に `40_Business-Planning` の会話から独立した。

「Park」は、EG が気楽に参加できる場、というイメージの仮の名前（略語ではない。変えてよい）。

**PARK は固有名詞。意図した場合を除き、PARKS と複数形にしない**（2026-10-17 tezzo）。英語の名詞は複数形にする命名規則（`04_Manuals` など）の対象外。ファイル名・コード・文章・エージェント名・スクリプト名のどこでも `PARK`／`park` の単数を使う。

## 担当（2026-10-17）

このプロジェクトのジョーは、Ministry of Business の大臣 **Leo**（レオ）。Leo と名乗る。話し方は 00_General-Guidelines の `01_Rules/JOEのパーソナリティ.md`（「官房長官と大臣」「話し方」）。全体は官房長官の JOE が統括するので、決まったこと・返事待ちは `92_FromJoe/CURRENT.md` に書いて JOE に届くようにする。

## 構想（2026-10-14 時点）

- 商流：大手企業 → SH（一次受けソフトハウス）→ SES（小さな協力会社。複数）→ EG（エンジニア）。tezzo は、SES の1つ「Mrsy」（オーナー：阿部さん）の下の EG として長く働いてきた。
- 提案先は **SES**（経営者）。SES 同士は連携して仕事を回し合っているが、EG は孤独で、技術・知識の蓄積もない。tezzo にはそのリベンジの気持ちと、EG を助け、育てたい想いがある。
- GP＝複数の SES をグループ化したもの。GP に入った案件を、全 EG から適した人に割り振る。こちらは、案件のインプットの仕分けと応募、見栄えのいいスキルシートの作成、面談の質疑応答集を提供する。
- 収益：案件に記載の金額（SES が SH から受け取る金額）に対し、成約時に初期費用 7%、その後は月額 3%（案件の契約が続く間。契約は3か月で、延長は SH の判断）。払うのは SES。
- **最優先は、エンジニアの成約率を上げること**（2026-10-14 tezzo）。中核（成約まで）とオプション（成約のあと、育てる方向）に分け、阿部さんに何を渡すかは tezzo が決める。詳しくは `31_企画書の検討/2026-10-14-03-成約率を最優先にする.md`。企画書（PowerPoint）の制作は保留中。
- **PARK アプリは htdocs の `park`**（PHP の Laravel 12 ＋ MySQL、DB は `jonassan_park`、http://localhost/park/、GitHub は jonassan047/park で公開）。公開版は https://www.jona.jp/park/（Xserver、2026-10-16〜。更新の手順は park の README）。2026-10-15 に Node.js の試作（`81_PARKアプリ`）から移した。アプリの作業は htdocs の `park` で Claude Code を起動して行う。htdocs のプロジェクトには `92_FromJoe` を置かないので、アプリの引き継ぎはこのプロジェクトの `92_FromJoe` と Desktop の `92_FromJoe` に書く。使い方は park の `README.md`、動作確認は `php artisan test`。
- **80 帯（`80_企画書`・`81_契約書類`）は成果物（pptx・docx など）の今の版だけを置く**。古い版と、版ごとの違い・未決事項などの過程の md は、30 帯（`31_企画書の検討`・`32_契約書類の検討`）に書く（2026-10-16 tezzo）。
- **サービスの名前は PARK（単数）**（2026-10-17 tezzo「park は単数。parks に変えたものは全部 park に戻す」）。画面・メール・md は PARK と書く。GitHub のリポジトリ（jonassan047/park）・htdocs のフォルダ（park）・URL（/park）・このプロジェクトのフォルダ（41_Park-Project）も単数。DB の名前（jonassan_park）は変えていない。なお、固定の枠のフォルダ名（04_Manuals など）は複数形（`命名規則.md`）。
- 運営・SES・エンジニア向けの操作手順書（ログイン・設定・メールの処理）は、park の `resources/manuals/*-steps.md`（アプリの「使い方」から読める）。写しは `04_Manuals` の `運営`・`SES`・`エンジニア` フォルダの `操作手順書.md`。
- tezzo 向けの運用手順書は `04_Manuals/運用手順.md`（2026-10-17。正本はここ）。点検・反映・AI・了承の決まりを変えたら、これも直す。
- PARK アプリのマニュアルと README は、WIZ から読めるよう `04_Manuals` に写しを置く（運営・SES・エンジニア向けは、それぞれ同名のフォルダの下の `マニュアル.md`。正本は park。park のマニュアル・README を直したら、写し直す。2026-10-16 tezzo）。
- **PARK のサブエージェント**は `.claude/agents`（2026-10-16〜17 tezzo の指示。ひな形は `90_Preferences/44_Agent-Template/.claude/agents`）。PARK の仕事は、このチームに任せる。
  - アプリを直すとき：park-planner（仕様と計画を park の `PLAN.md` に書く）→ park-implementer（実装）→ park-reviewer（読む専用でレビュー）→ park-tester（`php artisan test`）の順。指摘・不具合は implementer が直し、reviewer・tester をもう一度通す。commit・push と公開版への反映（下の常時了承の範囲）は JOE が行う。
  - 点検と記録：park-manager（Git・テスト・`park:status`・公開版・手元の AI・マニュアルの写し・返事待ち）。結果は `40_動作確認` に書く。
  - **公開版への反映は常時了承済み**（2026-10-17 tezzo「毎回反映して」）：park の変更を push したら、`bash .claude/scripts/park-deploy.sh` で公開版に反映する（コードの更新・migrate・キャッシュだけ）。`.env` の書き換え・データの削除・メールの一斉送信は、これまでどおり毎回 tezzo の了承を取る。
  - **朝の点検**：FOCUS の起動時（その日の最初の1回）に、スタートアップの「PARK 朝の点検」が `.claude/scripts/park-morning-check.ps1` を動かし、park-manager が点検して push する（2026-10-17 tezzo）。公開版の状態は `.claude/scripts/park-remote-status.sh` で見るだけ（tezzo が了承済み。`.claude/settings.json` で許可）。記録は FOCUS の `~/.park-ai/morning-check.log`。
- 何をやったかの記録（作業履歴）は `90_Histories/History.md`（新しいものを上に足す。作業の区切りで追記する）。
- 全体の概要は `00_Policies/概要.md`。詳しい整理は `30_検討/CURRENT.md`、決めること・次にやることは `92_FromJoe/CURRENT.md`。用語は `06_Glossaries/用語集.md`。

## Claudeへの指示

- 事業計画書の最初の読み手は阿部さん。**一般 SES の観点**と**阿部さんの観点**の2つで書く。数字は保守的なものを基本にし、「甘い目算」は阿部さんに見せない。
- **阿部さん・SES・EG・SH の個人的な事情（被害・収入・契約の内情など）は、tezzo が明示しない限りファイルに書かない。** **このリポジトリは GitHub で公開**（2026-10-14 tezzo が決定。誰でも読める）。そのため、ファイルに書く内容は公開されても困らないものにとどめ、書く前に確認する。
- SH には当面知られないように進める。SH の名前・案件の内容を、外部のサービス（ChatGPT など）に渡さない。補佐役の ChatGPT には、ひな形など形骸化した部分だけを任せる。
- **EG・SH はこのプロジェクトのローカルルール（略称）。** 阿部さんなど外に見せる資料では使わず、元の意味（EG＝エンジニア、SH＝ソフトハウス）で書く（2026-10-14 tezzo）。SES は、2026-10-14 に BP（ビジネスパートナー）から呼び名を変えたもの（`06_Glossaries/用語集.md`）。GP（グループ）は、初めて出すところで意味を添える。企画書の色は薄めの青系。
- tezzo は、システム運営者に徹したい（収入が得られるなら EG としても入る）。運営と EG の二役になるので、公平性のルールと誓約書が必要（`30_検討` で検討する）。
- 全プロジェクト共通の約束（個人情報の扱い、承認、少数で試す、完了報告など）は 00_General-Guidelines の `01_Rules/作業の進め方.md`。
- 話し合いは WIZ の入力欄で足りる。CLI（黒い画面）は、ファイルを何度も書き換える長い作業のときだけ、理由を添えて確認してから提案する（tezzo は CLI が苦手）。
