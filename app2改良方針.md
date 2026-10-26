# app2 改良方針

## 1. 背景・現状

- app2（英語長文多読リーダー）は `site/app2/index.html` の生成設定（難易度・単語量・世界設定・文体・文の種類・ジャンル・展開・終わり方・プロンプト）を `readForm()` で収集し、`site-app2-backend` の `buildPrompt_()` でLLMプロンプトに組み立てる。
- 現状のジャンル・展開・終わり方は物語文専用の語彙（冒険/恋愛/ハッピーエンド等）であり、文の種類が説明文・エッセイ等でも同じ選択肢が出るため不整合な指示（例：説明文×冒険×ハッピーエンド）がそのままLLMに送られる。
- バックエンドは値を埋め込むだけで汎用のため、選択肢の変更はフロントのみで完結する。

## 2. 決定事項（2026-09-03 確認済み）

1. **ラベルも切り替える**：ジャンル→テーマ/場面/目的/対象、展開→構成/やり取り、終わり方→結び/結末/締め のように文の種類に合わせてラベル文言自体を変える。
2. **世界設定は対象外**：今回はジャンル・展開・終わり方の3項目のみ連動。世界設定・文体・単語量・難易度・自由プロンプト欄は共通のまま。
3. **粒度は提案通り**：各6〜10択程度。低級×抽象テーマの絞り込みは行わず、追加指示欄での調整に任せる。

## 3. 文の種類ごとの選択肢案

### 3.1 物語文（現状維持）

- ジャンル：日常 / 冒険 / 恋愛 / 戦時下 / ミステリー / ホラー / ドラマ
- 展開：淡々とした展開 / 変化のとんだ展開
- 終わり方：淡々とした終わり方 / 驚くような終わり方 / 考えさせられる終わり方 / ハッピーエンド / 悲しい終わり方

### 3.2 説明文

- テーマ：人物紹介 / 文化・習慣 / 自然・生き物 / 科学・宇宙 / 歴史 / 社会・仕事 / 環境 / テクノロジー / スポーツ / 食べ物
- 構成：問い→説明→まとめ / 特徴→例→まとめ / 比較（AとBの違い） / 時系列 / 原因→結果 / 問題→解決策
- 結び：まとめ / 呼びかけ・提案 / 驚きの事実 / 未来への展望

### 3.3 エッセイ

- テーマ：学校生活 / 友情・家族 / 夢・将来 / 趣味 / 環境 / テクノロジー / 社会問題 / 旅行・経験 / 賛否のある話題
- 構成：意見→理由→結論 / 経験→学び→決意 / 賛成→反対→自分の意見 / 問題提起→自分の考え
- 結び：主張の強調 / 決意表明 / 読者への問いかけ / 希望・展望

### 3.4 会話文

- 場面：学校 / 家庭 / お店（買い物・注文） / 旅行・道案内 / 病院 / 電話 / 友達との計画 / 先生への質問
- やり取り：依頼→応答 / 質問→説明 / 相談→助言 / 誘い→交渉→決定 / トラブル→解決
- 結末：合意・決定 / 感謝・別れ / 解決 / 次の約束 / 持ち帰って考える

### 3.5 手紙・メールのやり取り

- 目的：招待 / お礼 / 依頼・お願い / 謝罪 / 報告・近況 / 相談 / 質問 / 励まし
- 構成：挨拶→用件→結び（定型） / 近況→用件→質問 / 依頼→理由→返事のお願い / 往復形式（質問→返事の2通）
- 結び：返事を待つ / 感謝 / 再会を楽しみに / 励まし / 改めて謝罪

### 3.6 広告文

- 対象：商品紹介 / お店・施設案内 / イベント告知 / 募集（部員・ボランティア） / セール・キャンペーン / 旅行ツアー
- 構成：キャッチ→特徴→条件（日時・場所・料金）→呼びかけ / 悩み→解決→呼びかけ / ポイント列挙型
- 締め：ぜひお越しください / 今すぐ申し込みを / お問い合わせください / 数量限定・お早めに

## 4. 実装プラン（2026-09-03 実施済み・ローカル検証のみ）

- 変更対象：`site/app2/index.html` のみ。
- `fTextType` をキーとする設定テーブル（ラベル＋選択肢）を `readForm()` 近傍に定義し、`applyTextType()` で `fGenre/fDevelopment/fEnding` の選択肢と `<label>` 文言を再構築する。切替前の値が新リストにあれば温存、なければ先頭を選択。初期表示時にも実行。
- `buildPrompt_()` を含むバックエンド改修は不要。保存済み履歴（旧値）も結合表示のまま互換維持。
- 検証：ローカル `http.server` で6種切替時のラベル＋選択肢、値温存/フォールバックを確認。生成リクエストの `settings` が新値で送られることをDevToolsで確認。

## 5. 見送り事項

- 世界設定の連動（説明文等でのファンタジー/SF等の扱い）。
- 英検級に応じた選択肢の絞り込み。

## 6. キーワード設定（2026-09-03 決定：積み上げ式）

- 目的：文章に使いたい言葉・概念を任意で指定できるようにする。配置は `fPrompt`（自由プロンプト）の直前。
- 方式：**積み上げ式**（1語1ボックス＋「＋ キーワードを追加」ボタン）。区切り文字の説明を不要にし、低学年にも直感的なモデルとする。選定理由：
  - チップ式はコンパクトだが、日本語IMEのEnter確定とチップ確定が衝突し誤操作のもとになる。
  - シンプル式（自由記入＋自動分割）は実装最小だが、分割の概念が残り低学年には難しい。
- 仕様：
  - 初期は空欄1個、ボタンで最大6個まで追加、各欄に×削除。既存 `.field` スタイルを踏襲しモバイルでもタップしやすくする。
  - 各欄は前後空白除去・空欄無視、全空なら制約なし。1語あたり目安20文字（`maxlength` でガード）。
  - `readForm()` は空でない値を配列 `keywords` として収集。`settingsSummary()` はある場合のみ `キーワードN語あり` を追記。
- プロンプト（`buildPrompt_()` に1行追加）：
  - あり：`【キーワード】猫、school、冒険（上記の言葉・概念を本文中で必ず使うこと。日本語の場合は意味に合う英語で使うこと）`
  - なし：`【キーワード】なし`
- 検証：欄の増減（1→6→上限抑止）、×削除、全空送信、`settings.keywords` の送信、文の種類連動セレクトとの干渉なしを確認。

## 7. AI移行（Ollama Cloud / Gemma4 31B）と対訳表示 — 2026-10-26・app2 `@49` で公開済・実 API smoke 確認済

> 状態: ローカル実装・Node 回帰・モック UI スモークに加え、2026-10-26 に GAS 既存デプロイ **app2 `@47`→`@48`** と Pages を公開（実装 commit `fb8380a82e679ecaa1d61aa745c435e46c585423`）、続けて言語境界修正を **`@49`** で公開（`fc65c08`）。`@48` 時点では実 API 未検証だったが、`@49` 公開後にユーザー承認の実 smoke を実施し、**生成・翻訳・保存再利用まで確認済み**（7.9）。課金額と Ollama 内部呼出回数は未取得、語数の厳密性と時制の揺れは残課題。

### 7.1 生成・審査・翻訳の移行

- 生成（`generatePassage_`）・審査（`checkPassage_`）・新規翻訳（`translateSentences_` / `checkTranslation_`）は Ollama Cloud 公式 API `POST https://ollama.com/api/chat` を使う。
- モデルは `gemma4:31b`（API 名。CLI の `gemma4:cloud` とは別名）。`stream:false` / `think:false`（思考無効）。
- 認証は Script Properties `OLLAMA_API_KEY` のみ。`ZEN_API_KEY` / `OPENCODE_API_KEY` へは**暗黙フォールバックしない**（未設定は `api_key_missing` で AI を呼ばない）。
- Cloud は Structured Outputs 非対応のため `format` / JSON Schema は送らない。JSON はプロンプトで要求し、サーバーで厳格検証する。
- 応答は `message.content` のみ。HTTP 失敗・非 JSON・空・`done:false`・`done_reason=length`・接続例外は保存しない（fail closed）。
- 既存の不変条件（共通トークン＋厳格 ID トークン検証＋`ALLOWED_EMAILS`、`request_id` 台帳、匿名 quota の API 前予約、moderation 明示 OK のみ保存、保存結果不明時 fail closed）は変更しない。

### 7.2 `OLLAMA_API_KEY` の設定（値は書かない）

1. Ollama Cloud の API キーを発行する（ollama.com のアカウント設定 → API keys）。
2. GAS `site-app2-backend` の「プロジェクトの設定 → スクリプト プロパティ」に `OLLAMA_API_KEY` を追加し、発行した値を貼り付ける。
3. 旧 `ZEN_API_KEY` / `OPENCODE_API_KEY` は削除するか空にする（コードは読まない）。
4. 確認: オーナー限定の GET（`action=debugIndexInfo`）で `ollama_key_set:true` のみを確認する。鍵の値は返さないが、応答には index 情報などの内部情報が含まれるため、内容は表示・共有しない。実 API を呼ぶ生成・翻訳は課金と本番 Drive 保存を伴うため、確認はモックテスト（`scripts/tests`）を優先する。
5. キーはコード・docs・ログ・チャットに書かない。

### 7.3 翻訳 API（`action=translateText`）

- POST。`{ token, id_token?, device_id?, record_id, mode: 'get'|'create', request_id? }`。本文・訳文はクライアントから受け取らず、サーバー保有 record と LLM 応答だけを使う。
- 決定的文分割: 省略語（Mr./Dr./e.g. 等）・イニシャル・小数・会話の引用符・句読点・改行を考慮し、`[0, len)` を隙間なく覆う `{id, start, end}`（`s0..`）を作る。連結が原文と一致しなければ保存しない。
- 保存: index とは別の Drive JSON `tadoku-trans-<recordId>.json`。`version` / `recordId` / `sourceHash`（本文 SHA-256）/ `model` / `createdAt` / `lang=ja` / `spans` / `items` を保存。index には訳を入れない（肥大防止）。
- 取得（`mode=get`）: 共通トークンのみ。record が現存し sourceHash が一致する訳だけを返す（本文は `getSavedTexts` で公開済みのため公開範囲を広げない）。未作成は `translation_missing`（`can_create` 付き）。
- 作成（`mode=create`）: 生成と同じ認可。匿名生成が閉じていれば匿名に LLM 実行を許可しない。匿名の試行枠は生成と共通で、API 前に一括予約し以後の失敗も消費する。
- 冪等・並行: `request_id` 台帳に加え、同一 record を Script Properties の予約（`TTRANS_`）で直列化。複数 `request_id` の並行でも LLM 実行・保存は1回だけ。
- 入力検証の順序: 文分割・文数/長さの検証は**台帳・予約・quota・AI より前**に行う。確定失敗（`translation_too_long` 等）は副作用ゼロで返し、匿名枠を消費しない。
- 保存結果不明（`translation_save_uncertain`）: 予約を**永続 unknown**（`u:1`）に固定し、`request_id` が別でも新しい AI を開始しない。TTL や absence だけでは自動解除しない。保存ファイルが確定していれば取得/作成時にそれを返して予約を解放する（LLMなし）。確定できなければ `translation_recovery_required` を返し、管理者の確認を要求する。
- 停止した `in_flight`（5分超）も永続 unknown に固定する（自動再実行しない）。破損した予約も fail closed。
- 検証: 件数・ID（未知/重複/欠落）・空・制御文字・異常長・英語のみ・中国語疑いを拒否。中国語判定は**簡体字特有の文字を含み、かつかなを含まない**場合だけ（日本語の常用漢字 `健康` `保健室` や、漢字だけの `国際連合安全保障理事会` は許可）。既存訳の破損・sourceHash 不一致は**黙って再生成せず** `translation_corrupt`。
- moderation: 翻訳文にも明示 OK を要求（判定不能・失敗・NG は保存しない）。
- 削除連動: `deleteText` は墓標の永続化後に訳ファイルと翻訳予約を片付ける。翻訳保存は同じ script lock 内で record の現存・本文一致を再確認し、削除後の保存を拒否する。


### 7.4 対訳 UI（`site/app2/index.html`）

- 通常表示は従来どおり（段落・自然折返し）。対訳中も英文は offset の **inline span** で描画し、文ごとの改行はしない（原文の空白・段落を保持）。
- 対訳ボタン: 表示/非表示、取得中、作成中、失敗（破損・未作成・権限なし・結果不明）を表示する。
- PC: 左右2ペイン（英文・訳文とも全文、各独立スクロール）。選択は**1ペアだけ**強調し、SVG 曲線を英文右端（内側）→訳文左端（内側）に接続。
- スマホ: 上下2ペイン（各独立スクロール、下は訳全文）。曲線は右側余白を通して必ず表示。両端が見えていないときは線を隠す。
- 英文の単語タップで既存辞書と文選択を同時発火。訳が見切れる場合だけ訳ペインを自動スクロール。
- スクロール・リサイズ・文字サイズ・テーマ変更・フォント読込で線を再計算する。
- 対訳中スマホは辞書を上側（内部スクロール、最大32dvh）。通常時は従来どおり下側。PC は従来位置。
- XSS 防止のため `textContent` のみを使う。レコード切替・遅延応答・モード終了は `seq` と `recordId` で無効化し、選択・線もリセットする。
- 標準/pop/forest の各テーマに `site/themes/pop.css` / `forest.css` で対訳用スタイルを追加。

### 7.5 テスト（ローカル・モック＋公開後の read-only 検証）

- `scripts/tests/security-backends.test.cjs`: AI モックを Ollama 形式（`message.content` / `done`）へ変更。Ollama の HTTP 失敗・非JSON・切断・打ち切り・空・think 400 の再試行、ZEN 非フォールバック、翻訳の取得/作成/再利用/同一ID再送/並行予約/不正出力/中国語疑い/常用漢字の正常系/moderation/保存不明（永続 unknown）/入力検証の実行順/削除連動を追加。
- `scripts/tests/transport.test.cjs`: `translateText` の送信契約（get は request_id 不要、create は必須、record_id のみ送信）と対訳 UI の静的検証を追加。
- 実ブラウザ確認はモック（ローカル `http.server` + `window.test*` フック）で PC 1280x900 / スマホ 390x844 / 3テーマを確認。最終の実機・実 API 回帰は `test` 担当。

#### モックでの UI 確認手順（test 引継ぎ用）

1. リポジトリ直下で `python -m http.server 8123 --bind 127.0.0.1` を起動し、`http://127.0.0.1:8123/site/app2/` を開く（外部リクエストは遮断してよい。probe 失敗でも表示フックは使える）。
2. 表示専用フックでレコードと訳を注入する（本文と spans は一致させる）。
   - `window.testRenderRecord({ id:'tadoku-1700000001000', title:'Fixture', text:'The cat sat. The dog ran.\n\nA bird flew.', settings:{level:'3級'} })`
   - `window.testBilingualShow({ record_id:'tadoku-1700000001000', model:'gemma4:31b', lang:'ja', version:1, created_at:'...', spans:[{id:'s0',start:0,end:13},{id:'s1',start:13,end:27},{id:'s2',start:27,end:39}], items:[{id:'s0',ja:'猫が座った。'},{id:'s1',ja:'犬が走った。'},{id:'s2',ja:'鳥が飛んだ。'}] })`
   - `window.testBilingualSelect('s1', 200)` で1ペア選択＋線を描画。
3. 確認項目: 英文が inline span で文ごとに改行されない／PCは左右2ペイン／390x844 は上下2ペインで線が右余白（`#blLinkPath` の x がビュー幅-8）を通る／選択は2要素だけ／辞書は対訳中スマホで上側（`fixed`・最大32dvh）／モード終了で選択・線が消える／pop・forest で色とフォントが切り替わる。
4. ボタンからの取得・作成フローは Worker/GAS のモック（`translateText` の get→missing→create）を返して確認する。実 API・本番 Drive は使わない。

#### 保存不明（`translation_recovery_required`）の管理者向け復旧

- **TTL・時間経過だけを理由に予約や receipt を消さない**。absence は「保存されていない証拠」ではない。
- まず対象 record の `tadoku-trans-<recordId>.json`（`INDEX_FOLDER_ID` 配下）をオーナー権限で確認する。
  - ファイルが存在し、`recordId` と `sourceHash` が現在の record 本文に一致し、`spans`/`items` が壊れていなければ**そのまま再取得**する（`translateText` の get で返り、予約は自動で解放される。LLM は呼ばれない）。
  - ファイルが無い／壊れている場合は、GAS の実行ログ、Drive の変更履歴、該当 `request_id` の台帳 receipt を確認し、保存が成立していないことを**確認してから**判断する。
- 保存が成立していないと確認でき、オーナーが再実行を承認した場合だけ、対象 record の `TTRANS_` 予約と該当 `request_id` の `IDEM_` receipt を**手動で**削除して1回だけ再試行する。削除対象は対象 record／request に限定し、他の receipt は触らない。
- 判断がつかない場合は**ブロックしたまま**にする（fail closed）。推測で予約を消して再 AI 実行しない。
- 復旧作業でも実メール・APIキー・ファイルID・本文を docs／チャット／ログに記録しない。


### 7.6 残課題

- 実 Ollama Cloud の品質・所要時間: 実 smoke 1 件で生成 6.4s・翻訳 16.8s を確認（7.9）。サンプルは少なく、**語数の厳密性**（100 words 指定 → 83 words）と**時制の揺れ**（一部過去寄り）は残課題。
- 翻訳 moderation の判定粒度: 実 1 件は通過し重大な誤訳なし。サンプル追加は未実施。
- 本番 Drive: 教材1件＋訳1件の作成と再読込での再利用を確認（7.9）。削除の実操作は未実施。
- 料金額・Ollama 内部呼出回数は未取得。
- 本番反映は 2026-10-26 に完了（`@48` は 7.7、`@49` は 7.9）。手順の正本は `AGENTS.md`「デプロイ・公開のルール」。

### 7.7 `@48` 公開結果（2026-10-26・当時点では実 API 疎通は未検証）

> この節は **`@48` 時点の記録**。以下の「未検証（明示）」は当時の状態として維持する。実 API の鍵有効性・生成・翻訳・保存再利用は、後続の `@49` で確認済み（7.9）。

- 対象: `site-app2-backend` の既存デプロイ **app2 のみ** `@47` → `@48`（実装 commit `fb8380a82e679ecaa1d61aa745c435e46c585423`）。`site-pdfdrop` は不変（`@27`）。新規デプロイ作成・アクセス設定変更はしていない。
- version: `updateTime 2026-10-26T11:46:18.133Z`。code `69975b63` / bundle `096b73af` / manifest `923fb7bb` の整合を確認。
- 設定の保持: `deploymentConfig` は `versionNumber` 以外（`scriptId` / `manifestFileName` / `description`）を保持。Deployment側 `entryPoints` 全体（`webApp.entryPointConfig` の `access` / `executeAs` を含む）・入口URL・`access` / `executeAs` は前後で一致し、他デプロイも不変。
- stale snapshot: 作成済み v48 の初回 list が stale だったため安全停止。**再 version 作成も再 PUT もしない**まま、read-only の複数経路（`fields` 違い・`prettyPrint`・no-cache 等）で version 48 / `updateTime` の一致を再照合し、整合確認後に切替。
- 認証: `-A` 相当の専用認証のみ使用。共有認証は変更なし（実パス・鍵・メールは記載しない）。
- CI / Pages: Tests `40317706811` success、Pages `40317706784` success。公開 artifact commit は `fb8380a`。
- 検証: 独立回帰 168件・モックUI 117 pass（オフライン）。公開後は read-only で、`app2` / pop / forest が HTTP 200 かつ commit と byte 単位で SHA 一致、実Chrome PC（1280x900）/ mobile（390x844）× 3テーマで overflow 0・error 0・通常辞書操作成功、無効 token の `getSavedTexts` / `translateText(get)` は `bad_token`、匿名 probe は `noauth`。
- **未検証（明示）**: 実 Ollama Cloud API の呼出（課金）、鍵 `OLLAMA_API_KEY` の実有効性、生成/翻訳の品質・所要時間、本番 Drive への保存・生成・削除の実操作。検証中に本番データの作成・削除はしておらず、出力も残していない。このため「全て本番疎通済み」とは扱わない。
- 以降の確認はユーザー合意を得てから別作業で行い、`仕様書_移行案.md` 8.3 の追加公開記録と整合させる。

### 7.8 実 Gemma smoke 失敗（2026-10-26・当時真因未確定）と修正 → `@49` で公開・再 smoke 成功

> 状態（追記）: 以下 7.8 の本文は**修正前・未公開時点の記録**。この修正は `fc65c08` として `@49` で公開し、実 API の再 smoke は成功した（7.9）。当初の失敗（`moderation_rejected`・保存0・真因未確定）は履歴として残す。

> 当時の状態: ユーザーが実 API で短文1件を試行し、**翻訳キャッシュのテストは承認**。続く実 1 POST（`generateText`）は `moderation_rejected`（理由『教材適合性（日本語含む）』）で**保存0**。**応答本文を取得していないため真因は未確定**。以下は当時のローカル修正のみの記録（当時は GAS への push・デプロイ版更新・Pages 反映・git commit/push を行っていない）。

#### 事実（確認できた範囲）

- 実 API 短文1件（翻訳キャッシュ）は承認済み。
- `generateText` の実 1 POST は `moderation_rejected`。理由文字列は「教材適合性（日本語含む）」相当で、Drive 保存は 0。
- 審査応答の本文・実際の生成タイトル/本文は取得しておらず、**どちらが「日本語混入」と判定されたかは不明**。

#### 推定（未確定・断定しない）

- 生成 system が日本語で「日本語の指示に従い…」と書かれていたため、モデルが指示文や見出しを英語本文へ混ぜた可能性。
- 審査 user が日本語の枠文（「以下は…」「タイトル：」「本文：」）で構成され、system の日本語ルール文も含め**審査対象の範囲が曖昧**だったため、ルール/枠文の日本語を教材本文の混入と誤認した可能性。

#### ローカル修正（2026-10-26・当時未公開 → `@49` で公開）

1. **生成 system を英語へ**（`SYSTEM_PROMPT`）: 英語タイトル1行目・空行・英語本文のみ、日本語文字・注釈・見出し・指示文の書き写し禁止を明示。再生成時の注意（`retryHint`）も英語化。
2. **生成 user 指示に英語のみ出力を明示**（`buildPrompt_`）: `Output language: English only...` を追加。英検級の語彙/文法定義（日本語）は設定として維持。
3. **生成物のローカル言語検査**（`assertEnglishPassage_` / `passageHasCjk_`）: タイトル・本文にかな・漢字（CJK）・ハングルが混入していたら `language_rejected` で**保存しない**。混入箇所の削除による救済はしない。**審査・再生成の API は呼ばない**（現行の試行数・課金を増やさない）。エラー理由は「タイトル/本文の言語」だけで、本文は返さない・ログにも出さない。
4. **審査 user を ASCII 区切りだけに**（`moderationEnvelope_`）: `-----BEGIN/END TITLE-----` / `-----BEGIN/END BODY-----` と値のみ。日本語の枠文・ラベル・級/語数などの設定メタを混ぜない。翻訳 moderation も同じ envelope（BODY＝番号付き訳文）に統一。
5. **審査 system に範囲を明記**（`moderationRulesLines_`）: 「審査対象は TITLE と BODY の値だけ。区切り線・ラベル・審査基準・ルール文・system メッセージは対象外。ルールが日本語でもそれを理由に NG にしてはならない」を追加。
6. `splitTitle_` は**冒頭の "Sure"/"Here" 等を雑に削らない**（本文先頭行＝実質タイトルを失わない）。形式外の出力は言語検査/審査で落とす。

#### 緩めていない不変条件

- 倫理基準・英検級の基準、日本語混入 NG、NG 時の再生成は**最大1回**、明示 OK のみ保存、判定パーサ（`OK` / `NG:理由` 以外は unavailable）、匿名 quota、`request_id` 冪等、保存結果不明の fail closed は変更なし。
- 言語検査は**追加の AI 呼出をしない**（bounded の現行試行数を増やさない）。

#### 追加した回帰（`scripts/tests/security-backends.test.cjs`）

- 生成 system が英語のみで、英語タイトル/本文だけを要求すること（EIKEN 定義は保持）。
- かな・漢字の混入（タイトル/本文）は `language_rejected`・AI 1回のみ・保存0・エラーに本文を出さないこと。
- 英語だけの生成物は保存されること。
- 審査 user が TITLE/BODY の ASCII 区切りだけで、設定メタ・日本語の枠文を含まないこと。
- NG → 再生成 → 再審査失敗（503）が fail closed（保存0・AI 4回）であること。

#### 未確認・未実施（当時の記録）

- 実 Ollama API での再試行（課金）・真因の確定・修正後の品質/所要時間。
- 本番 Drive への保存/削除、GAS HEAD への push、既存デプロイの版更新、Pages 反映、git commit/push。
- したがって本節は「ローカル修正・オフライン回帰のみ」であり、**当時は本番反映済みではなかった**。
- 追記: 上記は 7.9（`@49` 公開＋実 smoke）で実施済み。真因は依然として断定していない（再 smoke が通った事実のみ）。

### 7.9 実 API smoke 結果（2026-10-26・app2 `@49`／公開・確認済み）

**段階の区別**（`AGENTS.md`「セキュリティ修正の記録」に従う）:

| 段階 | 状態 | 補足 |
|---|---|---|
| コード修正 | 完了 | commit `fc65c08`（英語生成指示・ASCII 審査境界・生成物の言語検査） |
| ローカル検証 | 完了 | 独立回帰 174 pass（オフライン。実 API・本番 Drive 不使用） |
| GAS HEAD への push | 完了 | 公開 `@49` の code `81396a6a` / bundle `fc4f1eda` が commit `fc65c08` の source と全整合 |
| 本番 GAS 公開（既存版更新） | 完了（2026-10-26T12:54:30.945Z） | app2 `@48`→`@49`。manifest は `@48` と同一、version 作成は1回のみ。`deploymentConfig` は `versionNumber` 以外を保持 |
| `entryPoints` / 入口URL | 不変 | `entryPoints` 全体（`access` / `executeAs` 含む）・入口URL・`access` / `executeAs` が前後一致。他デプロイも不変 |
| stale snapshot | read-only で復旧 | 作成直後の list が stale → 再 version 作成・再 PUT をせず read-only で再照合。切替 PUT は1回。最終 snapshot も stale だったため fresh な GET/list 8回がすべて最新 v49 を指すことを確認して gate を復旧 |
| 認証 | 専用 auth のみ | 共有認証は変更なし（実パス・鍵・メールは記載しない） |
| CI / Pages | 完了 | Actions の Tests / Pages ともに success（run ID は省略）。公開 artifact commit は `fc65c08` |
| 実 API smoke（ユーザー承認） | 実行・成功 | 生成1件＋訳1件のみ。料金額・内部呼出回数は未取得 |

**smoke の内容**:

- **前段（`@48`）**: 最初の実 1 POST は `moderation_rejected`（日本語含む）で保存0。真因は未確定のまま、英語生成指示・ASCII 審査対象境界・ローカル言語 reject を修正して `@49` とした。
- **生成（`@49`・1 POST）**: 成功（6.4s）。5級・100 words 指定に対し **83 words**、タイトル `A Special Bird`。個人情報なし、内容は安全で自然（魔法の鳥の話）。
- **翻訳**: 初回 get は `translation_missing` → create 1 回で成功（16.8s、**18 文**、`s0..` の ID 対応、中国語混入なし、重大な誤訳なし。時制が一部過去寄り）。
- **再読込（PC 1280x900 / mobile 390x844）**: get のみ（`replayed:true`）で**完全一致**、2.9〜3.6s、追加 create 0 ＝ 保存済み訳の再利用を確認。
- **UI**: 辞書・対訳の線・文選択の連動で overflow 0。画面外の線は非表示。
- **本番データ**: 作成した教材1件と訳1件のみ。訳の残存を削除していない。他の既存教材に変更なし。

**残課題**: 語数の厳密性（100 words 指定 → 83 words）、時制の揺れ、料金額・Ollama 内部呼出回数の取得。真因（当初の `moderation_rejected`）は未確定のまま。
