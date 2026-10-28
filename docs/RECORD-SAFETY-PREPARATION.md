# 記録保存の安全化・適用前準備（2026-10-28）

本番のRules・認証・児童データ・公開中ファイルは変更していない。管理室公開・一般同期有効化・renameEnabledの変更は行っていない。本番用の共通出力はruntimeBlocked=trueのまま。

## 書き込み経路の調査

|経路|状態と対応|
|---|---|
|公開中index.htmlの登録・外見保存|端末名で直接setDocする。レビュー専用生成物では読み取り付き取引とcanonicalNicknameに変更|
|公開中index.htmlのmglSaveScore|名前・ポイント・最高記録を直接送る。生成物ではlegacyScorePatchで正式名と大きい方の記録を保持|
|公開中social-score-sync.js|各ゲームの保存先。既存取引の中で正式名を取得し、端末にも戻す生成物を用意|
|共通home-data.js / social-score-sync.js|共通Firestore storeを呼ぶ。既存文書の名前が不正・欠落していれば端末名で埋めず停止するよう補強|
|共通firebase-store.js|saveProfile・saveLegacy・renameを確認。取引とmergeで対象外のフィールドを保持|
|previewのplayer-sync-api.js|新規作成時だけニックネームを使い、既存文書の更新ではnickname/status/管理メタデータを送らない。一般同期オフを維持|
|認証のrevocation更新|プレイヤー保存とは別の管理操作。今回変更なし|

公開中のrootとgamesを対象に書込APIを検索した結果、プレイヤーの直接書込みは上記indexとsocial-score-syncに集約されていた。ゲーム固有の端末保存・連続正解計算は変更していない。

## 段階1：分配記録だけのRules案

firebase/production-distribution-only.rulesは受領した現行RulesにdistributionBestStreakだけを追加した案。自分の文書のみ、任意の非負整数。更新時の削除・減少・文字列・小数を拒否する。管理権限・履歴の許可、新ゲームの記録項目は追加しない。旧4ゲームのフィールド検証や既存の読み取り権限は変更しない。

Emulatorで通常保存、ランキング読取、他の記録・外見保持、他人の書込拒否、未認証拒否、管理履歴保存拒否、新ゲームフィールド拒否を検証する。

重要：分配フィールドを保存した後に旧Rulesへ丸ごと戻すと、hasOnlyにより他ゲームの更新も拒否される。復旧時は分配の送信を止めても、追加済みフィールドの許可は残す。記録を消して回避しない。

## 段階2：公開中の旧保存経路の互換修正版

node tools/prepare-legacy-record-safety.mjs

.release/legacy-record-safety/にindex.htmlとsocial-score-sync.jsを生成する。公開中ルートへは書き込まない。共通のshared-src/site/data-contract.jsを参照する。元ファイルの想定文字列が変わった場合は生成を停止する。構文チェックと元ファイル不変のテストを追加済み。

共通基盤全体を公開せずに既存保存経路を先に修正できるが、この生成物の本番公開には別承認が必要。公開対象は旧ホーム・スコア同期・共通データ契約の3ファイルに限定して再レビューする。

## 段階3：管理室

本番の専用UID・role・revocationは未確認。メール/パスワード有効はユーザー確認済み。役割文書を作る場合もrenameEnabled=falseとし、管理者による実改名はまだ許可しない。Emulator上だけtrueの隔離fixtureで改名後の保存を確認する。

改名・変更前バックアップ・履歴は同一取引で保存し、名前以外のポイント・記録を改名処理で変更しない。履歴とバックアップは管理者だけ読める。原本の氏名不正時は自動修復しない。

## 段階4：個別承認後の本番操作

1. 現ConsoleのRules全文と公開中コミットを再退避し、受領版との差を確認。
2. 分配記録のみのRules案を承認後に公開。テスト専用UID・保存対象を事前に明示する。
3. 旧保存経路の互換修正版を別承認で公開。全端末で古いページを閉じ、再読込する。匿名Auth・端末保存は消さない。
4. 正式名を保持した通常保存・ランキング読取を専用UIDで確認。実児童の名前は変更しない。
5. 管理室の認証・Rules・公開も別承認。renameEnabled=falseで検証を継続。
6. 最後に別承認でrenameEnabled=trueとし、専用プレイヤーだけを改名して再保存・履歴・記録保持を確認。

旧クライアントのまま改名を有効化すると保存拒否が生じるため、無停止や全端末の自動更新は保証しない。ネットワーク障害・権限エラー時も端末記録を削除しない。

## 安全性の範囲

今回の検証はdemo-*プロジェクトのAuth/Firestore Emulatorとローカルテスト。本番での実ログイン、実児童データ、全授業端末の更新は未検証。クライアント採点の改ざんや既存レガシーポイント制度全体の不正防止を保証するものではない。既存Rulesの緩いpoints/appearance等の検証は互換性のため今回一括変更しない。

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for owner-scoped distribution record writes and preservation of unrelated existing fields. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

## 実施済みテスト結果

- ローカル自動テスト51件成功（旧ゲームの数学・保存・環境検査を含む）。
- Auth/Firestore Emulator26件成功。分配のみの追加、改名後の分配保存、700問・他教科記録・外見・履歴の保持、権限拒否、旧Rulesへの単純復帰失敗を含む。
- Emulatorはdemo-*の隔離プロジェクトのみ。Firebase CLIの実プロジェクトへのdeployコマンドは実行していない。
- 本番用生成物は別フォルダーで作成し、構文検査を実施。公開中index.html/social-score-sync.jsの内容不変を自動テストで確認。
- renameEnabled=falseで拒否されることと、Emulator専用のtrue fixtureで将来の改名が通ることを別々に検証した。実Firebase上の値は変更も確認もしていない。
