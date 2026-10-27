# 確認用Firebase 接続作業の状態

2026年10月27日。対象：manabi-game-landcheck（Spark）。

## 反映した内容

- spark-auth.jsでmanabi-game-landcheckを明示的に許可。ローカルテスト用demo-manabi-preview以外の別プロジェクトは拒否。
- 本番manabi-game-land、既知の本番apiKey/appId、誤ったauthDomainの拒否を維持。
- spark-config.jsのexpectedProjectId/projectId/authDomainを設定。
- apiKey/appIdは未取得のため空欄、enabled:falseを維持。接続完了とは扱わない。
- ブラウザーキャッシュ用の参照バージョンを更新。

## 今回実際に確認したこと

- 構成チェック5件成功：指定ID許可、本番拒否、未承認ID拒否、環境・ドメイン・既知の本番認証設定の混在拒否、空欄・無効設定で停止。
- 実Firebaseの未認証GETで previewSpark/v1/private/admin と previewSpark/v1/players/phase1-test-player は両方403 PERMISSION_DENIED。文書の内容は取得していない。
- 未認証の書き込み、一般プレイヤー認証によるアクセス、実管理者ログイン、名前変更、保存、再読み込み、ログアウトは今回の実Firebaseでは未検証。
- 本番データ・本番側ファイル・Rules・課金設定は変更していない。

## 未完了の理由・次の操作

登録済みWebアプリのapiKey/appIdを取得するFirebase連携は現時点で未接続。
公開Hosting設定の /__/firebase/init.json は404だった。これは公開Web設定がこの場所から取得できなかったという意味であり、Authentication・Firestoreの不具合を示すものではない。取得目的でHostingを新設する必要はない。

公式Firebase連携を追加して確認用プロジェクトの登録済みWebアプリ設定を読むか、Firebase Console → 歯車 → プロジェクトの設定 → 全般 → マイアプリ → Webアプリ → SDKの設定と構成のfirebaseConfigから公開設定を渡す。

パスワード・秘密鍵・サービスアカウントJSONは不要。パスワードを取得・要求・保存しない。

公開設定がそろったらapiKey/appIdを照合してenabled:trueに変更し、管理者本人がサイトでパスワードを入力する方法で実認証テストを進める。管理者のパスワードを開発側へ送らない。
