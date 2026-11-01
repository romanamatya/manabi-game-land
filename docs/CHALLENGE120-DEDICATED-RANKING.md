# 2分間チャレンジ専用ランキング

## 切り替え基準と読み書き先

- 基準日時は **2026-11-01 00:00 JST**（`2026-10-31T15:00:00Z`, Unix milliseconds `1793458800000`）。
- 新記録は `productionRankings/v1/challenge120Seasons/2026-11-01/games/{game}/players/{rankingUid}` に保存する。
- 専用画面はこのパスだけを読む。既存の `productionRankings/v1/games/{game}/players/{rankingUid}` や端末内の旧記録を読み替えず、`updatedAt` による移行も行わない。
- 旧ランキングの文書は削除・書き換えしない。新パスの削除はRulesで拒否し、同じ児童の最高記録だけを単調に更新する。
- 有効なゲームIDは `keisan`, `pref-name`, `pref-place`, `alphabet`, `distribution`, `distribution2`, `exchangeAssociation`, `kotowaza`, `multiplicationProperties`, `shapeExpressions`, `keisanSummary`。

## 投稿条件

新クライアントは、2分間チャレンジが終了したときだけ専用投稿イベントを出す。練習・時計変更による終了・テストプレイは対象外。記録の開始日時と終了日時、protocol 3、対象ゲーム、既存のプロフィールUIDとランキングUIDのリンク、公開状態、管理者文書の `challenge120RankingEnabled` を検査する。`keisanSummary` は既存の最高称号後に始まる120秒挑戦のタイムアウト記録だけを受け付ける。

スコア更新ではプロフィール文書を書き換えない。ポイント、称号の達成状況、アイコン、所持品、通常の最高記録はこの処理の対象外。管理者のニックネーム変更は専用ランキング文書にも同期し、その変更前の値を既存のバックアップに含める。

## 残る制限

児童端末で動く採点処理は信頼済みサーバーではない。Rulesは形式・日時・ID連携・公開状態を検査するが、実際に2分間プレイして正解を積み上げたかまでは証明できない。改変クライアントが妥当な日時とスコアを偽造する余地は残る。Sparkの無料運用を保つため、Cloud Functionsなどの信頼済み採点サーバーは追加していない。

本番のRules案・フラグはまだ公開または有効化していない。新ランキングを利用可能にするには、公開後に静的な `challenge120RankingEnabled` と管理者文書の同名フラグを承認のうえで有効化する必要がある。
