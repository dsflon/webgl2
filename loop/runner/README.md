# loop/runner — 検証器と状態機械

制作ループの停止条件を判定するコード(LLM 不使用)と、進捗の唯一の正である状態機械 CLI。
設計は [loop/DESIGN.md](../DESIGN.md) §4・§7。

## 使い方

```bash
cd loop/runner && npm install   # playwright-core + ajv

# V1: 静的 lint(JSON レポート。error があれば exit 1)
node verify_static.mjs ../../fable5_papercraft-cam.html

# V1: 実行時検証(URL には作品が持つ検証パラメータを付けて渡す)
python3 -m http.server 8888 --directory ../..   # または任意のサーバ
node verify_runtime.mjs "http://localhost:8888/fable5_papercraft-cam.html?fakedepth=1&freeze=1"

# S0/S1/V2 の停止条件
node verify_brief.mjs  ../state/<slug>/brief.json
node verify_order.mjs  ../../prompts/fable5_<slug>_order.md     # 実物の検証のみ --legacy
node verify_review.mjs ../state/<slug>/review.json --brief ../state/<slug>/brief.json

# 状態機械(スキルは JSON を直接編集せず必ずこれを使う)
node state.mjs init <slug> "<テーマ>" / show / list / status / attempt / error /
              needs-review / resume / cost / next

# 受入テスト(フィクスチャ合格+破壊テスト+モック両経路+中断再開+実行時両経路)
node selftest.mjs            # 実行時込み(数分)
node selftest.mjs --skip-runtime
```

- ブラウザ実体は `CHROMIUM_PATH` 環境変数 → `/opt/pw-browsers/chromium` → システムの
  Chrome(channel)の順で解決する。
- `verify_runtime` はヘッドレス+SwiftShader で動くため FPS は計測しない
  (FPS は V3=人間の実機確認の領分)。
- **フリッカ検査は必ず `?freeze=1` を付けた URL で行う**こと。freeze なしの差分では
  「意図したアニメーション」と「不要なチラつき」を区別できない。

## 検査の3分類(静的 lint の線引き — DESIGN §4 / レビュー #6-9 対応)

テキストパターンで**決定的に判定できるものだけ**が停止条件になる。

| 分類 | 扱い | 検査(rule id) |
| --- | --- | --- |
| ① 決定的ルール | **severity=error。停止条件** | ヘッダ5節(`header.*`)/ 規約ID(`dom.required_id`)/ video属性(`video.attributes`)/ `gl.preserveDrawingBuffer` / `gl.dprCap` / `camera.facingMode` / エラー3経路(`camera.error_paths`)/ 検証フック(`hook.artReady` `hook.freeze`)/ `a11y.reducedMotion` / GLSL予約語(`glsl.reserved_word`)/ 外部URL許可リスト(`deps.external_url`) |
| ② 限定パターン | **severity=warning。V2 レビューへの申し送り**(誤検出・見逃しがあり得るため停止条件にしない) | シードへの uTime 混入疑い(`seed.utime_in_hash`)/ ping-pong 不在疑い(`gl.pingpong_suspect`)/ 行数超過(`file.too_large`) |
| ③ パターン化不能 | **V2(美的レビュアーのチェック項目)/ V3(人間)へ** | ping-pong の意味的な正しさ / シード純度の厳密判定 / ブレンドステートの対応 / 「後処理近似になっていないか」等の様式判定 |

実行時検証(`verify_runtime.mjs`)はすべて①扱い:
`ready`(`__artReady`)/ `pageerror` / `alive`(黒・白画面検査)/ `flicker`(freeze差分 <2.0/255)/
`sliders`(6本以上・両端掃引で生存)/ `debugViews` / `resize` / `uiToggle` / `cameraDenied` /
`motionResponse`(`--motion` 指定時。freeze を外し動く合成シーンで unfrozen 差分 >0.5/255)。

> **メタループ #1**(blue-dissolve パイロット, PR #9): 「動きに反応する」型の時間的不変量は
> 静止スクショの V2 では原理的に判定できず、2回連続の偽不合格を生んだ。対処として
> 時間的挙動の担保を V1 `motionResponse` に格上げし、V2(checker_prompt.md)には
> 「V1 pass 時、静止画で時間性が見えないことだけを理由に減点しない」規則を追加した。

## 3点同期の対応先(これを変えるときは他も見る)

| ここ(検証) | 合格の定義 | 生成 |
| --- | --- | --- |
| `verify_static.mjs` の①ルール | `AI_DIRECTION_GUIDE.md` §4 制約条件ブロック | `loop/templates/order_template.md` の規約ブロック |
| `verify_runtime.mjs` の検証フック | 同 §4「検証フック」 | 同上 |
| `verify_brief.mjs` | `loop/schemas/invariants.schema.json` | `.claude/skills/art-loop` S0 手順 |
| `verify_order.mjs` | `loop/schemas/order_checklist.md` | `loop/templates/order_template.md` |
| `verify_review.mjs` | `loop/schemas/review.schema.json` | `loop/templates/checker_prompt.md` |
| `state.mjs` の書き込み検証・LIMITS | `loop/schemas/state.schema.json` / DESIGN §9 | `.claude/skills/art-loop` の内側ループ |
| `selftest.mjs` の期待値 | 規格フィクスチャ = `fable5_papercraft-cam.html` と `prompts/fable5_papercraft-cam_order.md`。運動応答チェックのフィクスチャ = `fable5_blue-dissolve.html`(動く合成シーンを持つ承認済み作品) | — |
