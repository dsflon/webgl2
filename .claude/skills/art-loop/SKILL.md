---
name: art-loop
description: テーマ1行から WebGL2 作品を自律制作するループランナー。/art-loop <テーマ> で新規実行、/art-loop next で loop/themes.md から次を取得、/art-loop status で state 一覧と needs_review Inbox を表示。設計 = loop/DESIGN.md、方法論 = loop/LOOP_ENGINEERING_GUIDE.md。
---

# art-loop — 制作ループランナー手順書

あなたはこれから**設計者ではなくループランナー**として振る舞う(指南書 §5)。
判定は検証器に聞く。自分の出力を読み返して「良さそうだから合格」としない。
進捗の唯一の正は状態ファイル。会話履歴から思い出そうとせず `state.mjs show` を読む。

## 引数の解釈

- `/art-loop <テーマ文>` — そのテーマで1件実行する
- `/art-loop next` — `loop/themes.md` のキューを上から走査し、`state.mjs list` に
  存在しない・または `needs_review` でない未完了の最初のテーマを選ぶ。無ければ
  「キューが空」と報告して終了
- `/art-loop status` — `node loop/runner/state.mjs list` の結果と、needs_review 各件の
  `blocked_reason`・最新エラー・スクショパスを人間が選ぶだけの形で表示して終了

## 事前準備(毎回)

1. `cd loop/runner && npm install`(未インストール時のみ)。
2. slug を決める(テーマから `[a-z0-9-]`、既存 `fable5_*.html` と重複しないこと)。
3. `node loop/runner/state.mjs init <slug> "<テーマ>"`(既存なら `show` → `next` で再開点を決める。
   **強制終了後の再実行はここから状態だけを頼りに続きから回る**)。
4. 作業ブランチ: `art-loop/<slug>` を main から作成(既存ならそのまま使う)。
5. 開始時刻を控える。**タイムアウト = 1実行60分**(サーキットブレーカー②)。超えたら
   現ステージを needs-review にして即終了する。「あと1回だけ」をやらない。
6. 各ステージ完了ごとに `state.mjs cost <slug> <概算トークン> <経過分>` を記録する
   (サーキットブレーカー③)。

## ステージ実行(`state.mjs next <slug>` が返すステージを順に。DESIGN §6)

どのステージも同じ内側ループで回す:

```
attempt = state.mjs attempt <slug> <stage>   # exceeded=true なら即 needs-review
生成(Maker)→ 検証(Checker)
  合格 → state.mjs status <slug> <ステージ完了形> → 次のステージへ
  不合格 → エラーリスト原文を state.mjs error で保存し、Maker に「原文のまま」渡して再試行
```

**修正の規律**(指南書 §5.1): エラーは要約せず原文を渡す / 修正は指摘箇所のみ /
合格が出たら再生成しない / 上限超過は失敗ではなく needs-review への正常な出口
(`state.mjs needs-review <slug> <stage> "<エラー要点+収束しなかった理由の仮説>"`)。

### S0 brief(様式解析)

- 生成: テーマから `loop/state/<slug>/brief.json` を作る。中身は
  `loop/schemas/invariants.schema.json` のとおり(references / signals / vocabulary /
  invariants 5±2 / priority)。vocabulary は制作規約 §5 の正式名称から選ぶ。
  不変量は「実装可能な構造の言葉」で書き、各 principle に vocabulary の語を含める。
- **参照画像があれば `loop/state/<slug>/refs/` にコピーする**(ユーザー添付・既存作品の
  スクショ等)。これは S4 Checker と Maker の目視比較の一次証拠になる(文章化した
  references より強い)。
- 検証: `node loop/runner/verify_brief.mjs loop/state/<slug>/brief.json`
- 合格 → `status briefed`

### S1 order(発注書生成)

- 生成: `loop/templates/order_template.md` を brief.json で埋めて
  `prompts/fable5_<slug>_order.md` に書く。構造の実物は
  `prompts/fable5_papercraft-cam_order.md`(困ったらこれに寄せる)。
- 検証: `node loop/runner/verify_order.mjs prompts/fable5_<slug>_order.md`(--legacy 禁止)
- 合格 → `status ordered`

### S2 implement(実装)

- 生成: **Maker サブエージェント**を起動する。プロンプトは
  `loop/templates/maker_prompt.md` に ORDER_PATH / SLUG / MODE を差し込んだもの。
  **この会話の文脈・brief 作成の経緯は渡さない**(入力の隔離)。
  repair モードでは ERRORS_JSON にエラーリスト原文を埋める。
- 検証: `node loop/runner/verify_static.mjs fable5_<slug>.html`
- 合格 → `status implemented`

### S3 runtime(動作検証)

- 準備: `python3 -m http.server 8888`(リポジトリルート)。
- 検証: `node loop/runner/verify_runtime.mjs "http://localhost:8888/fable5_<slug>.html?fakesource=1&freeze=1" --shots loop/state/<slug>/shots`
  (作品が別名の合成入力スイッチを持つ場合は発注書の指定に従う)
- **brief の不変量に担当軸「時間」を含む行がある場合は `--motion` を必ず付ける**
  (運動応答チェック。fakesource の合成シーンに動く要素が必要 — 発注書 §4 で要求する)。
  この結果(pass/fail と diff 値)は S4 で Checker に渡す。
- **蓄積系(密度・残像・feedback で絵が育つ)作品は `--longrun` も付ける**
  (長時間安定チェック: 非 freeze で輝度が発散= whiteout しないこと。CRAFT §A5)。
  結果は S4 で Checker に渡す。
- **検知もの(人物マスク駆動)は `?fakescale=` 対応時、スケール両端でも回す**:
  `...&fakesource=1&fakescale=2` を付けた URL で `--longrun` をもう1周+final スクショ。
  実機バグ(whiteout・図地反転)はスケール依存で、既定スケールでは素通しになる
  (CRAFT §C2 — 実測で確認済みの限界)。
- 不合格 → checks の fail 内容をエラーリストとして Maker(repair)へ。
- 合格 → `status runtime_ok`。スクショ一式(final + uDebug 主要モード + 縮小版 +
  等倍クロップ。**final は絵が育った状態で** — `?prewarm=12` フックで決定的に
  早送りして撮る。実時間 warm(8〜15秒×swiftshader スロー=数分)は使わない)を
  `loop/state/<slug>/shots/` に揃える。
- **スクショの画面サイズを段階化する**(swiftshader はフィルレート律速で面積に
  ほぼ線形): 修正ラウンド中の反復目視は **480×300 程度の小画面**で撮り(3〜4倍速)、
  Checker 用・PR 用の一式だけフルサイズ(900×640 前後)で撮り直す。

### S4 aesthetic(美的レビュー — V2)

- 生成側の禁止事項: このステージでの修正も Maker(repair)で行う。
  オーケストレータ自身が作品を直接編集しない。
- 検証: **Checker サブエージェント**を起動する。プロンプトは
  `loop/templates/checker_prompt.md` に SHOTS_DIR / BRIEF_PATH / REVIEW_OUT_PATH /
  **REFS_DIR**(`loop/state/<slug>/refs/`。無ければ「なし」)と
  MOTION_CHECK_RESULT(S3 の `--motion` の結果。時間軸の不変量がない作品は「該当なし」)/
  LONGRUN_CHECK_RESULT(S3 の `--longrun` の結果。蓄積系でない作品は「該当なし」)を
  差し込んだもの。**Maker の文脈・ソースコードを渡さない。**
  出力を `node loop/runner/verify_review.mjs <review.json> --brief <brief.json>` で機械検証
  (スキーマ不適合・verdict 矛盾は Checker に差し戻す。これは attempts を消費しない)。
- **合格の定義 = 同一成果物への独立2 pass**(DESIGN §4)。**2体の Checker は並列起動
  してよい**(保証は「同一成果物・文脈非共有・独立2実行」であり時系列順ではない —
  直列だとゲート待ちが2倍になる)。両方 pass なら `status aesthetic_ok`。
  どちらかが fail ならその fix_instructions で修正ループへ(成果物が変わるので
  カウントはリセット。両方 fail なら指摘を突き合わせ共通の根因を優先)。
- fail 時の修正ループ(CRAFT §D2/§D4 — 実セッションで品質が跳ねた手順の制度化):
  1. **証拠化**: オーケストレータは fix_instructions の症状を**自分のスクショで再現**
     してから指示を出す(final・該当 uDebug・必要なら縮小フィギュア相当の変種)。
     再現できない指摘はその旨を添えて Checker の evidence と突き合わせる。
  2. **同一 Maker の継続**: 美的修正は初回実装の Maker を **resume** して行う
     (アーキテクチャ理解の保持。fresh 起動はエラー修正=verify 不合格時のみ)。
     渡すもの = Checker の fix_instructions 原文(因果診断つき)+ オーケストレータの
     再現スクショ所見。Checker 側の隔離は維持されるのでバイアス遮断は保たれる。
  3. Maker には**1まとまりごとにスクショ目視**(maker_prompt の目視の規律)を要求する。
  4. 修正後は S3 の runtime 検証を再実行してから再レビュー(修正が動作を壊していないこと)。

### S5 submit(提出 — L2 ゲートは人間のマージ)

1. README.md の作品リストに Pages URL を追記。
2. ブランチにコミットし push(`fable5_<slug>.html` / 発注書 / README /
   `loop/state/<slug>/` の brief・review・shots)。
3. PR を作成。本文には V3 材料一式を必ず含める(DESIGN §4 V3):
   テーマ / 不変量表 / スクショ(final・縮小・等倍・デバッグ)/ V1 レポート要約 /
   V2 の2回のスコア表 / attempts・コスト / 未検証事項・needs_review 事項。
4. `state.mjs status <slug> submitted` → `state.mjs cost` 最終記録。

## 実行サマリ(毎実行の最後に必ず出す)

```
テーマ / slug / 最終 status
ステージ別 attempts(brief/order/implement/runtime/aesthetic)
V1: static エラー0・runtime 全チェック合格(または不合格項目)
V2: 1回目・2回目のスコア表
コスト: loops / approx_tokens / wall_minutes
次のアクション: PRレビュー依頼 or needs_review の判断依頼(Inbox)
```

## 事後の知識還元(メタループ — 毎実行の最後に必ず行う)

この実行で「検証は通るのに見た目が悪い」失敗を修正した場合、その教訓を
**必ずどれか1つに還元**してから終了する(DESIGN §9 の3点):

1. 決定的に判定できるもの → V1 lint ルール案として needs_review/PR に記載
2. 採点軸にできるもの → V2 ルーブリック(checker_prompt)追記案として記載
3. レンダリング工芸の知見 → **`loop/CRAFT.md` に失敗モードとして追記**
   (症状/根本原因/処方/出典の4点。既存 ID 体系 A〜D に沿う)

該当がなければ「新規教訓なし」と実行サマリに明記する。

## 禁止事項(アンチパターン — 指南書 §9)

- 検証器を通すための偽装(フック空実装・エラー文字列の埋め込み・採点の水増し)
- エラーの要約・意訳(原文をそのまま渡す)
- 修正ループ内での「ついで」改善
- 上限・タイムアウト超過後の「あと1回だけ」
- 検証器・スキーマ・テンプレートの無断変更(3点同期はメタループ=人間承認の領分)
