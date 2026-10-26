# ログイン不要の確認用サイト

- 本番： https://romanamatya.github.io/manabi-game-land/
- 確認用： https://romanamatya.github.io/manabi-game-land/preview/

既存のGitHub Pages（mainのルート）を維持し、preview/だけを追加する。本番のファイルは上書きしない。
確認用では `preview:true` を固定。端末保存キーは `manabi_public_preview:`（管理者テストは `manabi_public_preview_test:`）。本番のキー・Firebaseデータとは共有しない。
各HTMLのCSPは `connect-src 'none'`、外部スクリプトも禁止。設定ミスがあっても本番のAPIに通信できない。ランキングは端末内の記録または表示例で、端末間では共有しない。
管理者の実装・サンプルデータ・バックエンドはpreview/へ配布しない。preview/admin.htmlは案内のみで、既存の本番管理者ログインへリンクする。本番側の認証・権限確認は変更しない。

## 更新

1. 修正した確認用Siteのdistを準備し、ゲーム・保存・表示を検証する。
2. 最新mainを取得した作業コピーで以下を実行する。
   `python3 tools/update-preview.py --source /path/to/reviewed-site/dist`
3. `git diff --name-only` を確認し、preview/の差分だけを公開する。この処理はFirebase設定・管理者権限・本番データを操作しない。
4. mainへコミットすると既存のPagesで公開される。preview/version.jsonのsource_commitと配信ファイルのSHA256で最新版を確認できる。
5. ユーザーが確認・承認した修正だけを、別作業として本番へ適用する。preview/をルートへ自動コピーしない。新しいポイント制度などサーバーが必要な機能は、本番のサーバー配備・検証も終えてから公開する。

確認用データはブラウザー内だけに保存される。ブラウザーのデータ削除・別端末への移動では引き継がれない。本番データの削除・初期化は行わない。
