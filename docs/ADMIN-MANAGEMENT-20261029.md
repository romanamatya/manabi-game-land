# 管理室拡張：確認用実装と有効化手順

## 状態

共通編集元 shared-src/site を変更。公開設定、お知らせ、ランキングのバックアップ・世代リセット、ポイント2倍と100pt上限を実装した。学習分析・回答履歴のサーバー収集は追加していない。

確認用ビルド 6b47ef680515。一般プレイヤー同期はオフのまま。新管理機能の managementEnabled は実Firebaseで追加Rulesが確認できるまで false。未有効化の機能を完成扱いしない。

管理室 URL: https://romanamatya.github.io/manabi-game-land/preview/control-room.html

## タブ

- プレイヤー：既存の一覧、表示、名前変更を維持。
- ゲーム・キャンペーン：10ゲームの公開状態、ワンクリック切替、期間・手動終了、同時開催と履歴。追加Rules適用後に有効化。
- お知らせ：作成・更新・非表示。旧 previewSpark/v1/settings/notice が存在する場合は編集値として読み込み、旧文書を削除しない。
- ランキング：対応先だけの閲覧、退避、世代リセットを実装。現在の確認用ランキングは端末内保存、一般同期もオフなので managedRankingGameIds=[] とし、実環境の10ゲームは「管理対象外：共有ランキングは未接続」と表示する。見かけだけ共有対応にしない。プレイヤー一覧のFirebase保存済み最高記録の閲覧は維持。
- 操作履歴：旧改名履歴に新操作履歴を合わせて表示。バックアップ・操作履歴は同一トランザクションで保存。

## ポイント

通常1pt・50pt上限、2倍中2pt・100pt上限。同日の獲得ポイントを通算し、開始・終了で日別実績をリセットしない。通常へ戻って50ptを超えていても残高を減らさず、通常問題への追加付与を停止する。開始時の倍率・上限を回答送信と再送まで保持する。残り上限が1ptの場合は1ptまで付与する。日本時間0時で日別実績のみ切り替える。教科別残高・既存購入・称号を保持する。

既存のローカル保留キューと獲得IDで再送・二重タップを排除。キュー追加・確定・削除は端末間ではなく同一ブラウザーのWeb Locksで直列化。一般同期オフを維持するため、複数端末の共有残高を保証する新機能は追加していない。採点は従来のクライアント採点を維持し、改変されたクライアントによる不正まで防止したとは主張しない。

## 公開設定と通信障害

有効化後は児童画面でFirebaseから公開設定を取得する。ゲーム一覧と直接URLの両方に適用する。ゲーム開始前の入力障壁、設定取得失敗・オフライン時の停止、稼働中の非公開変更を実装。公開・非公開でポイント・最高記録・称号・所持品は削除しない。静的JavaScript自体の配布を秘密化する仕組みではない。

## 保存先

確認用 manabi-game-landcheck / previewSpark/v1 にのみ接続。
- gameSettings/{game}: 公開状態、世代、キャンペーン、改訂番号
- notices/current: 児童向け公開文面
- managementAudit/{id}, managementBackups/{id}: 管理者限定、追記のみ
- rankingBackups/{id}: 管理者限定、記録の退避
- campaignHistory/{id}: 管理者限定、開始・終了履歴

プレイヤー文書・称号・最高記録はランキングリセットでも変更しない。新世代に旧記録を自動再登録しない。ランキングの一括取得は最大1000人までで、超過時は部分バックアップのままリセットせず停止する。新世代への共有記録書き込みは将来共有ランキングを接続する作業として別途検証が必要。

## 検証結果

- 単体・既存互換性：42件成功。
- Auth / Firestore Emulator：既存回帰を含む35件成功。最終管理機能8件も再実行成功。
- 公開設定・お知らせ・2倍設定の操作、保存、再読み取り、バックアップ、改名維持、ランキング世代と700問記録保持をEmulatorで検証。
- 無認証・一般プレイヤー・不正provider・失効セッションの管理操作拒否、権限自己変更拒否、他人のデータ拒否、履歴とバックアップを伴わない書換え拒否、追加フィールド・過大文字列拒否を検証。
- 実Firebaseは新領域の未認証読み取り403を確認しただけ。管理者の実ログイン・新機能の実保存は未検証。
- この作業用ブラウザーのFirebase ConsoleはGoogleログイン画面。CLIも未認証。既存Firestoreのeditionは実Consoleで未確認。既存Standard SDK/Rules構成を維持し、Emulatorで検証した。データベースの新規作成・移行は行わない。

再実行:
```
npm run build:both
node tools/check-site.mjs
node --test tools/foundation.test.mjs tests/management-policy.test.mjs tests/management-economy.test.mjs tests/economy-replay.test.mjs tests/storage-contract.test.mjs tests/record-safety.test.mjs tests/math-concepts.test.mjs tests/multiplication-improvement.test.mjs
node_modules/.bin/firebase emulators:exec --project demo-manabi-management --only auth,firestore --config firebase/preview-management-emulator.json "node --test tests/rules/*.test.mjs"
```

## 実環境への適用

1. Firebase Consoleに本人がログインする。パスワードをチャットへ送る必要はない。
2. プロジェクトIDが manabi-game-landcheck であることと、既存Firestore(default)のeditionを確認。
3. 現行Rules全文を退避し、firebase/preview-phase2-baseline.rulesとの整合を再確認する。想定外差分があれば上書きしない。
4. firebase/preview-management.rules（preview/firebase/firestore.rulesと同内容）を確認用Firestoreだけへ適用。既存の改名・同期Rulesは維持し、末尾に管理機能を追加する。
5. 無認証の公開設定読み取りがpermission-deniedでなくなること、管理文書の無認証書き込み拒否を確認。
6. environments/preview.json の managementEnabled を true にして再生成し、確認用ファイルだけを反映する。playerSyncEnabled は false、managedRankingGameIds は空配列のまま。
7. 本人が管理室の既存パスワードを画面へ入力する。新機能をテスト対象の設定だけで操作・再読み込み・元の状態へ戻す。児童文書はテストに使用しない。
8. ゲーム一覧・直接URLの非公開制御、お知らせ、2倍固定、100pt上限を実Firebaseと隔離端末記録で検証。

失敗時は managementEnabled:false へ戻して確認用コードを再生成する。新設定・監査文書を削除せず保持。Rulesは退避版に戻せる。プレイヤー・端末記録を削除しない。

## 本番への残作業

本番では管理機能を有効にしていない。本番Rules・Auth・管理権限・児童データは未変更。

firebase/production-management-proposed.rules は案のみ。production-proposed.rulesを基礎に追加設計を別ファイルで準備したもので、現在公開中Rulesへの最小差分確定版ではない。実際の現行Rules再取得、専用認証の確認、公開設定を参照する本番児童側の接続、共有ランキングと保存方式の対応、Emulator/実テスト、個別承認が必要。renameEnabledを勝手に有効にしない。

## 2026-10-29 Rules公開後の有効化

ユーザーが通常Chromeで確認用Rulesを公開した後、実Firebaseの公開設定getは404（文書未作成）、private/admin getは403、未認証のgameSettings更新は403であることを確認。設定の公開読み取りと管理書き込み制限が反映されている。管理者パスワードは取得していない。

preview managementEnabled:trueへ変更。playerSyncEnabled:false、managedRankingGameIds:[]を維持。本番用生成物は安全停止のまま公開しない。トップURL /preview/ からもお知らせを表示できるよう調整。42件の回帰テストと生成物ハッシュ検査を再実行して成功。

実管理者による新機能の保存・再読み込みはログインが必要で、未検証。公開のみで全機能の実環境検証完了とは扱わない。
