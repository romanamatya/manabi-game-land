# 確認用Firebase 接続状態

2026年10月27日。対象：manabi-game-landcheck（Spark）。

## 今回の反映

- ユーザーから提供された登録済みWebアプリの公開firebaseConfigを正確に設定。
- expectedProjectId、projectId：manabi-game-landcheck。
- authDomain：manabi-game-landcheck.firebaseapp.com。
- appId：1:499579497285:web:b272cb00a535b583a3ec2c。
- enabled:trueへ変更。管理者パスワード・秘密鍵は取得・要求・保存していない。
- spark-auth.jsの明示的な確認用許可と本番ID・既知の本番apiKey/appId拒否を維持。
- 古い設定が残らないよう管理室の参照バージョンを更新。

## 実施した確認

- 提供値と設定ファイルの一致、enabled、環境名、projectId・authDomain・expectedProjectIdの整合、appIdとmessagingSenderIdの整合を確認。
- 本番プロジェクトと既知の本番apiKeyへ差し替えた設定が引き続き拒否されることを確認。
- Firebase Authenticationの公開プロジェクト設定取得がHTTP 200。返却された番号499579497285と、登録済みauthDomainが今回の構成に一致。
- 実Firebaseの管理者ログイン、プレイヤー一覧、名前変更、保存・再読み込み、ログアウトは管理者本人によるテスト待ち。これらを成功済みとは扱わない。

## 管理者本人のテスト

https://romanamatya.github.io/manabi-game-land/preview/control-room.html?v=ready-20261027

1. 上記URLを開き、管理者本人が登録したパスワードだけを入力する。パスワードをチャットへ送らない。
2. 一覧を確認し、確認用テストプレイヤーがある場合だけ名前変更を試す。
3. 更新・再読み込みで名前が残ることと、操作履歴を確認する。
4. ログアウト後、管理画面が閉じることを確認する。

一覧は確認用Firestoreのplayersだけを表示する。現在端末内だけにある確認用ゲーム記録は自動取り込みしない。一覧が空でも接続エラーとは限らない。

管理室が内部で利用する技術IDは admin-preview@manabi-game-landcheck.invalid。登録済みユーザーと一致している必要がある。メール入力欄は表示しない。

今回の変更はpreview内だけ。本番ファイル・本番Firebase・Rules・ポイント・ランキング・称号・ショップ・課金設定は変更していない。
