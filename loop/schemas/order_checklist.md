# S1 発注書 lint の定義(order_checklist)

`loop/runner/verify_order.mjs` が機械判定するルールの人間可読な定義。
「合格の実物」は `prompts/fable5_papercraft-cam_order.md` の**1本のみ**
(サンプル1つのリスクにより、ルールは当面「必須要素の存在」に留める保守的設計。
Phase 4 パイロットで2本目が通ってから厳格化する — IMPLEMENTATION_PLAN Phase 2)。

3点同期の対応: 生成側 = `loop/templates/order_template.md` /
合格の定義 = 本書 / 検証 = `verify_order.mjs`。**どれか1つを変えるとき他の2つも見る。**

| rule id | 判定(決定的) | 根拠 |
| --- | --- | --- |
| order.title | 1行目の見出しに「発注」または「依頼」を含む | 実物 L1 |
| order.invariant_table | ヘッダに「視覚的不変量」と「担当軸」を含む Markdown 表があり、行数 3〜7 | 制作規約ゲート1(5±2)・実物 §2 |
| order.signals | 「生き残らせる信号」の節がある | 実物 §3 |
| order.phases | Phase 1 / Phase 2 / Phase 4 への言及がある(フェーズ制) | 制作規約 §2・実物 §5 |
| order.constraints | 「制約条件」節に「単一の自己完結」「カメラ」「品質基準」を含む(規約ブロック同梱) | 制作規約 §4・実物 §8 |
| order.hooks | 制約条件に「__artReady」と「freeze」を含む(検証フック同梱) | 制作規約 §4 検証フック(Phase 0 追補) |
| order.technotes | 「予約語」と「ping-pong」への言及がある(技術注意リスト同梱) | 制作規約 §9・実物 §13 |
| order.sliders | ヘッダに「ラベル」を含む表があり、行数 6〜10 | 制作規約ゲート2・実物 §6.1 |
| order.verification | 「フェイクカメラ」と「スクリーンショット」への言及がある(検証環境同梱) | 制作規約 §7・実物 §9 |
| order.rubric | 「自己批評」の節がある | 制作規約 §7.4・実物 §11 |
| order.report | 「報告様式」の節がある | 制作規約 §3.1・実物 §15 |
| order.vocab | 技法語彙リスト(verify_order.mjs 内 VOCAB)から3語以上を含む | 制作規約 §5(語彙の供給が最重要) |

注意: 実物(papercraft-cam 発注書)は Phase 0 の検証フック規約より前に書かれたため
`order.hooks` を満たさない。verify_order は実物に対しては `--legacy` で
このルールを免除して検証する(新規発注書には免除なし)。
