# 算数2ゲーム追加：公開承認待ち

現在の本番は、共通ビルドb16b799b5c1dを取り消した後の旧8ゲーム。今回は既存8ゲームのプログラム・保存処理を変更せず、共有ソースから作る2ゲームを追加する。共通版8ゲームの再公開は含めない。

- 最終ビルド：math-concepts-09187ccd11bd
- パッケージ：19b299ea4f36487157ae1de833a5ea48d1190dbd21c37d4a20f441cf12b91498
- 本番候補ブランチ：math-two-game-production-20261029
- 本番候補コミット：5505a58d2ca17ce0cb3bc78684983613694e81cd
- 既存ファイル変更：math.html 1個（元の4ゲームの内容を保持して2カードを追加）
- 新規ファイル：games/multiplicationProperties.html、games/shapeExpressions.html、multiplication-properties-model.js、multiplication-properties-game.js、multiplication-properties.css、math-concepts-model.js、math-concepts-game.js、math-concepts.css、math-concepts-production-points.js

## 再生成と検証

`node tools/prepare-math-concepts-production.mjs`

`node --test tests/math-additions-production.test.mjs tests/math-additions-package.test.mjs tests/math-concepts.test.mjs tests/multiplication-improvement.test.mjs`

出力：.release/math-concepts-addition/forward、rollback、RELEASE.json。公開ファイルを自動変更しない。

ゲームモデル・出題・採点・ゲーム進行・CSSはshared-src/siteからコピーする。限定的な生成処理で、本番の既存ポイント互換アダプターを接続し、共有ランキング未対応の案内に切り替える。Firebase SDKとスコア送信スクリプトを追加しない。

## 保存

算数残高は既存のmgl_points。1正解1pt、JST日付別・ゲーム別50pt上限はmgl_math_added_daily_v1。既存の分配②・交換結合と同じロック名で更新を直列化する。回答IDによる重複防止、送信待ちキュー、復旧ジャーナルを使用する。

mgl_economy_v1が既に存在する場合、算数残高がmgl_pointsと一致するときだけ算数関連を更新し、所有品・称号・国語などを保持する。不一致は元データと回答待ちキューを残して加算停止する。旧ことわざのmgl_kotowaza_points_v1には読書きせず、自動合算・移行しない。

最高記録はmgl_multiplicationProperties.bestとmgl_shapeExpressions.bestへ独立して保存する。将来のFirestore用フィールド名はmultiplicationPropertiesBestStreak、shapeExpressionsBestStreakを想定するが、今回は送信せず、Rules追加もしない。共有ランキングは未対応と画面に明記する。

## 実施した検証

自動テスト22件成功。問題生成、正解・誤答の一意性、倍問題40％、SVGの囲み・個数整合、二重付与防止、同時回答、1日上限、日替わり、保存中断と再送、既存の700問記録・装備・国語残高・所有情報の保持を確認した。

確認用のpreview/qa/math-addition-release/で、production用ポイントアダプターを専用のmanabi_math_addition_candidate:名前空間に接続し、実画面で1pt付与、誤答0pt、連続正解リセット、最高記録保持、リロード、2ゲームのポイント共有、メニュー導線を確認。1024x768で両ゲームのscrollHeight=768、表示崩れなし。Firebaseログイン・書込は行っていない。

## 公開直前と復旧

承認後、最新mainに対してRELEASE.jsonのbeforeSHA256を再照合する。9つの新規ファイルが未登録であり、math.htmlが退避版と一致する場合だけ10ファイルを1コミットで公開する。異なれば停止する。

異常時は同じ10ファイルのみ復旧する。math.htmlをrollbackの原本に戻し、新規9ファイルをGitの復旧コミットで除去する。Firestore、Auth、児童の端末保存は変更しない。tools/apply-math-concepts-release.mjsは完全一致digestが承認された隔離チェックアウトだけへ適用し、対象ファイルの差分や改ざんがあれば事前に拒否する。10ファイル全体の適用・復旧をテスト済み。

本番はまだ8ゲーム。承認後の公開と本番10ゲームの確認は未実施。
