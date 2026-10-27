# プレイヤー同期 第2弾：確認用Firebaseの追加設定

対象は **manabi-game-landcheck / Spark**。本番manabi-game-landでは操作しない。

## 現在の状態

管理室の認証設定は有効のまま。第2弾のクライアントとRulesを準備したが、児童用匿名認証は実APIで `ADMIN_ONLY_OPERATION` が返ったため未稼働。新Rulesもこのチャットから実プロジェクトへは公開していない。

設定完了前のゲーム・ローカル保存・ショップを維持するため、`preview/spark-config.js` の **playerSyncEnabledはfalse** にしている。管理室の `enabled:true` は維持している。この二つを混同しない。

## 1. 児童用の匿名認証を有効にする

1. Firebase Consoleで **manabi-game-landcheck** を選ぶ。
2. 「Authentication」→「Sign-in method／ログイン方法」。
3. 「プロバイダを追加」→「匿名／Anonymous」。
4. 「有効にする」をオン→保存。

匿名を有効にしてもADMIN_ONLY_OPERATIONが続く場合は、Authenticationの設定にユーザーによるアカウント作成を禁止する項目がないか確認し、エラー内容を開発側へ伝える。Rulesを全公開にはしない。

管理室用メール／パスワードは有効のまま残す。児童へメールやパスワードを入力させる機能ではない。

## 2. 第2弾Rulesを公開する

1. 同じ確認用プロジェクトの「Firestore Database」→「Rules／ルール」。
2. 現在のRulesをコピーして、手元へ退避する。
3. このフォルダーの **[firestore.rules](firestore.rules) 全文**で置き換え、「公開／Publish」。
4. `previewSpark/v1/private/admin` と `private/revocation` は削除・変更しない。UID、enabled、失効時刻もそのまま。

新Rulesには第1弾の管理者認証・名前変更・監査履歴・バックアップの保護が含まれている。管理機能の権限を全員へ開放する設定にはしない。

料金プランの変更・Cloud Functions・Storage・課金アカウントは不要。

## 3. 設定後の有効化と実テスト

上記2設定が済んだら、開発側に「匿名認証とRulesを設定した」と伝える。パスワードは送らない。

続いて開発側で、隔離された `previewSpark/v1/syncTestPlayers` を使うテストを先に行い、`playerSyncEnabled:true` に切り替えて確認用サイトを検証する。テスト用Auth／データを通常のplayers・ランキングへ混ぜない。

実際の児童を同期する前に、確認用のテスト名で次を確認する。

1. 確認用サイトで登録・プレイし、画面の同期状態と管理室の新しいUID・名前・ポイント・最高記録を確認する。
2. 管理室からテスト名を変更し、児童画面と再読み込み後の名前に反映されることを確認する。
3. 通信切断中の回答が端末に残り、再接続後に二重加算されずに同期されることを確認する。
4. 商品購入で選んだ教科のみ減算され、二重購入・古い残高の復活がないことを確認する。
5. adminTest=1のゲームではFirebase同期が始まらないことを確認する。

匿名認証のセッションは管理室とは別のFirebase App名で保持する。児童が管理室の共通アカウントになることはない。

## 取り消し・復旧

同期を止める場合は確認用の `playerSyncEnabled:false` に戻す。管理室は `enabled:true` のまま使用できる。端末データ・Firestore文書を初期化しない。

元の端末データは `manabi_public_preview:mgl_sync_original_v2` に保持する。有効化前にはこのバックアップ自体もまだ作らず、既存保存へ触らない。復旧時は通常の端末データ・同期メタデータの両方を確認し、古いポイントだけを手動で残高へ重ね足ししない。

通常プレイヤーのクラウド文書と操作履歴は削除不可のRulesとしている。テスト用文書も自動で削除しない。削除や復旧が必要になった場合は対象を特定してから扱う。
