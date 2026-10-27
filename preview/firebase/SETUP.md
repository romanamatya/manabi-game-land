# 管理室 第1弾：確認用Firebaseの初期設定

2026年10月27日。**ユーザーから確認用Firebase初期設定完了の報告あり。公開Web設定のapiKey・appId取得待ちで、実環境の稼働完了ではない。**

管理室： https://romanamatya.github.io/manabi-game-land/preview/control-room.html

## 1. 確認用プロジェクト

1. [Firebase Console](https://console.firebase.google.com/)→「プロジェクトを追加／作成」。
2. 使用するプロジェクトIDは **`manabi-game-landcheck`**（ユーザー指定・作成済み）。本番の `manabi-game-land` は選ばない。新たなプロジェクト作成は不要。コードはこの確認用IDを明示的に許可する。
3. Google Analyticsは不要。料金プランが **Spark** であることを確認する。課金アカウント、Blaze、Cloud Functions、Storageは不要。
4. 既存の別の確認用プロジェクトを使う場合は、先にデータとRulesを保存する。今回のRulesは第1弾専用で、児童による書き込みはまだ許可しない。ゲームがFirebaseへ書き込み中の環境へ、そのまま適用しない。

## 2. 管理専用ユーザーを作る

1. 左の「構築／Build」→「Authentication」→「始める」。
2. 「Sign-in method／ログイン方法」→「メール／パスワード」を有効にして保存。メールリンク方式、Googleログインは使わない。
3. 「Settings／設定」→「承認済みドメイン」に `romanamatya.github.io` を追加（既存なら不要）。URLのパスは入れない。
4. 「Settings／設定」→「Password policy」で、設定できる場合は最小12文字・Requireにする。
5. 「Users／ユーザー」→「ユーザーを追加」。メール欄は `admin-preview@＜確認用プロジェクトID＞.invalid`。例：IDが `manabi-quest-preview-abc` なら `admin-preview@manabi-quest-preview-abc.invalid`。
6. 自分で決めた12文字以上の十分長いパスワードで作成する。**パスワードはChatGPT・GitHub・Firestoreへ送らない／書かない。** 安全に保管する。
7. 作成されたユーザーの **UID** を控える。UIDはパスワードではない。

このメールは受信しない管理専用の技術的ID。管理室には表示せず、入力も不要。管理室が内部でIDを組み立て、パスワードだけをFirebase Authenticationで照合する。パスワードを公開コードやFirestoreへ保存しない。

## 3. Firestoreと権限

1. 「構築／Build」→「Firestore Database」→「データベースを作成」。**Standard edition**、`(default)` を使う。地域は運用方針に合わせて選ぶ（後で変更不可）。
2. 「本番環境モード／Production mode」でロックして作る。これは**新しい確認用プロジェクトのセキュリティ設定**で、本番マナビクエストを変更する操作ではない。全公開のテストモードは使わない。
3. 「Rules／ルール」へ、このフォルダーの [firestore.rules](firestore.rules) 全文を貼り、「公開／Publish」。必ず確認用プロジェクトIDを確認する。
4. 「データ」→「コレクションを開始」：ID `previewSpark`、ドキュメントID `v1`。フィールド `environment`（string）=`preview`。
5. `previewSpark/v1` の中にコレクション `private`、ドキュメントID `admin` を作る。
   - `uid`（string）：手順2で控えた管理専用ユーザーUID。
   - `enabled`（boolean）：`true`。
6. 同じ `private` にドキュメントID `revocation` を作る。
   - `after`（timestamp）：過去の日時（例：2000年1月1日 00:00）。文字列にしない。
   - `actor`（string）：`console`。

管理権限の場所は `previewSpark/v1/private/admin`。一般プレイヤーも管理室クライアントも、この権限ドキュメントを変更できない。Consoleの所有者だけが登録・変更する。

## 4. GitHub Pagesとの接続

1. 歯車→「プロジェクトの設定」→「全般」→「マイアプリ」→Webアイコン `</>`。
2. アプリ名を「マナビクエスト確認用」にして登録。Firebase Hostingは設定しない。
3. 表示された `firebaseConfig` から `apiKey`、`authDomain`、`projectId`、`appId` を控える。これは公開Web設定であり、秘密鍵やパスワードではない。
4. `preview/spark-config.js` の空欄へ入力する。`expectedProjectId` にも同じ確認用IDを入れる。`authDomain` は `＜projectId＞.firebaseapp.com`。
5. Authentication・権限ドキュメント・Rulesの準備後に `enabled: true` とする。**previewの設定ファイルだけ**を更新する。

```js
window.MANABI_SPARK_CONFIG = Object.freeze({
  enabled: true,
  environment: 'previewSpark/v1',
  expectedProjectId: 'manabi-game-landcheck',
  firebase: {
    apiKey: '公開Web設定のapiKey',
    authDomain: 'manabi-game-landcheck.firebaseapp.com',
    projectId: 'manabi-game-landcheck',
    appId: '公開Web設定のappId'
  }
});
```

上記4項目の公開Web設定と管理者UIDは、必要なら開発側へ伝えてよい。**パスワード・サービスアカウントJSON・秘密鍵は送らない。** このチャットではFirebaseプロジェクト作成・Rules公開・技術ID登録は実施していない。

## 5. 実環境の動作確認

1. 確認用Firestoreで `previewSpark/v1/players/phase1-test-player` を作り、`nickname`（string）=`確認用ねこ`、`status`（string）=`active` を入れる。本番児童データをコピーしない。
2. 管理室で正しいパスワードだけでログインする。「確認用ねこ」→「名前変更」で、新しい名前と変更理由を入力・確定する。
3. 更新・再読み込みで名前が保存されていることを確認。「操作履歴」に変更前後・理由があり、Firestoreの `audit` と `backups` に1件ずつ記録されることを確認する。
4. 間違ったパスワード、通常再アクセス、ログアウト、パスワード変更、一般プレイヤー・未認証の直接通信拒否を実環境でも確認する。

**現在の確認用ゲームは端末内保存であり、中央のFirebaseへ児童情報を同期していない。** 一覧はFirebaseの実ドキュメントだけを表示する。端末データの削除・架空データでの補完・本番データの取り込みはしない。既存端末記録の移行と児童側の同期は、基盤確認後に別途接続する。

## ログアウト・パスワード変更・復旧

- 共有IDなので、今回のログアウトは**全端末の管理セッションを終了**する。Rulesが古い `auth_time` のトークンを拒否。すぐ再ログインして失効エラーになった場合は1〜2秒待つ。
- パスワード変更は現在のパスワードで再認証し、全端末を失効させてから更新する。途中失敗では元のパスワードが残る場合があり、画面にその旨を表示する。
- オフラインでも端末からはログアウトするが、全端末失効には通信完了が必要。失敗時は未完了と表示する。
- Consoleでパスワードを変更した場合も `private/revocation.after` を現在のtimestamp、`actor` を `console` にする。既発行トークンをRulesで拒否するために必要。
- 緊急停止は `private/admin.enabled=false`。復旧はパスワードと失効時刻を確認してからtrueに戻す。
- パスワードを忘れた場合はConsoleで管理専用ユーザーを削除・作り直し、新しいUIDを `private/admin` へ登録する。架空メールへの再設定メールは使わない。

## 保護範囲と制約

- 第1弾Rulesは一覧閲覧、名前変更、履歴・バックアップだけを許可。ランキングリセット、ポイント2倍、公開設定、削除等は許可しない。
- 名前変更・履歴・変更前データは一緒に成功または失敗する。ポイント・称号・ランキング・装備を同時に書き換えると拒否される。
- Firebase Authenticationのサーバー側不正試行対策を使う。独自の厳密な「何回で何分」は未実装。エミュレーターは実サービスの制限を再現しない。
- 同じ端末の認証状態はFirebaseの永続化機能を使う。実ブラウザー再起動後の動作は設定後に検証する。
- 確認用トークンは別のFirebaseプロジェクトの権限ではない。設定ガードも本番ID・apiKey・appId等を拒否する。ただし任意のブラウザー通信すべてを封じるものではなく、本番アクセス権は本番側Rulesによる。今回は本番へ直接通信するテスト・本番Rules変更をしない。
- 共有パスワードなので、履歴の実施者は共通UID。個人ごとの管理者識別はできない。
- Spark無料枠の制限内で利用する。超過時は制限される可能性がある。有料プランやCloud Functionsを追加していない。

## ローカルテスト

このフォルダーでNode.js・Java 17以上を用意して実行する。demoプロジェクトのエミュレーターだけを使い、クラウドへデプロイしない。

```sh
npm ci
npm test
```

実環境用は `firestore.rules` のみ。`tests/challenge-prototype.rules` は研究用で、実環境のRulesには含めない。`firebase.json` に本番IDや課金設定は含めていない。

公式資料：[パスワード認証](https://firebase.google.com/docs/auth/web/password-auth)、[RulesとgetAfter](https://firebase.google.com/docs/firestore/security/rules-conditions)、[セッション失効](https://firebase.google.com/docs/auth/admin/manage-sessions)、[認証状態の永続化](https://firebase.google.com/docs/auth/web/auth-state-persistence)。
