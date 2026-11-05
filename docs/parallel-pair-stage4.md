# 平行ゲーム 第4段階：公開準備（未公開）

**判定：コードの公開候補は用意できたが、まだ公開実行可能とは判定しない。** 現行本番RulesとDB内の公開設定を認証付きで取得できていない。既存のRules候補をライブのバックアップとして置き換えてはいけない。PR #43はドラフトのまま。本番Rules・設定・データ・PR #42・mainには変更していない。

## 本番の読み取り結果

2026-11-06 JST、公開中の `https://romanamatya.github.io/manabi-game-land/environment.js` をHTTP GETで取得。200で、リポジトリrootのファイルとバイト単位一致。SHA256 `115441cd560d1e46a693e179fc9c3283747a0a56cb74e060b8f3000c2823dd54`。ETag/Last-Modifiedは `parallel-stage4-readiness.json` に記録。

- 本番project IDは `manabi-game-land`、ゲームIDは **`parallelPair`**。
- `rankingSyncEnabled`、`playerNameSyncEnabled`、`challenge120Enabled`、`availabilityEnabled` は既にtrue。全体スイッチの変更は不要。
- `parallelPair` は `gameIds` / `rankingGameIds` に未登録。専用 `parallelPairRankingEnabled` は未指定。
- `playerSyncEnabled:false`、`enabled:false` 等の既存値は保持する。これらを一括でtrueにしない。`staticLocalGameIds:['suichoku']` も保持し、平行ゲームは追加しない。
- `environments/production.json` は公開中rootと異なる古いblocked設定。`npm run prepare:production` の出力を本番root全体へコピーすると既存ゲームとフラグが戻る可能性がある。今回は一括生成・一括上書きを公開手順にしない。

正規の読み取り手段も調査した。Firebase CLIはインストール済みだが認証アカウント0件。`apps:list --project manabi-game-land --json` は認証不足。導入済みFirebaseプラグインにも、このセッションではRules/Firestoreを操作するAPIが公開されていない。対象gameSettingsのREST GETは403（既存suichokuも403）。**未存在ではなく、存在・statusとも不明**。匿名サインインや本番への試験書込みは行っていない。Chrome画面認識や拒否された更新操作は再試行していない。

## 必要な差分

| 対象 | 平行ゲームだけの変更 | 現状 |
| --- | --- | --- |
| 公開環境JS | `gameIds` と `rankingGameIds` の末尾に `parallelPair`、`parallelPairRankingEnabled:true` | オフライン候補作成済み。他の値は完全保持 |
| Firestore Rules | ランキング許可関数にID追加。公開管理のgameSettings create/updateの各ID許可リストにもID追加が必要か、現行Rulesで確認する | ライブRules未取得。第3段階prototypeはランキング追加だけで、管理の2リストを含まない |
| 公開状態 | `productionAdmin/v1/gameSettings/parallelPair` のみ、既存の監査・バックアップ付きvisibility操作でpublishedにする | DB未確認。事前readとバックアップ必須。既存campaign等を丸ごと上書きしない |
| ゲーム・正式素材 | root `games/parallelPair.html`、`parallel-{model,local,game,ranking}.js`、`parallel.css`、正式PNG5枚 | 既存shared-srcから同じバイトで候補化。正式素材の不足なし |
| 入口とガード | `math-navigation.js` のgeometryにID・名称・説明を追加。`public-admin-settings.js` / `management-model.js` の許可リストにID追加 | 候補のみ。新ページには共通Firebase session・availabilityガードを追加 |
| 共通処理 | PRで検証済みの `economy-core.js`、`challenge120-core.js`、`celebration-effects.js`、`profile-catalog.js`、`ranking-sync-api.js` | rootのPR版を候補へコピー。他ゲームの条件は変更しない |
| 120秒 | 共通coreの `parallelPair:25` と専用アダプターを使用 | 実装済み。全体runtimeの追加切替は不要 |
| 共有ランキング | `productionRankings/v1/games/parallelPair/players/{rankingAuthUid}` | 通常・チャレンジ同じ行。既存プロフィールUIDリンク必須。新しい児童やリンクは作らない |

プロフィール名変更などの管理処理は既存 `rankingGameIds` を利用するため、同じID追加で対象になる。ホームのチャンピオンも既存の公開状態フィルターを使用する。非公開の他ゲームを表示対象へ変更しない。ランキングは既存と同じbestStreak降順・limit100で、新規複合index追加は予定しない。

## レビューできる公開候補

`node tools/prepare-parallel-release.mjs` をリポジトリrootで実行すると **`.release/parallel-stage4/` の中だけ**に21ファイルとmanifestを作る。ネット通信・Firebase操作・git操作はしない。任意の本番rootへの出力、シンボリックリンク経由の出力、誤project、既存前提フラグが無効の設定を拒否する。ゲーム本体と正式PNGは作り直さない。manifestの `deployReady:false` は意図的で、コピーや公開を許可するものではない。

全変更パス、入力・出力SHA256は `docs/parallel-stage4-manifest.json`。再生成時はrootが最新の公開環境JSと一致するか再照合する。新ページの依存ファイルがrootに存在することも確認する。生成物は**差分overlayであり、単独ホスティングできるサイト一式ではない**。RulesやDB設定は含めず、未知のライブ設定を仮定しない。

## 検証結果

HEAD `e81c204a` に今回の準備ツール・テストを加えた隔離コピーで `npm run build:both` 後に `npm test`。**156件中153件成功、3件失敗**。main `ecdd921b` の別コピーでも同じbuild→testを行い、**132件中129件成功、同じ3件失敗**。新規失敗なし。作業ツリーで一括buildは行っていない。

既存失敗は以下。今回の平行ゲームを含まないmainで再現するため、新規不具合ではない。既存の未解決課題として残す。

1. `preview game wires storage adapter before economy runtime and keeps production game isolated` — exchangeAssociationの既存読込順。
2. `released question model and controller are identical to validated preview` — 総まとめの本番/preview不一致。
3. `summary ranking uses one local game-best streak board for practice and challenge` — 総まとめの既存ランキング遷移。

追加した `parallel-release-readiness.yml` はPR上で平行ゲームの単体テスト・候補生成・demo Emulatorだけを実行する。deploy/pushトリガーや本番認証情報は使用しない。

今回も独立BigIntで15,000問・315,000組を検証し誤判定0。7本、難易度、選択/解除/決定/再挑戦、27問の画面controller、3/5/10/15/25称号、119999/120000ms境界、閉じた後の期限、誤答終了、保存、+1pt/日50pt、他教科ポイント・所持品保護のテスト成功。準備ツールの2テストで、新ゲーム以外の設定が不変、実ファイル無変更、誤環境拒否を確認。

第3段階候補RulesのEmulatorも再実行し3件成功。共通APIで通常4→25→チャレンジ29を同じUIDの1行に保存、26の再送でも29を保持。既存ポイント123・所持品・keisan記録77を保持し、他UID・偽名・余分な私的項目・値引下げ・削除等を拒否。**現行本番Rulesに追加する差分の検証は、現行Rules取得後に別途必要**。

Chrome25問・閉じて129739ms後の時間切れ・再挑戦・誤答・保存・3画面サイズは、同じゲームコードの前段階観測 `docs/parallel-stage3-browser.json` を根拠とする。今回はChromeの手動25問再実行はしていない。PR HEADに対するGitHub Actionsの [browser-smoke](https://github.com/romanamatya/manabi-game-land/actions/runs/42050942045/job/127326555011) と [production-rules](https://github.com/romanamatya/manabi-game-land/actions/runs/42050942158/job/127326554914) は成功を確認。既存全ゲームの全実機操作や本番接続を保証する結果ではない。児童の実データに対する試験書込みはしていない。

## 公開直前の役割と順序

| 順序 | 必要事項 | Workで可能なこと | 本人の操作・判断が必要なこと |
| --- | --- | --- | --- |
| 1 | ライブRulesのrelease名・ruleset名・本文と対象gameSettingをread/backup | 読取用連携または提供されたexportから差分照合。現在は認証なしで取得不可 | Google本人認証を完了するか、Consoleから現行Rulesと対象設定をexportして提供。パスワード・トークンのチャット送信は不要 |
| 2 | 最小Rules差分を作成し再検証 | liveコピーに上記ID追加だけを適用。既存と新ゲームのEmulator検証、所有権・schema・監査・データ保護を確認 | 追加仕様の判断が発生した場合だけ判断 |
| 3 | 配信設定再取得と公開候補のhash確認 | stale production.jsonを使わず、最新rootから再生成。既存設定/ゲーム/PR #42の差分混入をチェック | 原則不要 |
| 4 | 公開承認 | 準備結果と具体的な最小差分を提示 | **Rules・対象設定・マージ・配信の実行を別途承認** |
| 5 | 承認後の公開作業 | GitHub更新/マージは接続あり。Firebaseの反映は認証済みの正規API/CLIが利用できる場合に限る。利用不能なら手動手順を用意 | Firebase書込み連携が使えなければConsoleで候補差分を反映。今回は実施しない |
| 6 | 公開後の確認 | 公開JS/hash、新入口、ランキング1行・自己ベスト更新の確認。テスト専用児童以外は触らない | 実機iPad Safariの最終確認を推奨（現環境には実機なし） |

Rulesの正規read APIは [releases.get](https://firebase.google.com/docs/reference/rules/rest/v1/projects.releases/get) と [rulesets.get](https://firebase.google.com/docs/reference/rules/rest/v1/projects.rulesets/get)。OAuth認証が必要。本人認証の公式CLI手順は [Firebase CLI](https://firebase.google.com/docs/cli)。CLIログインだけで、このセッションに未公開のプラグイン操作が追加されるとは扱わない。

公開時はRules追加→新ゲームのみの対象設定→確認済みコード/環境JSの配布という具体順を最終差分に合わせて確定する。管理画面の旧版が新IDを扱えない場合は、更新した管理クライアントを先に利用できる手段も確認する。既存全ゲームの一括公開操作は使わない。問題発生時は新ゲームをhiddenにし専用ranking flagと新メニュー追加だけを戻す。児童データ・最高記録・称号・所持品・既存ランキングは削除しない。Rulesを戻す場合も、保存した直前バージョンとの比較なしに古いprototypeを公開しない。
