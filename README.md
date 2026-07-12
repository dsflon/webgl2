# webgl2

[https://dsflon.github.io/webgl2/dogra-magra.html](https://dsflon.github.io/webgl2/dogra-magra.html)  
[https://dsflon.github.io/webgl2/ds_voice.html](https://dsflon.github.io/webgl2/ds_voice.html)  
[https://dsflon.github.io/webgl2/live_portrait_in_flux.html](https://dsflon.github.io/webgl2/live_portrait_in_flux.html)  
[https://dsflon.github.io/webgl2/overflowing_aura.html](https://dsflon.github.io/webgl2/overflowing_aura.html)  
[https://dsflon.github.io/webgl2/overflowing_aura_4taigyo_v2.html](https://dsflon.github.io/webgl2/overflowing_aura_4taigyo_v2.html)  
[https://dsflon.github.io/webgl2/overflowing_aura_4taigyo.html](https://dsflon.github.io/webgl2/overflowing_aura_4taigyo.html)  
[https://dsflon.github.io/webgl2/suibokuga_fluid.html](https://dsflon.github.io/webgl2/suibokuga_fluid.html)  
[https://dsflon.github.io/webgl2/suibokuga_particle.html](https://dsflon.github.io/webgl2/suibokuga_particle.html)  
[https://dsflon.github.io/webgl2/iwashi_ball_sakanaai.html](https://dsflon.github.io/webgl2/iwashi_ball_sakanaai.html)  
[https://dsflon.github.io/webgl2/iwashi_ball_opus4_8.html](https://dsflon.github.io/webgl2/iwashi_ball_opus4_8.html)  
[https://dsflon.github.io/webgl2/suibokuga_sakana.html](https://dsflon.github.io/webgl2/suibokuga_sakana.html)  
[https://dsflon.github.io/webgl2/suibokuga_opus4_8.html](https://dsflon.github.io/webgl2/suibokuga_opus4_8.html)  
[https://dsflon.github.io/webgl2/ascii_sakana.html](https://dsflon.github.io/webgl2/ascii_sakana.html)  
[https://dsflon.github.io/webgl2/ascii_opus4_8.html](https://dsflon.github.io/webgl2/ascii_opus4_8.html)  
[https://dsflon.github.io/webgl2/van-gogh_sakana.html](https://dsflon.github.io/webgl2/van-gogh_sakana.html)  
[https://dsflon.github.io/webgl2/fable5_scribble-cam.html](https://dsflon.github.io/webgl2/fable5_scribble-cam.html)  
[https://dsflon.github.io/webgl2/fable5_water-cam.html](https://dsflon.github.io/webgl2/fable5_water-cam.html)  
[https://dsflon.github.io/webgl2/fable5_oneline-cam.html](https://dsflon.github.io/webgl2/fable5_oneline-cam.html)  
[https://dsflon.github.io/webgl2/fable5_typo-cam.html](https://dsflon.github.io/webgl2/fable5_typo-cam.html)  
[https://dsflon.github.io/webgl2/fable5_van-gogh.html](https://dsflon.github.io/webgl2/fable5_van-gogh.html)
[https://dsflon.github.io/webgl2/fable5_papercraft-cam.html](https://dsflon.github.io/webgl2/fable5_papercraft-cam.html)
[https://dsflon.github.io/webgl2/fable5_blue-dissolve.html](https://dsflon.github.io/webgl2/fable5_blue-dissolve.html)

## Docs

### 制作の手引き

- [AI_DIRECTION_GUIDE.md](./AI_DIRECTION_GUIDE.md) — このリポジトリのような WebGL2 リアルタイム映像作品を、生成AIに依頼して最大の品質で作らせるためのディレクション指示書(失敗モード対策・発注ワークフロー・プロンプトテンプレート・技術語彙辞典)
- [prompts/](./prompts/) — 実際に作品を発注したときの発注書(order)の実物。上記指示書のテンプレートを適用した例として参照する

### 制作ループ(art-loop)

テーマを1行与えると、発注 → 実装 → 検証 → 美的レビュー → 修正を人間の逐次指示なしに回して作品を PR として提出するシステム。`/art-loop <テーマ>` で起動する。

- [loop/DESIGN.md](./loop/DESIGN.md) — ループ全体の設計書(状態機械・検証器・停止条件・メタループ)
- [loop/LOOP_ENGINEERING_GUIDE.md](./loop/LOOP_ENGINEERING_GUIDE.md) — ループエンジニアリングの汎用方法論(指南書)。特定プロジェクトに依存しない
- [loop/IMPLEMENTATION_PLAN.md](./loop/IMPLEMENTATION_PLAN.md) — 設計を実装へ落とすフェーズ計画。進捗はこの文書のチェックボックスが唯一の正
- [loop/runner/README.md](./loop/runner/README.md) — 検証器(静的 lint・実行時検証・美的レビュー検証)と状態機械 CLI の使い方
- [loop/themes.md](./loop/themes.md) — テーマキュー。`/art-loop next` が上から走査する
- [loop/metrics.md](./loop/metrics.md) — テーマ別の運用実績とメタループ台帳(人間レビューの指摘をどこへ還元したか)
- [.claude/skills/art-loop/SKILL.md](./.claude/skills/art-loop/SKILL.md) — `/art-loop` スキル本体(ループランナーとしての手順書)
