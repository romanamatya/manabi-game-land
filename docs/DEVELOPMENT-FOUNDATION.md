# 共通開発基盤：編集・検証・公開手順

編集元は `shared-src/site/` 一つ。ゲーム8本、ランキング、プロフィール、教科別ポイント、称号・報酬、ショップ、管理室のプログラムを両環境の生成で共有する。Firebaseの読み書きは `data-contract.js` と `firebase-store.js`、旧端末保存は `storage-adapters.js` が吸収する。本番公開中のルートは今回変更しない。

## 環境差分

|項目|確認用|本番向け生成|
|---|---|---|
|Firebase|manabi-game-landcheck|manabi-game-land|
|プレイヤー|previewSpark/v1/players/{uid}：schema2|players/{uid}：既存の平坦なフィールド|
|管理権限・履歴・バックアップ|previewSpark/v1/private・audit・backups|productionAdmin/v1/private・audit・backups|
|管理者アカウント|確認用の技術的ID|独立した本番用技術的ID（未設定・未検証）|
|一般プレイヤー同期|falseのまま|falseのまま|
|旧ランキングサービス|確認用では使わない|旧方式専用の別スイッチ、承認待ちでfalse|
|ゲーム|8本|承認済み7本、国語は未公開|
|新算数2本のランキング|確認用ローカル|以前の指示に従い無効|
|生成先|preview/|.release/production/、全スクリプト停止|

FirebaseのWeb公開設定は環境JSONだけに置く。URLや画面からプロジェクトを選択できない。実際のアクセス制御はAuthとRulesが担う。クライアントのプロジェクト検査だけで悪意ある外部通信を防げるという意味ではない。

## 旧データの互換性

本番の既存 points は、全教科の残高・購入履歴を表すとは確認できない。管理室では「旧保存ポイント（教科別内訳なし）」と表示し、存在しない残高や所持品を0・未所持と断定しない。端末の情報を本番へ一括アップロードする処理は追加していない。

平坦なbestStreak等は共通表示へ読み替える。更新は対象ゲームのフィールドだけをmergeし、最高記録はサーバー既存値との最大を保存する。称号は既存獲得履歴と達成記録の和集合で表示する。既存の所持品・appearance・未知の保存フィールドを一括置換しない。管理室からの名前変更は名前と管理メタデータだけを更新し、変更前文書全体を非公開バックアップに保存する。

本番プレイヤーAuthは既存のDEFAULTアプリを利用し、匿名UIDを変更しない。管理室は専用の名前付きアプリで認証する。

端末の旧算数残高mgl_points、社会・英語のゲーム保存、装備、追加算数2本の日別上限を共通財布へ読み替える。読み取りだけでは元データを書き換えない。初回保存前に元の文字列を退避し、財布と旧算数残高はジャーナルで復旧可能にする。古いページが並行して残高を書き換えた場合は自動合算せず、元データを保持して保存を停止する。旧ページを閉じて差分を確認する必要がある。全端末残高の統合・不正ポイント防止を保証するものではない。

## 名前の正本

同期対象プレイヤーの正本はFirestoreのnickname。保存トランザクションで最新文書を読み、存在する名前を古い端末名で上書きしない。onSnapshotで管理者変更をゲーム表示へ反映する。管理者変更後は提案RulesのadminUpdatedAt保護により、旧コードによる名前の取消も拒否する。rename、履歴、変更前バックアップを同一トランザクションにする。競合時は再読み込みし、別管理者による変更を黙って上書きしない。

一般同期OFFの確認用通常プレイヤーは端末内のままで、管理室のFirestoreプレイヤー一覧と同じデータではない。端末間の実反映は今回有効化・実検証しない。Emulatorで同じ保存・管理室ドメイン処理の競合を検証する。

## 開発コマンド

```
npm ci
node tools/build-site.mjs preview
node tools/build-site.mjs production
npm test
npm run test:rules
node tools/check-site.mjs
```

Emulatorはdemo-manabi-foundation配下のローカルのみ。実Firebaseへdeployしない。BUILD-MANIFESTに入力・出力ハッシュを記録し、生成差分を検査する。画像は既存ファイルを参照し、新規制作・差し替えしない。

## 本番適用前の承認事項

1. Firebase Consoleから現在の本番Rulesを取得して退避し、ユーザー提供の基準との差分を再確認する。提供されたRulesは `firebase/production-baseline-provided.rules`（コメント・create/updateの共通化のみ）に保存している。
2. `firebase/production-proposed.rules` は未公開の提案。productionAdmin/v1の権限・履歴・バックアップを追加し、管理者変更済みの名前を保護する。ゲーム別の追加最高記録フィールドを許可するが、新算数2本のランキングを有効化するものではない。名前保護のため、管理者変更済みの名前を古い端末名で送る旧コードの書き込みは拒否される。共通保存コードとの同時切り替えが必要。
3. 本番専用パスワードAuthアカウントとprivate/admin、private/revocationを管理者本人が設定する。パスワードをチャットや公開コードへ送らない。既存Google認証とは別であり、変更承認が必要。
4. 隔離した本番テスト用アカウントで許可・拒否・セッション失効を確認する。実児童の名前やポイントをテストに使わない。
5. Auth確認・Rules承認・機能公開の明示承認後にだけ環境JSONの対応フラグを更新する。一般同期フラグは別承認なしで変更できない。
6. 本番向け生成をレビューし、必要な画像・依存ファイルの存在、UI差分、旧ショップと日別上限の差分を確認する。本番ルートへのコピーは生成コマンドでは行わない。
7. 承認対象のファイルだけ反映し、公開前コミットを記録して公開後の読み込みを確認する。

### Rulesの限界

クライアント採点を信頼する既存範囲は今回置き換えない。提案Rulesは管理者専用操作、名前保護、履歴・バックアップの同時作成を検証する。回答の数学的正しさ、ポイントの不正加算や改ざんの全面防止、全環境の公正なランキングは保証しない。認証済みランキング読み取りは現行の範囲を維持する。

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for administrator-only renames, immutable audit/backup records, and protecting administrator-set names. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

## ロールバック

公開コードは公開前コミットのルートへ戻す。今回の確認用変更の前は4f58ce4e38ec6b9b4bebde3c7a1db30d2e5812f5。Rulesは実適用直前にConsoleから取得した全文を戻す（提供版を無確認で戻さない）。名前保護を戻すと古い名前の再上書きを許す点に注意し、管理者変更を停止して判断する。管理者Authは無断削除せず、専用roleのenabledをfalseにしてアクセス停止する。履歴・バックアップ・既存児童文書は削除しない。

端末の旧データはバックアップキーに保持する。財布のバックアップ復元は同じ端末の全タブを閉じ、現残高・購入履歴と突合して管理者が行う。自動で古い残高へ戻す操作は用意しない。

今回、ランキングのリセット・世代変更・3分間チャレンジ公開・課金設定変更は行わない。

## 本番最終準備（2026-10-28）

最新の切替順序・Console操作・テスト範囲・復旧判断は [PRODUCTION-CUTOVER.md](PRODUCTION-CUTOVER.md) を参照。最新提案はdistributionの記録だけを追加し、新算数2本・国語のランキングキーを許可しない。private/adminのrenameEnabledが欠落またはfalseなら改名を拒否する。以前の全追加記録キーを許可する案から範囲を縮小した。実際の現行Rulesはまだ取得していない。名前変更後は旧Rulesへの単純復帰をせず、互換保存を維持する復旧案をレビューする。
