# Firestore Rules の公開手順

本番 `manabi-game-land` では、初期状態で `inspect` と `plan` が利用できます。本番公開・復旧は書き込み用設定と承認ゲートを確認してから有効化します。

## 本番の照合基準

`firebase/production-release-baseline.rules` は、2026-11-06（日本時間）に手動公開したと報告されたプロフィール保護版。公開時の写しと検証済みファイルの内容を照合済み。SHA-256 は `cc25070db4219fbf7881ba3aa8c4c58f062f31b493b41c250e38ffa392ec0dfb`。

本番 Rules API の有効版は `production / inspect` で照合する。不一致なら公開候補の作成や公開に進む前に、差分と公開経緯を確認する。基準ファイルを公開候補として自動採用しない。

## PR #45 の確認用リハーサル（実施済みの記録）

初回は既存の確認用 Firestore に、現在の Rules からコメントを1行だけ足したコピーを公開し、元の Ruleset に戻す。現行全文は WIF 認証後に API から取得し、公開成果物には含めない。作業用の全文は非公開の一時ファイルに保存し、Emulator 終了後に削除する。初回検証のために Console から全文を転記する必要はない。

1. 確認用 `manabi-game-landcheck` に書き込み用 WIF を用意する。リポジトリ ID と所有者 ID に加え、従来の `main` 条件とは別の許可分岐として初回だけ `ref == 'refs/pull/45/merge'`、`workflow_ref == 'romanamatya/manabi-game-land/.github/workflows/firestore-rules-release.yml@refs/pull/45/merge'`、`environment == 'firebase-rules-preview'`、`event_name == 'pull_request'` を条件にする。GitHub Environment の選択ブランチ規則にも `refs/pull/45/merge` を追加し、承認者を設定する。
2. GitHub Environment の変数を設定してから、PR #45 に `preview-rules-rehearsal` ラベルを付ける。該当ラベルの追加イベントでだけ実行し、通常の PR CI からは書き込まない。Actions の `rehearse-preview` ジョブで対象コミットを確認し、承認する。
3. 同じ実行で、現行とコメントだけの候補を Emulator で検証し、現行との差分がコメント1行であることを担保して公開する。続いて、公開した Ruleset がそのまま有効であることを照合し、元の Ruleset に復旧する。実行概要の `compare`・`deployed`・`restored` を確認する。途中でエラーが出た場合は `compare` にある旧 Ruleset ID を控え、有効版を照合するまで再実行しない。
4. マージ後は PR 専用の信頼条件と Environment の許可規則を外し、確認用の通常操作は `main` から手動実行する。本番用の権限は確認用の結果をレビューした後に別途設定する。

## 初回設定

1. GitHub の Settings → Environments で既存の `firebase-rules-preview` を書き込み用として再利用し、対象ブランチを `main` に限定する。マージ後に読み取り操作を使う段階で、別に `firebase-rules-preview-read` を作成する。書き込み側に Required reviewers を設定する。実行者と承認者が同一の場合は Prevent self-review をオフにする。別担当者が承認する運用ならオンにする。公開リポジトリでは利用できるが、実際の設定と承認者は管理画面で確認する。
2. Google Cloud の IAM と管理 → Workload Identity 連携で、確認用プロジェクトの GitHub OIDC プロバイダを設定する。発行元は `https://token.actions.githubusercontent.com`。IAM、Resource Manager、Security Token Service、IAM Service Account Credentials、Firebase Rules API の有効化状況を確認する。組織ポリシーで許可されていることも確認する。
3. OIDC では数値の `repository_id` と `repository_owner_id`、`ref`、`environment`、`workflow_ref` を照合する。対象はリポジトリ ID `1430974446`、所有者 ID `346875777`、`refs/heads/main`、`romanamatya/manabi-game-land/.github/workflows/firestore-rules-release.yml@refs/heads/main`。環境ごとに別の信頼条件とサービスアカウントを使う。プールを共有する場合、SA の IAM バインディングは環境も含む専用属性に限定し、リポジトリ全体を許可しない。対象 ID にサービスアカウント上で `roles/iam.workloadIdentityUser` を付与する。
4. 読み取り用サービスアカウントに `firebaserules.releases.get`、`firebaserules.rulesets.get` を付与する。書き込み用にはこの2つと `firebaserules.rulesets.create`、`firebaserules.releases.update` をカスタムロールで付与する。権限は確認用プロジェクトだけに適用する。Firestore文書、インデックス、既存Ruleset削除の権限とサービスアカウントの秘密鍵は不要。
5. 各 GitHub Environment の変数に `RULES_WIF_PROVIDER` と `RULES_SERVICE_ACCOUNT` を登録する。WIF プロバイダの値はプロジェクト ID ではなく番号を含む完全名にする。認証情報を出力や成果物に含めない。

本番の読み取りを自動化する場合は、別途許可後に `firebase-rules-production-read` と読み取り専用の信頼設定を追加する。本番の書き込み環境や権限は別の導入段階でレビューする。

## 初回照合と確認用のリハーサル

1. 権限のある読み取り経路で実際の有効版を取得する。ローカルから実行する場合は、短期トークンを環境変数 `RULES_ACCESS_TOKEN` で渡し、任意で `RULES_BACKUP_PATH` に新規の非公開ファイルを指定して、`node tools/firestore-rules-release.mjs inspect <project>` を実行する。Actions の `inspect` は Ruleset ID とハッシュのみを保存する。公開リポジトリの Actions 成果物に Rules 全文を添付しない。
2. 公開可能な内容か確認したうえで、照合済みの確認用の全文を `firebase/preview-release-baseline.rules` に登録する。同じ基準から、レビュー用候補を `firebase/preview-release-candidate.rules` に用意する。本番の計画用ファイルは `firebase/production-release-baseline.rules` と `firebase/production-release-candidate.rules`。取得前の候補を基準として流用しない。
3. Actions の `Firestore Rules release rehearsal` を `main` から `preview / plan` で実行する。候補そのものを Emulator に読み込み、成功後にライブ版を照合する。改行の CRLF だけを正規化した SHA-256 が基準と異なれば停止する。計画の実行概要で差分に対応するコミット・ハッシュを確認する。
4. `preview / deploy` を実行し、承認待ちになることを確認する。承認後に確認用の既定 Firestore だけが切り替わったことを実行結果で確認する。保存した旧 Ruleset ID を使い `preview / rollback` を実行する。復旧でも旧ソースの Emulator テストと承認を経て、有効版の候補・旧 Ruleset のハッシュを照合する。復旧前に公開処理が完了したことを確認する。
5. GitHub Actions の直列実行は Console 操作までロックしない。公開作業中の同時更新は避ける。REST 更新前に Ruleset ID、更新時刻、ハッシュを再確認するが、確認と更新は単一の原子的操作ではない。途中で失敗した場合は現在値を取得し、反映状況を確かめてから再実行する。旧 Ruleset は削除せず、承認時の ID とハッシュを復旧の控えに使う。

PR の CI は既存の研究用テストフィクスチャで Emulator の動作を検証する。実際の公開ジョブはコミット済みの候補を別途テストする。対象ゲームのランキング・公開設定を変える候補を追加するときは、該当する既存の Rules 回帰テストも同じ候補に対して追加する。

## 本番公開と復旧の有効化

本番の読み取りは実行 [42444901480](https://github.com/romanamatya/manabi-game-land/actions/runs/42444901480) で確認済み。有効だった Ruleset は `ab288814-8d4f-4639-af47-fb852486d140` で、上記基準と一致した。

1. まず同じワークフローを `main / preview / rehearse` で実行する。既存の `firebase-rules-preview` を書き込み承認用として使い、比較用には `firebase-rules-preview-read` を用意する。どちらも確認用プロジェクト、`main`、このワークフローのみに限定する。実行の `compare` が成功し、`rehearse-preview` が承認待ちの時点で、公開ログが始まっていないことを確認する。
2. 承認後は現行とコメントだけを追加した候補を Emulator で検証する。実行概要で `deployed` のハッシュが `compare` の候補ハッシュと一致し、`drift-rejected` で公開前の古い計画が拒否され、`restored` の ID とハッシュが開始時と一致することを確認する。途中で失敗した場合は `preview / inspect` で現在値を取得し、元の ID を確認するまで再実行を止める。
3. 上記4項目を確認し、最終設定の承認を得てから、本番に `manabi-rules-production-write@manabi-game-land.iam.gserviceaccount.com` を作る。専用 WIF プールとプロバイダを使い、上記のリポジトリ ID・所有者 ID、`main`、ワークフローに加え、`environment == 'firebase-rules-production-write'`、`event_name == 'workflow_dispatch'` を条件にする。この条件を満たす主体だけに当該サービスアカウントの `roles/iam.workloadIdentityUser` を与える。本番のカスタムロールには上記の Rules 用4権限だけを含める。既存の `firebase-rules-production-read` とアカウントは変更しない。
4. GitHub の Settings → Environments で `firebase-rules-production-write` を作り、Selected branches and tags で `main` を許可する。Required reviewers を登録し、管理者による承認の迂回を無効にする。別々の担当者が実行・承認できる場合は Prevent self-review をオンにする。1人運用では管理者が明示的に承認する Environment を維持し、Work が候補作成・テスト・実行準備を担当する。同一 GitHub ID で実行する場合は Prevent self-review をオフにすることについて明示の合意を得る。承認者を登録できない間は有効化を止める。
5. 書き込み用 Environment に WIF 変数2つを登録する。承認者・許可ブランチ・OIDC 条件をレビューし、未承認では保護ジョブが実行されないことを確認した後、リポジトリの Actions 変数 `RULES_PRODUCTION_WRITE_ENABLED=true` を設定する。未設定では本番の公開・復旧は選択段階で停止する。

公開候補は PR で基準との差分をレビューし、`firebase/production-release-candidate.rules` としてコミットする。候補が存在しなければ公開不可。承認者は実行概要のコミット、旧 Ruleset ID・ハッシュ・更新時刻、候補ハッシュを照合する。承認後に同じ計画を再計算し、API が返す現行 ID・更新時刻・ハッシュを PATCH 直前にも照合する。GitHub 実行は直列だが Console との競合は原子的に排除できないため、同時に手動公開しない。

成功条件は `verify-production` まで緑になること。読み取り専用アカウントで有効 Ruleset を再取得して公開レシートと照合する。失敗時は再公開を押さず、有効版を読み取る。旧 Ruleset ID とハッシュを実行概要に記録し、対応するソースはレビュー済みの Git 履歴に保管する。旧 Ruleset は削除しない。

復旧時は、現行の公開版に対応する候補ファイルと、戻したい旧ソースに対応する基準ファイルを揃える。基準ファイルを更新済みなら、復旧専用 PR でこの組を用意する。 `production / rollback` に公開前レシートの旧 Ruleset 完全名を指定する。旧 ID のソースと Emulator 検証済みファイルを照合し、承認後に旧 Ruleset へ切り替える。復旧も `verify-production` の成功で完了とする。通常公開と復旧後は、次回に向けて有効版を基準に更新する。

## P0 の本番確認手順

以下は実施前に担当者と削除経路を確認する手順。既存児童の UID やデータを使わず、ゲーム画面・管理室の通常一覧は開かない。ランキングへの書き込みは行わない。

1. 独立したブラウザープロファイルで本番 Firebase Auth に新規の匿名テストアカウント A と B を作成する。2つの UID をテスト専用として記録し、既存のログイン状態から切り替えない。
2. A として自分の UID の `players/<AのUID>` だけに、識別できる架空名の `nickname` を持つ最小文書を作成する。B のプロフィール文書は不要。A の UID は作成直後の Auth から取得する。作成に失敗した場合は停止する。
3. Firebase Web SDK のサーバー取得を使う。A から `getDocFromServer` で A の文書の取得成功、B から同じ文書の `permission-denied` を確認する。A から `where(documentId(), '==', AのUID)` に限定した `getDocsFromServer` が `permission-denied` になることを確認する。管理者は別セッションで通常どおり再認証し、同じ限定クエリで A の1件だけが取得できることを確認する。結果には成否のみを記録する。
4. `players` はクライアントからの削除を禁止している。事前に権限のある運用者を確保し、終了時は Firebase Console の Firestore で A の正確なドキュメントパスに直接移動してテスト文書だけを削除し、Authentication で記録した A・B の UID のテストアカウントだけを削除する。コレクション削除や一括削除を使わない。削除できる運用者を確保できない場合はテスト文書を作らない。
