# needs_review — depth-suibokuga(人間 Inbox)

テーマ: 深度の三遠を持つ水墨山水 — 遠くの被写体ほど淡く滲む
成果物: `fable5_depth-suibokuga.html`(1866→修正後も同規模、単一自己完結 HTML)
最終 status: **needs_review**(S4 aesthetic)

## なぜ止まったか(正常な出口)

- サーキットブレーカー: 実時間 **約138分**が上限60分を超過(主因: 最終修正サブエージェントが長時間化)。
- attempts: aesthetic **3/3** 到達(修正3周の上限)。
- どちらも「失敗」ではなく方法論上の**正常な停止条件**。「あと1回」はしない規律に従い停止した。

## 到達点(V1/V2 の結果)

- **V1 静的**: errors 0(warning 1件は `createTarget` ヘルパ経由の ping-pong を lint が数え落とす既知の誤検知。実 FBO は8枚・emaA/B・inkA/B で実 ping-pong)。
- **V1 実行時**(`?fakesource=1&freeze=1 --motion`): **10/10 合格**(freeze 静止 flicker=0.000、motion 追従、pageerror 0、カメラ拒否経路 OK)。
- **V2 美的レビュー**の推移(独立 Checker・拒否志向):
  - R1(初版): fail。inv1=3, inv2=4, inv3=4, inv4=3, inv5=4 / style=3, readable=4, artifact=3。
  - R2(1回目修正後): fail。**inv1〜5 すべて=4、style=4、readable=4**、残る未達は **artifact_free=3**(近景シルエット外周の明環)1軸のみ。
  - 最終修正(halo 除去)は R2 指摘の artifact_free に対応。**Checker 再採点は未取得**(予算超過で停止)。

## 最後の修正の中身(halo 除去)

原因を1つに特定: `finalFS` の interior(内側が抜ける)持ち上げ項が、暗いシルエットの**外周**でも
(ぼかしインクが中間値になるため)誤発火し、背景より明るいリム=明環を作っていた。
持ち上げを `inkSharp` でも gate し、被写体の真の内部でのみ発火するよう修正。
**オーケストレータ目視(crop.png)では明環はほぼ解消**。焦・コントラスト・他不変量・全 V1 構造は保全。

## 人間に委ねる判断(V3)

1. **趣味判断**: 最終 `shots/crop.png` の近景輪郭が許容範囲か。OK なら Checker を2回再走させれば
   `aesthetic_ok`→submit へ進められる状態(残タスクは Checker 2連続パスのみ)。
2. **不変量表の真偽照合**: brief.json の三遠・墨の五彩の解析が捏造でないか(実作品と照合)。
3. **実推論経路の未検証**: 本作は ML=depth(LiteRT.js webgpu/wasm降格)。ただし当実行環境は
   HF/CDN へ到達不可のため **LITERT_GUIDE §4.7 のモデルスパイクを全行程で実施できていない**。
   実 `.tflite` の URL・ライセンス・入出力(shape/dtype/正規化)は防御的な候補値。
   **機械検証は全て合成深度(?fakesource=1)で通過**しており、実推論の見えは要人間スパイク。
   `design_notes.md` に詳細。

## 参照ファイル

- 発注書: `prompts/fable5_depth-suibokuga_order.md`
- 設計メモ(Maker の Phase1-2): `loop/state/depth-suibokuga/design_notes.md`
- レビュー: `review1.json`(R1 fail) / `review2.json`(R2 fail=artifact_free のみ)
- スクショ: `shots/`(final / reduced / crop / debug 0-3)
