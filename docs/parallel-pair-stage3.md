# 平行な2本を見つけよう！ — 第3段階

## 実装と既存データ

問題生成・7本の線・全21組の平行判定・正式イラストは再利用した。共有の `challenge120-core.js` に `parallelPair:25` を追加し、平行ゲーム専用の保存・画面アダプターから同じ状態機械を使用する。他ゲームの制限時間・閾値・ランタイム設定は変更しない。

- 通常は時間無制限。25問連続で最高称号を得た後、1秒の称号演出を経て待機へ切り替える。
- 開始を押すまで期限を作らない。開始時は既存共通仕様と同じ25問連続から始まり、正解で26・27…と更新する。出題は上級。
- 開始時刻と絶対期限120000msを保存し、開き直し・バックグラウンド復帰・回答時にも期限を検査する。不正解・期限切れ・時計巻き戻しで終了。期限を過ぎた回答はポイント対象外。
- 何度でも開始し直せる。過去の試行の回答トークンは新しい試行では受け付けない。最高記録と称号は終了・再挑戦後も保持する。
- 専用記録 `manabi_parallel_stage1:v1` を継続使用し、旧状態にはchallenge情報を追加して移行する。既存のbest/streak/titles/walletを消去しない。
- サイトでは共通 `manabiStorage`・`ManabiEconomy`・storage adapterを利用し、以後の正解は共通算数残高へ1pt、ゲーム別1日上限50pt。新しい問題別履歴・分析イベントは追加しない。共通経済処理の一時的な未処理outboxと128件の重複防止IDをそのまま利用する。
- 旧単体版の専用ポイントwalletは記録内に残し、自動合算しない。単体HTMLは既存の隔離walletを使い、本番や他ゲームの残高に書き込まない。確認用サイトは従来の共通prefixで分離し、以前のraw単体記録を削除しない。
- 共通プロフィール用には `mgl_parallelPair` のbest/streakだけをmergeして保存する。他のゲームやプロフィールのキー・所持品・ニックネームは変更しない。

## 同じ共有ランキングへの連携

共通の `ranking-sync-api.js` を再利用し、保存先は次の1パスに固定する。

`productionRankings/v1/games/parallelPair/players/{rankingAuthUid}`

通常の最高記録と120秒の最高記録を同じ `bestStreak` として保存する。最高称号前の1問以上の記録も対象。通常／チャレンジ／試行別に別行は作らない。共通のFirestore transactionが既存値との最大を保存するため、繰り返し送信でも同じUIDの1件だけで、記録は下がらない。

専用 `parallel-ranking.js` は新しい最高記録だけを送信する。ネット未接続・拒否・通信失敗時には最高値1件だけを保留し、再接続で再送する。UID別の送信済み最高値で同値の再送を抑制する。問題・回答内容・ポイント・所持品をFirestoreランキングへ送らない。

名前は共通クライアントの既存プロフィールとUIDリンクから取得する。ゲーム側から新規プロフィール作成やUID紐付けは行わない。既存リンクが不明・不一致なら端末の最高記録を保持して送信待ちにする。アカウント停止が有効な環境では利用許可も必要とする。

ゲーム内の「共有ランキング」から同じAPIで一覧を表示する。ランキングの接続が未承認の場合も、通常プレイ・称号・120秒チャレンジ・端末への記録は継続できる。

## 本番向けの候補（未適用）

`environments/parallel-stage3-release.candidate.json` に必要な追加を記載した。本番の環境JSONやFirebase設定は変更していない。

1. リポジトリ内のRules候補 `firebase/parallel-stage3-ranking.candidate.rules` は、既存 `production-simple-admin-proposed.rules` の `validRankingGame` に `parallelPair` だけを追加したprototype。現行本番Rulesのバックアップ・差分との照合を公開前に行う必要があり、ライブRulesの取得済みコピーとは扱わない。匿名UID所有、同じUID/gameの維持、既存プロフィール名、9項目だけのschema、数値上限、サーバー時刻、最高値非減少などの既存検証を保持する。
2. 公開時に既存設定の `rankingGameIds` と公開する `gameIds` へ `parallelPair` を追加し、**専用の `parallelPairRankingEnabled:true`** を明示する。
3. 既存の `rankingSyncEnabled` / `playerNameSyncEnabled` が有効で、既存プロフィールUIDとランキングUIDのリンクが確立していることを確認する。無効な場合にこのPRで全ゲームのスイッチを勝手に変更しない。専用flagなし・許可リストなし・確認用環境・adminTestでは本番ランキングへ接続しない。
4. 新ゲームの公開設定と配布ファイルは別途の公開指示で反映する。管理側のランキング対象リストにも新ゲームを追加することで、既存の名前変更などがこの行も扱える。既存ゲームの公開状態・global 120秒スイッチは変更しない。

このPRに本番Rules公開、Firebase管理設定変更、本番データ移行、PR #42の変更は含まれない。専用ランキングflagの既定値はfalse。他ゲームの既定ランキング対象は変えない。新しい複合indexは不要で、既存同様のbestStreak降順・limit100のクエリを使う。

## 検証

- 全体テスト: **154件中151件成功・既存3件失敗**。変更前の別コピーでも148件中145件成功・同じ3件失敗を再現。既存ゲームのadapter読込順、総まとめの本番/確認用コード不一致、総まとめランキング遷移で、新規失敗はない。
- 独立したBigIntによる15,000問・315,000組の数学検証は成功。問題生成・平行判定コードは変更していない。
- 第3段階の6テストで、25問での切替、開始前の無期限、119999ms/120000msの境界、期限後回答の拒否、再挑戦と古いトークン、閉じた後の期限、巻き戻し、旧記録移行、共通算数1pt/50pt、128件の上限、他ゲーム・所持品保護、オフライン再送・同UID1行を検証。
- Firestore Emulatorの候補Rulesに対する**3テスト成功**。共通APIから通常4→25→チャレンジ29を同じ1行へ保存し、過去値26の再送でも29を保持。既存points/owned/他ゲームの行が不変。他UID、偽名、UID/game変更、余分な私的項目、必須項目欠落、過大値、偽時刻、値の引下げ、削除、非認証のlist、非公開状態の更新を拒否。
- Emulatorはdemo-manabi-parallel-stage3のみ。外部Firebaseへの書込みやRules公開は行わない。

### Chrome

記録を隔離した単体HTMLで、スコアの書き換えを行わず実際に線をクリックし、25問連続正解して待機に移ることを確認した。開始前に期限はなく、開始を押すと「残り2:00」・上級になる。

開始直後にタブを閉じ、実時間129739ms後に開き直すと時間切れで終了していた。再挑戦は25から始まり、正解2問で最高27へ更新。不正解で終了し、再読み込み後も最高27・全5称号・27ptを保持した。1024×768 / 1180×820 / 1024×600の実描画で7本・決定ボタン・称号欄が収まり、スクロールなし。共通の自動正解演出が手動の称号演出を上書きしないことも、別の3問プレイで `correct, correct, title` の順に1回ずつ表示されることで確認した。観測結果は `docs/parallel-stage3-browser.json`。実機iPad Safariと本番Firestore実接続は未確認。

### 再実行

- `npm test`（先に別コピーで `npm run build:both`）
- `node --test tests/parallel-stage3.test.mjs tests/parallel-ui.test.mjs tests/parallel-assets.test.mjs`
- `npx firebase emulators:exec --project demo-manabi-parallel-stage3 --only firestore --config firebase/parallel-stage3-emulator.json 'node --test tests/rules/parallel-stage3.test.mjs'`
