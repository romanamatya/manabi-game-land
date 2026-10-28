# 共通ソースからの確認用・本番候補ビルド

ゲーム・ランキング・ポイント・称号の編集元は `shared-src/site/` です。環境ごとの Firebase 接続先、公開するゲームID、ランキング対象IDは `environments/preview.json` と `environments/production.json` に分離します。共有ソースに Firebase の接続値を埋め込まず、URL パラメーターで接続先を切り替えません。

## 標準コマンド

- `npm run build:preview` — 共通ソースから `preview/` を生成。確認用Firebaseだけを指定し、一般プレイヤー同期は無効のまま。
- `npm run prepare:production` — 同じ共通ソースから `.release/production/` に本番候補を生成。公開ガードが閉じている間はスクリプトを停止した確認用成果物を出す。
- `npm run build:both` — 上記を連続実行。
- `npm test` — JavaScript構文、記録・環境契約、ビルド成果物、共通ゲーム対応の検査。
- `npm run test:rules` — demoプロジェクトのAuth/Firestore EmulatorだけでRulesを検査。本番Firebaseへの接続・公開はしない。

ビルドIDは共通ソースと環境設定のハッシュから作るため、変更時は両環境のHTML・JS・CSS参照がまとめてキャッシュ更新される。各 `BUILD-MANIFEST.json` にはビルドID、対象プロジェクト、ゲームID・表示名・最高記録フィールド・ランキング有効状態、各ソース/生成物のSHA-256を記録する。

## ゲーム対応の確認

公開予定のゲームは `gameIds`、共有ランキングの対象はその部分集合 `rankingGameIds` で指定します。ビルドは未登録ゲームID、重複ID、公開ゲームではないランキングIDを拒否します。同じゲームID・名称・記録フィールドを両環境のmanifestで照合します。環境ごとに違うのはFirebaseプロジェクトと明示された公開対象です。

## 本番反映の境界

本番候補はライブのルート `index.html` や公開ディレクトリへ書き込みません。`productionReleaseApproved`、本番Auth/Rules確認、同期、管理室の各ゲートは現状 false のままです。候補を公開するには、本番の現行Rulesと書込データ契約を再確認し、対象ゲーム・保存フィールド・必要なRulesを個別に承認した後、別手順でレビュー・公開します。候補の生成成功だけでは本番公開を意味しません。

## 現在確認済みの対応

共通カタログはゲームID、表示名、記録フィールドを保持します。例：`distribution` → 「分配のきまり①」 → `distributionBestStreak`。環境別manifestをテストで比較し、同じ共通ソースが使われていることと、Preview/Production のprojectIdが異なることを検証します。既存の児童データはビルド時に読み書きしません。
