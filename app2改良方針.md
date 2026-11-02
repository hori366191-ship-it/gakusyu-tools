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

## 7. AI移行（Ollama Cloud / Gemma4 31B）と対訳表示 — 2026-10-26・app2 `@50` で公開済・実 API smoke 確認済（`@49`）

> 状態: ローカル実装・Node 回帰・モック UI スモークに加え、2026-10-26 に GAS 既存デプロイ **app2 `@47`→`@48`** と Pages を公開（実装 commit `fb8380a82e679ecaa1d61aa745c435e46c585423`）、続けて言語境界修正を **`@49`** で公開（`fc65c08`）。`@48` 時点では実 API 未検証だったが、`@49` 公開後にユーザー承認の実 smoke を実施し、**生成・翻訳・保存再利用まで確認済み**（7.9）。課金額と Ollama 内部呼出回数は未取得、語数の厳密性と時制の揺れは残課題。その後 2026-10-26 に対訳 UI と翻訳バックエンド（記号保持）の改善を実装し、commit `878ae1d` として app2 `@50` と Pages で公開した（7.10）。実 AI による記号混在翻訳の追加課金検証と本番 Drive 書込みは未実施。

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
- 保存: index とは別の Drive JSON `tadoku-trans-<recordId>.json`。`version` / `recordId` / `sourceHash`（本文 SHA-256）/ `model` / `createdAt` / `lang=ja` / `symbols` / `spans` / `items` を保存。index には訳を入れない（肥大防止）。`symbols:'verbatim'` は「記号だけスパンの原文保持に対応した版で生成した訳」の目印で、含有フラグではない（旧 cache には無い）。
- 記号だけのスパン: Unicode の `P`（句読点）/`S`（記号）/`Z`（空白）/`Cf`（soft hyphen・ZWSP・bidi 制御等）と絵文字・異体字セレクタ・囲み文字など、**文字や数字を含まない**スパンは翻訳 AI に渡さず、原文を trim したまま `ja` に置く（ID・offset の連続性は維持）。数字・数式・化学式・日本語を含むスパンは従来どおり翻訳対象。property escape が使えない環境では同等の範囲表へフォールバックし、表に無い文字は翻訳対象に倒す（安全側）。
- 通常文の応答照合は従来どおり厳格（件数・ID 完全一致。欠落・重複・未知 ID は失敗）。記号スパンを除いた対象だけを ID そのままで AI に渡し、戻り値を元の並びへ合成する。プロンプトにも「リストに無い ID・記号だけの行は出力しない」を明示。
- moderation は AI 翻訳の有無にかかわらず**合成後の全訳**（原文保持分を含む）を対象に1回実行し、明示 OK のみ保存する。全スパンが記号だけでも審査は実行し、匿名の試行枠は翻訳 AI を呼ばない場合も含めて API 前に消費する（費用保護）。判定不能・NG・失敗は保存しない。
- 取得（`mode=get`）: 共通トークンのみ。record が現存し sourceHash が一致する訳だけを返す（本文は `getSavedTexts` で公開済みのため公開範囲を広げない）。未作成は `translation_missing`（`can_create` 付き）。
- 作成（`mode=create`）: 生成と同じ認可。匿名生成が閉じていれば匿名に LLM 実行を許可しない。匿名の試行枠は生成と共通で、API 前に一括予約し以後の失敗も消費する。
- 冪等・並行: `request_id` 台帳に加え、同一 record を Script Properties の予約（`TTRANS_`）で直列化。複数 `request_id` の並行でも LLM 実行・保存は1回だけ。
- 入力検証の順序: 文分割・文数/長さの検証は**台帳・予約・quota・AI より前**に行う。確定失敗（`translation_too_long` 等）は副作用ゼロで返し、匿名枠を消費しない。
- 保存結果不明（`translation_save_uncertain`）: 予約を**永続 unknown**（`u:1`）に固定し、`request_id` が別でも新しい AI を開始しない。TTL や absence だけでは自動解除しない。保存ファイルが確定していれば取得/作成時にそれを返して予約を解放する（LLMなし）。確定できなければ `translation_recovery_required` を返し、管理者の確認を要求する。
- 停止した `in_flight`（5分超）も永続 unknown に固定する（自動再実行しない）。破損した予約も fail closed。
- 検証: 件数・ID（未知/重複/欠落）・空・制御文字・異常長・英語のみ・中国語疑いを拒否。中国語判定は**簡体字特有の文字を含み、かつかなを含まない**場合だけ（日本語の常用漢字 `健康` `保健室` や、漢字だけの `国際連合安全保障理事会` は許可）。既存訳の破損・sourceHash 不一致は**黙って再生成せず** `translation_corrupt`。
- 記号スパンの検証と cache 互換: 新形式（`symbols:'verbatim'`）だけ、記号だけスパンの `ja` が原文 trim と**完全一致**することを要求する。旧 cache は `symbols` が無いため記号スパンの訳文を許容し、**新旧 cache の削除・再生成は不要**（`TRANS_VERSION` も不変）。通常の英文スパンに記号だけの応答が返った場合は訳の欠落として拒否（`translation_invalid`）。数字・数式・化学式・日本語であることを必須にはせず、従来の ASCII のみ・制御文字・中国語疑い等の検査を維持する。
- moderation: 翻訳文にも明示 OK を要求（判定不能・失敗・NG は保存しない）。
- 削除連動: `deleteText` は墓標の永続化後に訳ファイルと翻訳予約を片付ける。翻訳保存は同じ script lock 内で record の現存・本文一致を再確認し、削除後の保存を拒否する。


### 7.4 対訳 UI（`site/app2/index.html`）

> 2026-10-26 の変更は app2 `@50` と Pages で公開済み（7.10）。`@49` までは変更前の挙動だった。
> **2026-10-27 の縦長リンクの変更（文末へ接続）は Pages で公開済み**（commit `08110ba`。7.11）。修正当時はローカルのみで未公開で、公開済み `@50` の縦長は pane の右余白固定だった（その後の Pages 反映で文末接続へ変わり、GAS は `@50` のまま）。
> **2026-10-30 の全幅左右統一（7.13）は commit `139bb59` で Pages 公開済み**（公開後の read-only 検証まで完了）。以降は PC/横長・スマホ/縦長とも左右2ペインで、向きはサイドバー（設定⇄本文）の制御だけに使う。GAS は `@50` のまま不変（schema/API/旧訳再利用は変わらない）。

- 通常表示は従来どおり（段落・自然折返し）。対訳中も英文は offset の **inline span** で描画し、原文を改変せず文ごとの改行もしない。訳文も inline span（ID 維持）で、文間は連結し、原文スライスの先頭/末尾空白ランにある改行を**LFへ正規化して数だけ保持**する（CRLF は改行1つ、空行はその数だけ。原文先頭も同様、同段落内の文間スペースは入れない）。
- 対訳ボタン: 表示/非表示、取得中、作成中、失敗（破損・未作成・権限なし・結果不明）を表示する。
- 全幅（PC/横長・スマホ/縦長とも）: 左右2ペイン（英文・訳文とも全文、各独立スクロール、`flex: 1 1 50%` + `box-sizing: border-box` の外寸等幅、中央は訳ペインの `border-left`）。選択は**1ペアだけ**強調し、SVG 曲線を英文の選択文 fragment 右端→訳文の選択文 fragment 左端に接続する。gutter が狭いときは制御点を `0..40` に詰めて本文へ張り出さない（広い横長は従来の ±40 で不変）。
- （2026-10-26 の app2 `@50`〜2026-10-29 の Pages 公開版の履歴）スマホ/縦長: 上下2ペインだった。当時の曲線は**その文の最後の可視文字の実測位置**へ繋いでいた（pane の右端固定にしない）。末尾の空白・タブ・全角空白・CRLF は除いた最後の書記素クラスタ（絵文字・ZWJ・異体字・肌色・旗。`Intl.Segmenter`、無ければコードポイント＋結合文字のフォールバック）に `Range` を張り、`getClientRects()` の実測 rect（折返しは最後の行）を使った。英文も訳文も同じ方法で文末を測った。**接続点は文末文字の右下角**（x = 文字 bbox の右端、y = bbox の下端 +2px。行間が上側になるときは右上角 −2px）で、文字 bbox へ stroke（2px）を入れない。文末の後に**空白なしで同じ行に次の文が続く**場合（例「猫。犬。鳥。」）、右中央から縦に降りると隣の文字の bbox を貫くため、右下角＝文字 bbox の外から出した。経路は **右下角 → その行の行間余白（`line-height: 3`）→ 行間内を水平に右gutter → gutter を縦に下る → 訳の行間余白 → 訳文末の右下角**（単純な3次ベジェや H→V→H は使わない）。行間 y は実測行 rect と行送りから「次の行との間 → 行送り → 前の行との間」の順に求め、文字サイズが大きくてどれも pane ∩ view の clip に入らないときは文字 bbox のすぐ外（角 +2px）へ逃がす（そこも不可なら隠す）。角は `Q` で丸め、gutter の縦経路だけが pane の `padding-right` 内（本文の右外）を通り、viewport 右端からはみ出さない。文末が画面外・`Range` を取れない・接続点が clip 外のときは**線を隠す**。向きの判定は CSS と同じ `orientation: portrait`（JS は `matchMedia`）に揃えていた。**2026-10-30 以降は上下2ペインを使わないため、この経路は pane が実際に上下に積まれたときだけのフォールバック**（7.13）。
- 英文の単語タップは、通常モードでは従来どおり既存辞書と履歴。**対訳モード中は文選択だけ**で、辞書のロード/表示・履歴追加をせず早期 return する。
- 対訳モードへ入るときは既存の辞書ポップアップを閉じ、辞書取得の世代tokenを進める。遅れて返った取得結果は、モード中・レコード切替後・辞書close後・連打で古くなった要求では表示も履歴追加もしない。通常モードの履歴は消さない。
- 訳が見切れる場合だけ訳ペインを自動スクロールする（smooth）。`prefers-reduced-motion: reduce` では即時。新しい選択では**前の smooth を停止してから**可視判定する（旧移動先が残っても続かない）。モード終了・レコード切替でも停止する。pane より高い文は先頭を合わせ、再計算で同じ位置なら再スクロールしない（揺れない）。
- スクロール・リサイズ・文字サイズ・テーマ変更・フォント読込で線を再計算する（スクロールイベントの rAF 追従は維持）。
- 対訳中スマホは辞書を上側（内部スクロール、最大32dvh）。通常時は従来どおり下側。PC は従来位置。
- XSS 防止のため `textContent` のみを使う。レコード切替・遅延応答・モード終了は `seq` と `recordId` で無効化し、選択・線もリセットする。
- 標準/pop/forest の各テーマに `site/themes/pop.css` / `forest.css` で対訳用スタイルを追加。中央の境界線は全テーマとも base の `#jaPane { border-left }` を維持し、縦長でも `border-top` へ切り替えない（2026-10-30 に pop/forest の portrait 上書きを削除。7.13）。曲線は既存の `padding-right`・`line-height` の範囲内で、テーマCSSの追加変更は不要（`#blLinkPath` の stroke だけ各テーマが上書き）。

### 7.5 テスト（ローカル・モック＋公開後の read-only 検証）

- `scripts/tests/security-backends.test.cjs`: AI モックを Ollama 形式（`message.content` / `done`）へ変更。Ollama の HTTP 失敗・非JSON・切断・打ち切り・空・think 400 の再試行、ZEN 非フォールバック、翻訳の取得/作成/再利用/同一ID再送/並行予約/不正出力/中国語疑い/常用漢字の正常系/moderation/保存不明（永続 unknown）/入力検証の実行順/削除連動を追加。2026-10-26 の変更（記号保持。app2 `@50` で公開済）では、記号だけスパンの AI 除外と原文 trim 保持、新形式の完全一致検証、旧 cache 互換、通常英文への記号のみ応答の拒否、合成後全訳の moderation（全記号時も審査1回・明示 OK のみ）、`TRANS_VERSION` 不変を追加。
- `scripts/tests/transport.test.cjs`: `translateText` の送信契約（get は request_id 不要、create は必須、record_id のみ送信）と対訳 UI の静的検証を追加。2026-10-26 の変更（app2 `@50` で公開済）では、段落の改行数（LF/CRLF/空行/インデント/先頭末尾/文間スペース）、縦長/横長のリンク座標、辞書の遅延応答（モード/レコード切替/連打/close）、smooth の中断と reduced motion を追加。
- 2026-10-27 の縦長リンクの変更（7.11。修正当時はローカル・未公開 → commit `08110ba` で Pages 公開済み）では、文末文字の実測（末尾の空白/CRLF/タブ/全角空白/絵文字・ZWJ・肌色・旗、`Intl.Segmenter` 不可時のフォールバック）と `Range` の最後の行の採用、接続点＝文末文字の右下角（+2px。gap が上なら右上角）と文字 bbox へ stroke が入らないこと、行間余白 y の決め方（次の行→行送り→前の行→clip 外なら bbox のすぐ外→不可なら非表示）、接続点が clip 外なら非表示、**空白なしで同じ行に続く後続文（`猫。犬。鳥。` の実 bbox）でも route が本文 bbox に入らない**こと、縦長の端点が pane 右端固定でないこと、横長 path の完全一致（`M 470 110 C 510 110, 510 210, 550 210`）を追加した。線分を 0.5px 刻みで標本化し、stroke 半径 1px を含めて本文 rect と交差しないことを検証する。
- 実ブラウザ確認はモック（ローカル `http.server` + `window.test*` フック）で PC 1280x900 / スマホ 390x844 / 3テーマを確認。最終の実機・実 API 回帰は `test` 担当。
- 2026-10-26 の変更は、ローカル段階で code（`security-backends`）114 pass / UI transport 38 pass、公開時の最終回帰で**独立 188 pass / UI 144 pass**（いずれもオフライン）。実 API・本番 Drive は使っていない（7.10）。
- 2026-10-27 の縦長リンクの変更（7.11）は、ローカル段階で **Node 191 pass / UI 195 pass**、公開版（commit `08110ba`）の最終回帰で **UI 195 pass**（いずれもオフライン）。実 API・本番 Drive・課金は使っていない。
- 2026-10-30 の全幅左右統一（7.13。実装時はローカル・未公開 → commit `139bb59` で Pages 公開済み）では、`@media (orientation: portrait)` の `#bilingualView.is-active` が `row`・`gap: 12px`・外寸等幅（`flex: 1 1 50%` / `box-sizing: border-box` / `min-width: 0`。PC の base も同じ）で、各ペインの独立 `overflow` と中央の `border-left` を維持すること、pop/forest の portrait に `#jaPane` の `border-top` 上書きが無いこと、`blIsStackedPanes` が実 pane 矩形で stacked を判定し（向きに依存しない）、狭い gutter の制御点が `0..40` に収まること、`drawBilingualLink` が向きではなく配置で経路を選ぶこと、回転で本文を維持する向き制御（7.12）が変わらないことを追加した。最終のオフライン回帰は **Node 196 pass / UI 216 pass / 配置 147 pass / 回転 57 pass / long 6 pass**、公開版（commit `139bb59`）で **UI 216 pass / 配置 87 pass / 回転 57 pass**。実ブラウザの bbox 実測（等幅）は `test` 担当が公開後に完了（PC 1280x900 / スマホ 390x844・320 × 3テーマで外寸差 1px 未満。7.13 の公開表）。なお当初の `flex: 1 1 0` は padding/border の差が外寸差（std 390 で 13px、PC で 17px）になったため、`flex-basis: 50%` + `box-sizing: border-box` へ修正した（`test` の実測で検出）。

#### モックでの UI 確認手順（test 引継ぎ用）

1. リポジトリ直下で `python -m http.server 8123 --bind 127.0.0.1` を起動し、`http://127.0.0.1:8123/site/app2/` を開く（外部リクエストは遮断してよい。probe 失敗でも表示フックは使える）。
2. 表示専用フックでレコードと訳を注入する（本文と spans は一致させる）。
   - `window.testRenderRecord({ id:'tadoku-1700000001000', title:'Fixture', text:'The cat sat. The dog ran.\n\nA bird flew.', settings:{level:'3級'} })`
   - `window.testBilingualShow({ record_id:'tadoku-1700000001000', model:'gemma4:31b', lang:'ja', version:1, created_at:'...', spans:[{id:'s0',start:0,end:13},{id:'s1',start:13,end:27},{id:'s2',start:27,end:39}], items:[{id:'s0',ja:'猫が座った。'},{id:'s1',ja:'犬が走った。'},{id:'s2',ja:'鳥が飛んだ。'}] })`
   - `window.testBilingualSelect('s1', 200)` で1ペア選択＋線を描画。
   - 縦長（例 390x844）では `testRenderRecord` が本文モード（`mobile-preview`）へ入る（7.12）。設定画面側の確認は `#backButton` で戻る。
3. 確認項目: 英文が inline span で文ごとに改行されない／訳文は文間が連結され「The dog ran.」の後の空行（改行2つ）がそのまま保持される（CRLF・先頭改行の fixture も確認）／PC・スマホとも左右2ペイン（等幅・中央 `border-left`・各独立スクロール）で、曲線は英文の選択文 fragment 右端→訳文 fragment 左端（狭い gutter は制御点 `0..40` で本文へ張り出さない。広い PC は ±40 の従来値）／`猫。犬。鳥。`のように空白なしで詰まった訳文でも線は選択文 fragment の端に接続する／選択は2要素だけ／対訳中の英文タップで辞書が開かず履歴も増えない（通常モードの辞書・履歴は従来どおり）／辞書は対訳中スマホで上側（`fixed`・最大32dvh）／モード終了で選択・線が消える／pop・forest で色とフォント・中央境界線が切り替わる／記号だけの span（例 `***`）を含む fixture は原文のまま表示され、隣接文の改行保持を壊さない。pane が実際に上下へ積まれた場合だけ、文末文字の右下角→行間余白→gutter の経路（7.11 の実装）をフォールバックとして使う。
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
- 本番反映は 2026-10-26 に完了（`@48` は 7.7、`@49` は 7.9、`@50` は 7.10）。手順の正本は `AGENTS.md`「デプロイ・公開のルール」。

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

### 7.10 対訳UI＋翻訳バックエンドの追加改善（2026-10-26・app2 `@50`／Pages 公開済）

> 7.10 は当初「UI のみ」の記録だったが、同じ作業で **バックエンド（記号だけスパンの原文保持）も変更**したため、本節を UI＋backend の記録に更新する。2026-10-26 に commit `878ae1d` として app2 `@50` と Pages へ公開し、公開後 read-only 検証まで完了した。旧 `@49` の smoke 記録（7.9）は当時の記録としてそのまま保持する。

**段階の区別**:

| 段階 | 状態 | 補足 |
|---|---|---|
| コード修正 | 完了 | `site/app2/index.html` / `site-gas/site-app2-backend/Code.js` / `scripts/tests/transport.test.cjs` / `scripts/tests/security-backends.test.cjs` / 本docs。テーマCSSは変更なし。Script Properties・URL・認証・`request_id` 冪等・未知 state の扱いは不変 |
| ローカル検証 | 完了 | オフライン unit/static。公開時の最終回帰は**独立 188 pass / UI 144 pass**（実 API・本番 Drive 不使用） |
| GAS HEAD への push | 完了 | 公開 `@50` の code `72602a06` / bundle `3cbf8dcc` が commit `878ae1d` の source と全整合。manifest は `@49` と同一（不変） |
| 本番 GAS 公開（既存版更新） | 完了（2026-10-26T14:47:01.855Z） | app2 `@49`→`@50`。version 作成は1回・切替 PUT は1回のみ |
| `deploymentConfig` / `entryPoints` | 保持・不変 | `versionNumber` 以外（`scriptId` / `manifestFileName` / `description`）を保持。`entryPoints` 全体（`access` / `executeAs` 含む）・入口URL・`access` / `executeAs` は前後一致、他デプロイも不変 |
| stale version snapshot | read-only reconcile で復旧 | 作成済み version の list が stale だったため証拠付きで停止し、再 version 作成をせず read-only の複数経路（最新 GET/list・`fields` 違い・`prettyPrint`・no-cache 等）で最新 version / `updateTime` の一致を再照合して復旧。切替 PUT は1回 |
| PUT 前の 503 | 送信前停止と判定して実行 | 切替 PUT 前の 503 は送信前の停止と証拠を確認したうえで実行。成功後の再 PUT はしていない |
| 認証 | 専用 auth のみ | 共有認証は変更なし（実パス・鍵・メールは記載しない） |
| CI（Tests） | 完了 | Tests `40343276658` success |
| Pages 反映 | 完了 | Pages `40343276499` success。公開 artifact commit は `878ae1d` |
| 公開後検証（read-only） | 完了（66 pass） | 公開 `app2` の HTML が commit と byte 単位で SHA 一致。実Chrome PC（1280x900）/ mobile（390x844）× 3テーマで、原文の段落数（LF/CRLF）保持、記号スパンで二重改行が出ないこと、対訳中の辞書・履歴抑止、右gutterの線、smooth の中断を確認。無効 token は従来どおり拒否 |
| 実 AI の追加課金検証 | 未実施 | 記号混在本文の実翻訳・追加課金の検証はしていない。本番 Drive への書込みもしていない（read-only のみ） |

**変更内容（UI）**:

1. 訳文ペインの文ごとの改行を廃止。保存済み `spans` の `start/end` で元英文スライスを切り、先頭/末尾の空白ランにある改行を LF に正規化して**数だけ保持**する（CRLF は改行1つ、空行は2つとして保持、先頭も同様）。同段落内の文間は連結（余計なスペース・改行なし）。英文は offset の inline span のまま改変せず、訳文 span の `data-sid` も維持する。保存訳の破棄・再翻訳はしない。
2. 対訳モード中の英文クリックは文選択のみで、辞書のロード/表示・調べた単語履歴の追加をしない（early return）。モードへ入るときは既存の辞書ポップアップを閉じ、辞書取得の世代tokenを進める。遅延した取得結果は、モード中・レコード切替後・辞書close後・連打の古い要求では表示も履歴追加もしない（非同期の世代とポップアップのクローズで loading 表示が残らない）。通常モードの辞書・履歴は従来どおりで、モード切替では履歴を消さない。
3. 横長の曲線は従来どおり。縦長は英文ペイン右余白→右gutter→訳文ペイン右余白へ通し、端点・制御点をすべて pane の `padding-right`（20px）内に収める。`enRect.right` などの本文端は使わず、y は選択文の中心間だけを通す。viewport 右端からはみ出さず、両端が見えていないときは従来どおり線を隠す。向きの判定は CSS と同じ `orientation: portrait` を `matchMedia` で見る。
4. 訳ペインの自動スクロールは見切れるときだけ smooth。`prefers-reduced-motion: reduce` では即時。新しい選択では前の smooth を停止してから可視判定するため、旧移動先へ続かない（途中で新選択が可視のケースを含む）。モード終了・レコード切替でも停止する。pane より高い文は先頭を合わせて揺れない。スクロールイベントの rAF 線追従は維持。

**変更内容（バックエンド）**:

5. 記号だけのスパン（Unicode の `P`/`S`/`Z`/`Cf`、絵文字・異体字セレクタ・囲み文字等。キーキャップ絵文字は1要素扱い）は翻訳 AI に渡さず、原文を trim したまま `ja` に保存する。数字・数式・化学式・日本語を含むスパンは従来どおり対象。property escape 不可の環境では同等の範囲表へフォールバックし、表に無い文字は対象に倒す。
6. 通常文の応答は件数・ID 完全一致のまま（欠落・重複・未知 ID・記号だけの応答は拒否）。記号スパンを除いた対象だけを ID そのままで AI に渡し、戻り値を元の並びへ合成。プロンプトに「記号だけの行・リストに無い ID を出力しない」を追加。
7. moderation は AI 翻訳の有無にかかわらず**合成後の全訳**（原文保持分を含む）に1回実行し、明示 OK のみ保存。全スパンが記号だけでも審査を実行し、匿名の試行枠は API 前に消費する（費用保護）。判定不能・NG・失敗は保存しない。
8. 保存形式に `symbols:'verbatim'` を追加（含有フラグではなく、記号保持対応版で生成した訳の目印）。`TRANS_VERSION` は不変。新 cache だけ記号スパンの原文 trim との完全一致を要求し、旧 cache は訳文を許容する。**新旧 cache の削除・再生成は不要**。
9. 通常の英文スパンに記号だけの応答が返った場合は、訳の欠落として拒否（`translation_invalid`）。数字・数式・化学式・日本語であることを必須にはせず、従来の ASCII のみ・制御文字・中国語疑い等の検査を維持。

**テスト（オフライン回帰＋公開後 read-only）**: `scripts/tests/transport.test.cjs` に段落の改行数（LF/CRLF/空行/インデント/先頭末尾/文間スペース）、縦長・横長のリンク座標と向き判定、辞書の遅延応答（モード/レコード切替/連打/close）、smooth の中断・最新可視優先・reduced motion の回帰を追加。`scripts/tests/security-backends.test.cjs` に記号保持（AI 除外・trim 保持・`symbols:'verbatim'` 完全一致・旧 cache 互換・合成後 moderation・全記号時の審査/quota・通常英文への記号のみ応答拒否・`TRANS_VERSION` 不変）を追加。公開時の最終回帰は独立 188 pass / UI 144 pass。公開後は read-only で 66 pass（実 AI・本番 Drive は使っていない）。

**未確認・懸念**: 実 AI による記号混在翻訳の追加課金検証と本番 Drive 書込みは未実施（公開後の検証は read-only）。記号判定は property escape 依存（フォールバックあり）。旧 cache の記号スパンには従来の訳文が残るため、表示は「訳文」のまま（再生成しない方針）。

### 7.11 縦長の対訳線を文末へ接続（2026-10-27・Pages 公開済み／当時。2026-10-30 の全幅左右統一で上下2ペインは現行UIから外れ、この経路は stacked 時のフォールバック。7.13）

> 修正直後は**ローカルのみで未公開**だった。その後 commit `08110ba` として **Pages のみ**公開し、公開後の read-only 検証まで完了した（下の「公開」）。GAS HEAD への push・既存デプロイの版更新は行っていない。**GAS（`site-app2-backend`）は変更なしで app2 `@50` のまま**（新しい version は作成しておらず `@51` は存在しない）。対象は `site/app2/index.html`（対訳 UI）、`scripts/tests/transport.test.cjs`、本 docs。

**公開（2026-10-27・Pages のみ）**:

| 段階 | 状態 | 補足 |
|---|---|---|
| コード修正 | 完了 | commit `08110ba`（縦長リンクを文末へ接続） |
| ローカル検証 | 完了 | Node 191 pass / UI 195 pass（オフライン。実 API・本番 Drive 不使用） |
| CI（Tests） | 完了 | Tests `40351772811` success |
| Pages 反映 | 完了 | Pages `40351772816` success。公開 artifact commit は `08110ba` |
| 公開後検証（read-only） | 完了 | 公開 `app2/` は HTTP 200・115,696 byte で commit `08110ba` の source と SHA 一致。公開版は UI 195 pass。実Chrome PC（1280x900）/ スマホ（390x844）× 3テーマで、縦長の接続点＝文末文字の右下角（gap が上なら右上角）、stroke を含めて文字 bbox への侵入 0、横長 path は完全同値、overflow 0・error 0 |
| GAS / デプロイ | 変更なし | app2 は `@50` のまま（version 作成・切替 PUT・`entryPoints` 変更なし。`site-app2-backend` は不変） |
| 実 API 課金・本番 Drive | 未実施 | 検証は read-only（実 AI・本番 Drive 操作なし） |

**背景**: 縦長（上下2ペイン）の対訳線は両端を pane の `padding-right` 内（pane 右端 −12px）に固定していたため、行の長さに関係なく**文の右端ではなく pane の右端**に付いて見えていた（7.10 の `@50` 公開分の挙動）。

**変更**:

1. 縦長の端点を**その文の最後の可視文字の実測位置**へ移した。末尾の空白・タブ・全角空白・CRLF を除いた最後の書記素クラスタを `Intl.Segmenter`（無ければコードポイント＋結合文字/ZWJ/旗の対/肌色のフォールバック）で求め、その文字に `Range` を張って `getClientRects()` の実測 rect（折返しでクラスタが行をまたぐ場合は最後の行）を採る。英文も訳文も同じ方法で測る。
2. 接続点は**文末文字の右下角**（x = 文字 bbox の右端、y = bbox の下端 +2px。行間が上側になるときは右上角 −2px）。stroke 幅は 2px なので、この余白で文字 bbox へ stroke が入らない。**pane 右端固定の式（`edgeX`）は削除**した。
3. 当初は「文末文字の右 +2px・y は行の中心」から縦に降りる形にしたが、**空白なしで同じ行に次の文が続く**訳文（例「猫。犬。鳥。」）では、その x が次の文字（「犬」）の bbox 内に入り、降りる縦線が隣の文字を貫いた。そこで**文字 bbox の外（右下角）から行間余白へ出る**形に変更した。経路は **右下角 → その行の行間余白（`line-height: 3`）→ 行間内を水平に右gutter → gutter を縦に下る → 訳の行間余白 → 訳文末の右下角**（単純な3次ベジェや H→V→H の折れ線は使わない）。
4. 行間 y は実測行 rect と行送りから「次の行との間 → 行送り（要素の最終行）→ 前の行との間」の順に求め、文字サイズを上げて行間が pane ∩ view の clip に入らないときは文字 bbox のすぐ外（角 +2px）へ逃がす（そこも不可なら隠す）。角は `Q` で丸め（半径6px・線分長の半分でクランプ）、`#blLinkPath` に `stroke-linejoin: round` を併用。接続点は右下角そのものなので、線の始点・終点が文末であることは位置で分かる（小さい dot は付けていない）。
5. **横長（左右2ペイン）は完全に不変**（英文右端→訳文左端・±40 の制御点）。縦長の計算だけを差し替えた。
6. 文末が画面外（長文の末尾が pane の外）・`Range` を取れない・接続点が clip 外のときは**線を隠す**。行にタップした位置（`anchorY`）や別の行へ黙って戻すことはしない。訳ペインの自動スクロール（見切れるときだけ smooth、`reduce` は即時、最新の可視を優先）は変更していない。

**テスト（オフライン unit/static）**: `scripts/tests/transport.test.cjs` の `app2 bilingual link` 系を新仕様へ更新し、(a) 文末の可視文字の範囲（末尾空白/CRLF/タブ/全角空白/絵文字/ZWJ/肌色/旗、`Intl.Segmenter` 不可時のフォールバック）、(b) `Range` の最後の行の採用と、空白だけのノード・幅0・`Range` 非対応時の null、(c) 接続点＝文末文字の右下角（+2px、gap が上なら右上角 −2px）と旧「右中央」の不採用、(d) 行間 y の決め方（次の行→行送り→前の行→clip 外なら bbox のすぐ外→不可なら非表示）、(e) 接続点が clip 外なら非表示、(f) 縦長の経路（水平部は行間余白だけ、gutter は本文の右外、viewport をはみ出さない）、(g) **`猫。犬。鳥。` の実 bbox fixture で、route（0.5px 刻みの標本化＋stroke 半径1px）が本文 rect に入らない**こと。(h) 横長 path の完全一致、(i) 旧式（`edgeX`・右中央端点）が残っていないことを検証する。実ブラウザの操作確認は `test` 担当が実施済み（PC 1280x900 / スマホ 390x844 / 3テーマ・resize/zoom/orientation を含む。結果は本節冒頭の公開表）。実 API・本番 Drive・課金は使っていない。

**未確認・懸念**: 実ブラウザでの見た目は公開後に確認済み（PC 1280x900 / スマホ 390x844 × 3テーマ。本節冒頭の「公開」を参照）。実 API・本番 Drive は使っていない（課金なし）。初回のローカル版（文末文字の右中央から降りる形）は、独立 `test` の UI 確認（`猫。犬。鳥。`・3テーマ・resize/zoom/orientation）で**空白なしの隣接文字を貫く**ことが検出されたため、本節のとおり右下角へ変更した（再確認は `test` で実施）。長文の訳で末尾が画面外になると線が出ない（仕様どおりだが体感は要確認）。行間の計算は `line-height`（現在 3）と実測 rect に依存するため、将来 line-height を小さくすると余白が減る。

### 7.12 横→縦の回転で本文モードを継続（2026-10-27・commit `fb3b218` で Pages 公開済み）

> 実装直後は**ローカルのみで未公開**だった。その後 commit `fb3b218` として **Pages のみ**公開し、公開後の read-only 検証まで完了した（下の「公開」）。GAS HEAD への push・既存デプロイの版更新は行っていない。**GAS（`site-app2-backend`）は変更なしで app2 `@50` のまま**（version 作成・切替 PUT・`entryPoints` 変更なし。`@51` は存在しない）。対象は `site/app2/index.html`（向き UI）、`scripts/tests/transport.test.cjs`、本 docs。

**公開（2026-10-27・Pages のみ）**:

| 段階 | 状態 | 補足 |
|---|---|---|
| コード修正 | 完了 | commit `fb3b218`（横→縦の回転で本文モードを継続） |
| ローカル検証 | 完了 | Node 194 pass / 回転 UI 57 pass / 対訳線 UI 195 pass（オフライン。実 API・本番 Drive 不使用） |
| CI（Tests） | 完了 | Tests `40357726954` success |
| Pages 反映 | 完了 | Pages `40357727362` success。公開 artifact commit は `fb3b218` |
| 公開後検証（read-only） | 完了 | 公開 `app2/` は HTTP 200・125,350 byte で commit `fb3b218` の source と SHA 一致。公開版モックは 3テーマ 57 pass。Chrome viewport（390x844）で landscape→portrait に回すと設定画面（sidebar）へ戻らず本文モードを継続し、本文 scroll・対訳線（active）・zoom・選択・panes を保持。未選択で起動した縦長は設定のまま、明示「戻る」後の縦長も設定を保持。回転による追加 GET / create 0・overflow 0・error 0 |
| GAS / デプロイ | 変更なし | app2 は `@50` のまま（version 作成・切替 PUT・`entryPoints` 変更なし。`site-app2-backend` は不変） |
| 実 iOS 回転・実キーボード | 未確認 | 検証は Chrome の viewport 代替。実端末の回転・ソフトキーボード表示は未確認 |
| 実 API 課金・本番 Drive | 未実施 | 検証は read-only（実 AI・本番 Drive 操作なし） |

**背景**: CSS の `@media (orientation: portrait)` は `body.mobile-preview` が無いと設定画面（sidebar）を出し、`#preview-container` は非表示になる。従来 `mobile-preview` は生成成功（`innerWidth < innerHeight`）と履歴クリックのときだけ付与していたため、横向きで読んでいる長文を縦向きに回すと sidebar に戻り、読書位置も失われていた。向きのイベント（resize / orientationchange）は対訳線を描き直すだけで、本文モードへは戻していなかった。

**変更**:

1. 向き判定を CSS と同じ `matchMedia('(orientation: portrait)')`（無ければ寸法比）に統一し、`mobile-preview` の付与をレコード描画時と向き変化時の1か所へ集約（`innerWidth` 比較を削除）。
2. 横→縦で本文を表示中（`currentRecord` があり本文が空でない）なら `body.mobile-preview` を付与して縦本文モードで読書を継続。**未選択で起動した縦長は設定のまま**。遷移の判断は純関数 `readingOrientationAction`、DOM は deps 注入の `createReadingOrientation` に分離。
3. 明示「戻る」は同じ縦長の間は resize / キーボードイベントで奪わない（suppressed）。戻る→横向き→縦向きで読書の意思（本文クリック・レコード描画）が無ければ設定継続を優先し、横向きで読書を再開したら次の縦向きは本文へ復帰。
4. 重複イベント（resize / orientationchange / matchMedia change）は状態遷移が無ければ `idle`。イベント直後に matchMedia / 寸法が未確定でも、rAF＋160ms の settle 再確認で同じ結論へ収束。
5. 回転で `renderRecord` / `showBilingual` / AI・サーバー呼び直しはしない。`bilingual.active`・選択・zoom・段落・履歴は保持。辞書は `dictUiClose`（世代を進め遅延応答も無効化）で閉じ、残留 smooth は停止し、対訳線は新しい向きで引き直す（選択末端が画面外なら既存どおり線を隠す）。
6. CSS 非表示で失われる scroll は、表示中の値だけを snapshot（`readingScroll`）し、回転後の実測が 0 のときだけ即時復旧する。0 の読みで保存値を上書きしない。レコード切替時は snapshot も先頭へ戻す。
7. PC の細長いウィンドウも同じ CSS の縦長判定に従う（touch デバイス判定は追加しない）。

**テスト（オフライン unit/static）**: `scripts/tests/transport.test.cjs` に (a) 向き遷移の純関数（未観測・未選択・横→縦・縦→横・重複・back）、(b) DOM mock のコントローラ（`mobile-preview` の付け外し、重複イベントで再遷移しない、back が同縦長で覆されない、back→横→縦で設定継続、横向き本文クリック後の縦向き復帰、settle 収束）、(c) scroll snapshot/復旧（非表示の 0 を保存しない・実測 0 のときだけ即時復旧・実測が残っていれば触らない・reset）、(d) static（回転ブロックに `renderRecord` / `showBilingual` / `callServer` が無い、matchMedia の change 監視、back の一本化、`cancelJaAutoScroll` → `dictUiClose` → `scheduleLinkDraw` の順序、`innerWidth` 比較の除去）を追加。`node --test` は Node 194 pass（うち回転 UI 57 pass。実 API・本番 Drive 不使用）。公開後の確認は、公開版モック（3テーマ）で 57 pass、対訳線を含む UI 195 pass。回転の実操作は `test` 担当が Chrome viewport（390x844）の landscape→portrait で確認済み（回転で追加 GET / create 0・overflow 0・error 0）。実 iOS 端末の回転・実キーボードは未確認。

**未確認・懸念**: 実 iOS 端末の回転・ソフトキーボードでの見え方は未確認（Chrome viewport 代替での確認のみ）。回転直後に matchMedia が古い値を返す環境では settle（最大160ms）で復帰するが、その間だけ設定画面が見える場合がある。iOS Safari の `orientationchange` と `matchMedia` の順序は環境依存のため実機確認を要する。回転後の scroll 復旧で選択文が画面外になった場合は、既存どおり対訳線を隠す。実 API・本番 Drive 書き込みは行っていない（課金なし）。

### 7.13 対訳を全幅で左右2ペインへ統一（2026-10-30・commit `139bb59` で Pages 公開済み）

> 実装直後は**ローカルのみで未公開**だった。その後 commit `139bb59` として **Pages のみ**公開し、公開後の read-only 検証まで完了した（下の「公開」）。GAS HEAD への push・既存デプロイの版更新は行っていない。**GAS（`site-app2-backend`）は変更なしで app2 `@50` のまま**（version 作成・切替 PUT・`entryPoints` 変更なし。`@51` は存在しない）。スキーマ・API・翻訳の旧訳再利用（`sourceHash` 一致で LLM なし）は変わらない。

**公開（2026-10-30・Pages のみ）**:

| 段階 | 状態 | 補足 |
|---|---|---|
| コード修正 | 完了 | commit `139bb59`（対訳を全幅で左右2ペインへ統一） |
| ローカル検証 | 完了 | Node 196 pass / UI 216 pass / 配置 147 pass / 回転 57 pass / long 6 pass（オフライン。実 API・本番 Drive 不使用） |
| CI（Tests） | 完了 | Tests `41006704580` success |
| Pages 反映 | 完了 | Pages `41006704452` success。公開 artifact commit は `139bb59` |
| 公開後検証（read-only） | 完了 | 公開 `app2/` の HTML と `themes/pop.css` / `forest.css` は HTTP 200 で commit `139bb59` の source と byte/SHA 一致。公開版は UI 216 pass / 配置 87 pass / 回転 57 pass |
| 実ブラウザ確認 | 完了（公開後） | PC 1280x900 / スマホ 390x844・320 × 3テーマ。左右ペインの外寸差 1px 未満（等幅）・中央の破線境界線・各ペイン独立スクロール・段落記号・辞書/履歴抑止・回転後の状態維持を確認。overflow 0・error 0 |
| GAS / デプロイ | 変更なし | app2 は `@50` のまま（version 作成・切替 PUT・`entryPoints` 変更なし。`site-app2-backend` は不変） |
| 実機スマートフォン | 未確認 | 検証は Chrome viewport 代替（390x844 / 320）。実端末では未確認 |
| 実 API 課金・本番 Drive | 未実施 | mock/block による read-only 検証（実 AI・本番 Drive 書込みなし） |

**範囲**: `site/app2/index.html`（対訳の CSS とリンク経路選択）、`site/themes/pop.css` / `forest.css`（縦長の `#jaPane` 上書きのみ）、`scripts/tests/transport.test.cjs`、docs。バックエンド・Worker・GAS・他アプリは触っていない。

**背景**: 縦長（`@media (orientation: portrait)`）だけ対訳を上下2ペインにし、リンク経路も向きで上下用（文末接続）へ切り替えていた。スマホでも左右2ペインに統一し、向きはサイドバー（設定⇄本文）の制御（7.12）だけに使う。

**変更**:

1. CSS: 縦長の `#bilingualView.is-active` を `flex-direction: row`・`gap: 12px`・`align-items: stretch` にし、`.bl-pane` は `flex: 1 1 50%` / `box-sizing: border-box` / `min-width: 0` / `min-height: 0` の外寸等幅（各ペインの独立 `overflow: auto` は base のまま。PC の base も同じ等幅）。`#jaPane` は `border-left: 1px dashed #99e699`（中央境界線）と左右 12px の padding を維持し、縦長用の `border-top`・`padding-top` は付けない。文字サイズ（`font-size: clamp(18px, 3vw, 22px)` と各要素の指定）は変えない。
2. テーマ: `pop.css` / `forest.css` の `@media (orientation: portrait)` から `#jaPane` の `border-left: none` + `border-top` 上書きを削除し、base の `border-left` を全幅で使う（`#form-container` の portrait 指定はそのまま）。
3. リンク経路: `drawBilingualLink` は `blIsPortraitLayout`（向き）ではなく、実測した `#enPane` / `#jaPane` の矩形を純関数 `blIsStackedPanes` で判定した `stacked` で経路を選ぶ。左右2ペインでは向きに関係なく英文の選択文 fragment 右端→訳文 fragment 左端の3次ベジェ。狭い gutter（< 80px）は制御点を `0..40` に詰めて本文へ張り出さない（広い横長は ±40 のまま完全一致）。inline 文選択の実 fragment へ接続する既存挙動は維持する。
4. 上下2ペイン用の実装（`blPortraitRoutePoints` / 文末の実測 / 行間余白 / 角丸）は削除せず、`blIsStackedPanes` が true のときだけ使うフォールバックとして残す（現行 CSS では左右2ペインのため通常は通らない）。
5. 向き制御は変更しない: `readingIsPortrait` / `readingOrientation` / `readingOrientationAction` / sidebar（`mobile-preview`）の遷移・scroll 復旧・辞書/線の後始末は 7.12 のまま。回転しても本文モード・選択・対訳線を維持する。
6. show/選択/smooth（reduced motion）/辞書・履歴抑止/段落改行/scroll 永続化は変更しない。

**テスト（オフライン unit/static）**: `scripts/tests/transport.test.cjs` に (a) 縦長 CSS が `row`・`gap: 12px`・外寸等幅（`flex: 1 1 50%` / `box-sizing: border-box` / `min-width: 0`。PC の base も同じ）で、`.bl-pane` の独立 `overflow` と `#jaPane` の `border-left` を維持し `border-top` を付けないこと、(b) pop/forest の portrait ブロックに `#jaPane` 上書きが無く base が `border-left` であること、(c) `blIsStackedPanes` が左右並び（縦長 390x844 想定）で false・上下積みで true になり、`drawBilingualLink` が向きを見ず `stacked` を `buildBlLinkPath` へ渡すこと、(d) 狭い gutter 12px の制御点が `0..40` に収まり、広い横長の path が完全一致のままであること、(e) 向き制御（`readingOrientation`）が残っていることを追加した。最終のオフライン回帰は **Node 196 pass / UI 216 pass / 配置 147 pass / 回転 57 pass / long 6 pass**（実 API・本番 Drive 不使用）。公開版（commit `139bb59`）でも **UI 216 pass / 配置 87 pass / 回転 57 pass**。pane 外寸の bbox 実測（std/pop/forest × 390/320/PC）は `test` 担当が公開後に完了した（本節冒頭の「公開」）。

**未確認・懸念**: 実ブラウザの pane 外寸（等幅）は公開後に確認済み（PC 1280x900 / スマホ 390x844・320 / 3テーマで外寸差 1px 未満、中央の破線境界線・独立スクロール・段落記号・辞書/履歴抑止・回転後の状態維持、overflow 0・error 0。本節冒頭の「公開」を参照）。**実機スマートフォン（実端末）は未確認**（Chrome viewport 代替）。当初の `flex: 1 1 0` は padding/border の差が外寸差（std 390 で 13px、320 で 13px、pop/forest で 13px、PC で 17px）になったため、`flex-basis: 50%` + `box-sizing: border-box` に修正した。狭い左右2ペインでは1行の文字数が減るため、英文・訳文の折返しと縦スクロール量が増える（意図した変更）。左右の曲線は選択文 fragment の端から gutter へ出るため、同じ行に続く後続文の上を横切る場合がある（2026-10-27 以前の横長と同じ既存挙動。上下用の行間経路は使わない）。実 API・本番 Drive 操作（課金・書込み）は行っていない。

## 8. EIKEN_LEVELS 全10級＋allowedExpressions の実装と公開（2026-11-03 JST・app2 `@51`→`@52`）

> 本節は **2026-11-03（JST）時点の実装・検証・公開記録**。実装 commit `ffcb7ad`、公開候補 commit `7d93937`。GAS HEAD への push・version 作成・切替 PUT は各1回で完了し、本番 app2 は **`@50` → `@51`**（`updateTime 2026-11-02T16:29:46.318Z`＝JST 2026-11-03）。新 deployment 作成・access 変更・Pages/Worker 変更・GitHub push はしていない。v51 実 AI smoke は 7/6/5級 各1件（計3件）の生成・保存・reload 再利用に成功したが、**保存成功のみで品質合格ではない**（7級 概ね合格、6/5級 不合格）。全級実 AI・機械的文長/語彙検査・語彙リストは未達。その後、品質補正 commit `1416d97` を **`@51` → `@52`**（`updateTime 2026-11-02T17:03:55.788Z`＝JST 2026-11-03）で公開。v52 の追加実 smoke（6/5級 各1）は 2/2 成功し、**5級 概ね合格・6級 禁止適合だが総合要注意**。**v51 の品質不合格は履歴として維持し、成功で上書きしない**。全品質保証・全級実 AI 検証ではない。

**段階の区別**（`AGENTS.md`「セキュリティ修正の記録」に従う）:

| 段階 | 状態 | 補足 |
|---|---|---|
| 定義・継承の実装 | 完了 | `site-gas/site-app2-backend/Code.js`。`EIKEN_LEVELS` 全10級（`allowedExpressions` 含む）、`EIKEN_LEVEL_ORDER` / `resolveAllowedExpressions_`、生成・審査の共通指示 helper、`normalizeSettings_` の事前検証 |
| 正本との一致 | 確認済 | `EIKEN_LEVELS改訂案.md` §3 の JS ブロックと `Code.js` の `EIKEN_LEVELS` が一致 |
| git commit | 完了 | 実装 `ffcb7ad`（backend `Code.js` と tests のみ）、公開候補 `7d93937`。GitHub push は未実施 |
| ローカル unit 回帰 | 完了（coder） | 122/122 pass |
| 独立最終回帰 | 完了（test） | **204 pass / 0 fail / 0 skip**、最終 backend **122 pass**。Code SHA-256 `a7d5c144fd86af0941271ca88a6b37e01c308837052c582a8df44795ba96c127`、test SHA `8d887d68a6ffc1be8a138ce0f42ad407a0391a4925301fdabf226c90c9f2eb3e` |
| UI モック確認（外部遮断） | 完了（test） | PC 1280x900 / mobile 390x844。全10級を選択でき、overflow 0・pageerror 0。証拠はローカル Temp `eiken-final-offline-20261103`（リポジトリ外） |
| 専用 auth | 再認証済み | 当初の `invalid_rapt` は再認証で解消。共有 auth は変更なし（実パス・鍵・メールは記載しない） |
| 公開前 read-only preflight | 成功 | remote HEAD は旧 git と一致（code `72602a06`）。当時の本番 app2 は `@50`・`updateTime 2026-10-26T14:47:01.855Z`・versions 50 / max 50。候補 code `a7d5c144` / bundle `035236fe`。baseline 確保済み |
| 公開runner の独立検証（修正前） | 成功 | stub 60/60・recovery 20/20（当時の記録。アプリ回帰とは別枠） |
| 公開runner の修正と独立検証 | 完了 | 版一覧50件の paging と fields mask の `nextPageToken` 欠落で fail closed。**runner のみ修正**し独立 **74+83+20=177 pass**。version 再作成・PUT 再送なし |
| GAS HEAD への push | 完了（1回） | 公開候補 `7d93937` を push。remote HEAD の code は candidate と一致 |
| 本番 GAS 公開（version 作成→PUT） | 完了（v51） | `@50`→`@51`、`updateTime 2026-11-02T16:29:46.318Z`（JST 2026-11-03）。version 作成1回・切替 PUT 1回。`deploymentConfig` は `versionNumber` 以外保持、`entryPoints` 全体を深く比較し URL/access/executeAs 不変、他 deployment 不変。`--finalize` applied/verified・gate true |
| v52 補正 commit | 完了 | `1416d97`（code `9633a6d9…` / bundle `0fb54b58`、test `ac0ceaa0…`）。**許可範囲の変更なし** |
| v52 検証 | 完了 | 独立全回帰 **209 pass / 0 fail / 0 skip**。正本10級定義の一致、UI allowlist の一致、攻撃入力の再現解消。parser 21 pass |
| v52 本番 GAS 公開 | 完了（v52） | `@51`→`@52`、`updateTime 2026-11-02T17:03:55.788Z`（JST 2026-11-03）。push・version 作成・PUT 各1回。version 直後の stale 一覧で停止→read-only reconcile（max 52 content 一致）でローカル version stage 復旧、**再 version なし**。初回 PUT 200 applied/verified、`--verify` 成功（全経路 latest）、`--finalize` applied/verified・gate true。`deploymentConfig` は version 以外保持、`entryPoints` deep 比較・URL/access/executeAs 不変、他 deployment 不変。新規 deployment・Pages/Worker/GitHub push・共有 auth 変更なし |
| 実 AI smoke（v51） | 実行済（保存成功／品質は未合格） | 7/6/5級 各1件（計3件）の生成・保存・reload 再利用に成功。7級は parser 誤判定から ack 復旧、6/5級は継続成功。品質は 7級 概ね合格・6/5級 不合格 |
| 追加 smoke（v52・6/5級 各1） | 実行済（2/2 成功） | 各1クリック・1 POST で 200 / ok true / saved true / reloadSaved true / pendingCleared true。SUMMARY 2件・pass 2 / fail 0、generatePosts 2、translateCreate 0 / translatePosts 0 / deletes 0、pending false / guard complete、doneLevels 2、JSONP 失敗 0。6級 92語13文・最長11、5級 88語15文・最長10 |
| v52 品質判定 | 5級 概ね合格／6級 要注意 | 両級とも禁止の分詞形容詞・比較・must・例外外の動名詞なし。不定詞は許可された希望表現のみ、enjoy＋-ing は自然な継承、魔法の逸脱なし。5級 概ね合格。6級は禁止適合だが、動物の登場・命名の唐突さ、命名構文/調理・動物語彙の補助余地、動物への菓子の描写に動物用安全食品の明示なし、危険材料の明記なし |
| 機械的文長/語彙検査・語彙リスト | 未着手 | 従来どおり後続（`EIKEN_LEVELS改訂案.md` §8.3） |

**公開手順の履歴（fail-closed と reconcile）**:

- 版一覧が50件上限に達し、paging と fields mask の `nextPageToken` 欠落により、**version 作成後・PUT 送信前に fail closed**。修正は公開 runner のみ（アプリコードは変更なし）。version の再作成・PUT の再送はしていない。
- reconcile した版は v51 の content と一致し、version 段階をローカル復旧。PUT 前エラーは**送信前**と確認（lock guard 不在・dispatch 無しの証拠）。
- 初回 PUT は 200（applied/verified）。直後の `--verify` で stale な旧 v50 が混在したため**再 PUT せず**、read-only reconcile の最新8経路（GET 4 / list 4）で v51 同一 `updateTime` 一致、HEAD/version content と candidate 一致、他 deployment 不変を確認。`--finalize` で applied/verified・gate true。
- 証拠はローカル Temp `eiken-definition-release-20261103`、reconcile `2026-11-02T16-30-52-739Z` の summary/result（リポジトリ外）。認証パス・鍵・実メール・本文・実IDは記載しない。

**実 AI smoke の結果（2026-11-03・v51 公開版）**:

- 7級/6級/5級 各1件（計3件）を実 AI で生成・Drive 保存し、reload で保存済みを再利用できた。**保存・再利用の成功であり、品質合格ではない**。
- 7級の初回は JSONP 履歴 parser が unknown と誤判定して停止。**追加生成はせず**、独立 read で保存確定を確認して ack 復旧した。parser の 17 unit pass と callback/rid の厳格対応後、6級・5級を継続して成功。
- 最終状態: doneLevels 3 / pending false / guard complete。translate create 0 / delete 0。3教材は削除・変更せず保存維持。

| 級 | 語数 | 文数 | 最長文 | 観測した許可型 |
|---|---|---|---|---|
| 7級 | 89 | 20 | 9語 | want to 1 |
| 6級 | 89 | 16 | 10語 | want to 1 / enjoy＋-ing 1 |
| 5級 | 88 | 14 | 12語 | want to 1 / like to 1 / enjoy＋-ing 1 |

- 全文目視: 7級は概ね合格（話題の飛び・語の補助の余地あり）。6級は**不合格**（禁止の形容詞化過去分詞、目的の不定詞の不適合候補、現代日本の日常設定に対する魔法の鳥・金貨の逸脱・唐突さ）。5級は**不合格**（禁止の形容詞化過去分詞）。継承した enjoy＋-ing / want to / like to の使用自体は自然だが、**許可型が同じ文の別の禁止文法を免除しない**ことを審査が通した残欠陥がある。
- go fishing は未出・未検証。全級の実 AI 確認は未実施。
- 証拠はローカル `eiken-live-20261103/evidence/run-20261102-163325-xhop` / `run-20261102-163950-o2ep`（リポジトリ外）。本文・タイトル・実IDは記載しない。
- v51 の補正は v52 として実装・公開し、追加実 smoke（6/5級 各1）も 2/2 成功（下記）。v51 の品質不合格は履歴として維持する。

**v52 補正と公開（2026-11-03）**:

- 補正 commit `1416d97`。**許可範囲の変更なし**。
- 分詞形容詞の禁止を 7/6/5/4級に明示（be / feel / look＋surprised / excited / tired 等）。4級の be interested 例外は維持し、3級以上の grammar も維持する。
- `want to` の許可を**目的の to へ拡張しない**。
- 生成・審査で world / genre を共有し、**現実の設定と架空の設定を区別**する。
- `normalizeSettings_` は長さだけを見るため、新 helper で **UI の world 8 値 / genre 46 値に完全一致する値だけ**を審査 system に渡す。未知の raw 値や prompt は混ぜない（未知値を新契約として拒否するのではなく、system の根拠にしない）。
- 金貨などの語は**一律禁止せず、非現実的な文脈だけ**を対象にする。
- 独立全回帰 **209 pass / 0 fail / 0 skip**。正本10級定義の一致、UI allowlist の一致、攻撃入力の再現解消を確認。parser 21 pass。
- 公開: `@51`→`@52`、`updateTime 2026-11-02T17:03:55.788Z`（JST 2026-11-03）。push・version 作成・PUT 各1回。version 直後の stale 一覧で停止 → read-only reconcile（max 52 content 一致）でローカル version stage 復旧、**再 version なし**。初回 PUT 200 applied/verified、`--verify` 成功（全経路 latest）、`--finalize` applied/verified・gate true。`deploymentConfig` は version 以外保持、`entryPoints` deep 比較・URL/access/executeAs 不変、他 deployment 不変。新規 deployment・Pages/Worker/GitHub push・共有 auth 変更なし。
- **v52 追加実 smoke（6/5級 各1）は 2/2 成功**。各1クリック・1 POST で 200 / ok true / saved true / reloadSaved true / pendingCleared true。SUMMARY 2件・pass 2 / fail 0、generatePosts 2、translateCreate 0 / translatePosts 0 / deletes 0、pending false / guard complete、doneLevels 2、JSONP 失敗 0。parser 21 pass。
- **v52 品質判定**: 6級 92語13文・最長11、5級 88語15文・最長10。両級とも禁止の分詞形容詞・比較・must・例外外の動名詞なし。不定詞は許可された希望表現のみ、enjoy＋-ing は自然な継承、魔法の逸脱なし。**5級 概ね合格**。**6級は禁止適合だが総合要注意**（動物の登場・命名が唐突、命名構文/調理・動物語彙に補助の余地、動物に菓子を与える描写に動物用安全食品の明示なし、危険材料の明記なし）。日本固有描写はないが日常設定の矛盾もない。
- like to / go fishing は今回の追加2件で未出のため実品質未検証（v51 では like to が出現済み。全 smoke 一律未検証とはしない）。**全品質保証・全級実 AI 検証ではない**。
- 本番の新教材は合計5件（旧3＋追加2）。旧3は削除・変更なし。追加生成はしない。語数100の厳密性は未達だが生成目標として許容。請求額・内部 AI call count は未取得。
- **v51 の品質不合格（6/5級）は履歴として維持し、成功で上書きしない**。
- 証拠はローカル `eiken-quality-offline-20261103/final`（オフライン）と `eiken-quality-live-20261103/evidence/run-20261102-170542-1aqe`（実 smoke）。新 runner namespace は `eiken-quality-release-20261103`（旧 evidence のコピーなし・ページング修正済み）。parser 21 pass、namespace 差分確認済み。本文・実タイトル・メール・鍵・実ID・認証パスは記載しない。
- 今回の要求範囲（実装・回帰・既存デプロイ更新・承認実 AI 検証）は実施済み。教材採用前の目視と機械語彙・文長検査は後続。本記録は docs のみで、本番コードは v52 のまま・ソース未変更、GitHub push なし。

**実装内容**:

1. `EIKEN_LEVELS` を全10級で改訂（7級→…→1級）。`allowedExpressions` は各級の**追加分のみ**を文字列配列で登録し、3級〜1級は空配列。
2. 級順 `EIKEN_LEVEL_ORDER` と `resolveAllowedExpressions_(level)` を追加。有効リストは**下位級すべて＋その級の和集合**。未知の級・定義欠落・配列でない・空文字列は `appError_`（`invalid_level` / `invalid_level_definition`）で停止し、空配列で成功継続しない。解決結果は `settings` に足さない（保存構造と payloadHash を変えない）。
3. 生成と審査が共有する指示 helper（`allowedExpressionRuleLines_`）を追加。**許可型は `forbidden` より優先**、**例外は型に必要な用法・該当部分だけ**（同じ文の別の禁止文法は免除しない）、**対象級 `grammar` が広く認める用法を許可型の境界で狭めない**、`go＋任意の-ing` 等へ広げない、一致判定は意味評価（構文パーサなし）を明記。
4. `normalizeSettings_` で級の妥当性に続けて継承定義を検証。**quota・`request_id` 台帳（receipt）・AI の前**に拒否し、`invalid_settings` で AI 0・保存0・匿名枠0・台帳0。
5. `buildPrompt_` に継承後の許可型と優先ルールを渡し、`grammar` / `forbidden` / `sentenceLength` / `note` と合わせて「文長は通常目標帯・絶対上限なし・短い応答に下限なし」「級外テーマ語は文脈/簡単な説明で理解できる少数のみ」「原則避け少数許容」「列挙がない既習事項は forbidden でなければ可」を明示。
6. `checkPassage_`（審査）にも同じ許可型リスト・優先ルールを渡し、**`grammar` / `sentenceLength` / `note` も審査に追加**。「許可型に合致しても同じ文に他の禁止文法があれば NG」「少数の使用を NG にしない」を明示。解決失敗時は AI を呼ばず unavailable（保存しない）。
7. 既存の不変条件は変更なし: 認証・`ALLOWED_EMAILS`・匿名 quota の API 前予約・`request_id` 冪等・明示 OK のみ保存・保存結果不明の fail closed・翻訳/記号保持の契約。

**テスト（ローカル）**: `scripts/tests/security-backends.test.cjs` に、全10級の継承型数（3→4→5→6→6…）と下位級順、空級でも継承されること、級単位の禁止/限定許可、生成・審査の両方に同じ継承リストと優先ルールが入ること、審査への `grammar`/文長/`note` 追加、全10級で生成・審査・保存が通ること、未知・破損定義の拒否（AI 0・保存0・枠0・台帳0）、`normalizeSettings_` の冪等性を追加。coder 実行の **unit 122/122 pass** に加え、v51 の独立 `test` 回帰は **204 pass / 0 fail / 0 skip**、最終 backend **122 pass**。UI モック（外部遮断）は PC 1280x900 / mobile 390x844 で全10級を選択でき、overflow 0・pageerror 0。unit（coder 122）と独立最終回帰（test 204、backend 122）は**別の実行**として扱い、合算・混同しない。証拠はローカル Temp `eiken-final-offline-20261103`（リポジトリ外）。公開runner の独立検証（修正前 stub 60/60・recovery 20/20 → 修正後 74+83+20=177 pass）は公開手順側の別枠で、アプリ回帰とは合算しない。実 AI smoke の 7級で見つかった JSONP 履歴 parser の誤判定は、17 unit pass（callback/rid の厳格対応を含む）で修正を確認した。これはアプリ回帰の 204/122 とは別の実行で、合算しない。**v52 は独立全回帰 209 pass / 0 fail / 0 skip、parser 21 pass**（正本10級定義の一致、UI allowlist の一致、攻撃入力の再現解消を含む）。v52 の 209 は v51 の 204/122・公開runner 177・parser 17 とは別実行で、合算しない。

**未確認・懸念**: v51 実 AI smoke は 3件の生成・保存・reload 再利用に成功したが、**保存成功のみで品質合格ではない**。7級は概ね合格（話題の飛び・語の補助の余地）、6級は不合格（禁止の形容詞化過去分詞、目的の不定詞の不適合候補、現代日本の日常設定に対する魔法の鳥・金貨の逸脱・唐突さ）、5級は不合格（禁止の形容詞化過去分詞）。継承した許可型の使用は自然だが、**許可型が同じ文の別の禁止文法を免除しない**ことを審査が通した残欠陥がある。v52 の追加2件は 2/2 成功し、5級 概ね合格・6級 禁止適合だが総合要注意（動物の登場・命名の唐突さ、語彙補助の余地、動物への菓子の安全食品明示なし、危険材料の明記なし）。like to / go fishing は今回未出で実品質未検証（v51 では like to 出現済み）。go fishing は未出・未検証、全級の実 AI 確認は未達。**全品質保証ではなく、教材採用前の目視が必要**。語数100の厳密性は未達だが生成目標として許容。請求額・内部 AI call count は未取得。機械語彙・文長検査は後続。v51 の品質不合格は履歴として維持し、成功で上書きしない。許可型の一致判定は AI の意味評価に依存し、機械保証はない。文長の絶対上限・級外語の許容率・稀出頻度は未決のまま（適用をブロックしない方針）。詳細な定義・根拠はローカル文書 `EIKEN_LEVELS改訂案.md` / `収集メモ.md`（GitHub非同期）。
