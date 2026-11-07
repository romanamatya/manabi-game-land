# Firestore Rules の公開手順

この導入段階で本番 `manabi-game-land` に対して実行できるのは `inspect` と `plan` です。実際の公開と復旧は確認用 `manabi-game-landcheck` のみに限定しています。

## 本番の照合基準

`firebase/production-release-baseline.rules` は、2026-11-06（日本時間）に手動公開したと報告されたプロフィール保護版。公開時の写しと検証済みファイルの内容を照合済み。SHA-256 は `cc25070db4219fbf7881ba3aa8c4c58f062f31b493b41c250e38ffa392ec0dfb`。

本番 Rules API での有効版の確認は初回の読み取り認証設定後に `production / inspect` で実施する。不一致なら公開候補の作成や公開に進む前に、差分と公開経緯を確認する。基準ファイルを公開候補として自動採用しない。

## PR #45 の確認用リハーサル

初回は既存の確認用 Firestore に、現在の Rules からコメントを1行だけ足したコピーを公開し、元の Ruleset に戻す。現行全文は WIF 認証後に API から取得し、公開成果物には含めない。作業用の全文は非公開の一時ファイルに保存し、Emulator 終了後に削除する。初回検証のために Console から全文を転記する必要はない。

1. 確認用 `manabi-game-landcheck` に書き込み用 WIF を用意する。リポジトリ ID と所有者 ID に加え、初回だけ `ref == 'refs/pull/45/merge'`、`workflow_ref == 'romanamatya/manabi-game-land/.github/workflows/firestore-rules-release.yml@refs/pull/45/merge'`、`environment == 'firebase-rules-preview-write'`、`event_name == 'pull_request'` を条件にする。GitHub Environment の選択ブランチ規則にも `refs/pull/45/merge` を追加し、承認者を設定する。
2. GitHub Environment の変数を設定してから、PR #45 に `preview-rules-rehearsal` ラベルを付ける。該当ラベルの追加イベントでだけ実行し、通常の PR CI からは書き込まない。Actions の `rehearse-preview` ジョブで対象コミットを確認し、承認する。
3. 同じ実行で、現行とコメントだけの候補を Emulator で検証し、現行との差分がコメント1行であることを担保して公開する。続いて、公開した Ruleset がそのまま有効であることを照合し、元の Ruleset に復旧する。実行概要の `compare`・`deployed`・`restored` を確認する。途中でエラーが出た場合は `compare` にある旧 Ruleset ID を控え、有効版を照合するまで再実行しない。
4. マージ後は PR 専用の信頼条件と Environment の許可規則を外し、確認用の通常操作は `main` から手動実行する。本番用の権限は確認用の結果をレビューした後に別途設定する。

## 初回設定

1. GitHub の Settings → Environments で `firebase-rules-preview-read` と `firebase-rules-preview-write` を作成し、対象ブランチを `main` に限定する。書き込み側に Required reviewers を設定する。実行者と承認者が同一の場合は Prevent self-review をオフにする。別担当者が承認する運用ならオンにする。公開リポジトリでは利用できるが、実際の設定と承認者は管理画面で確認する。
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
