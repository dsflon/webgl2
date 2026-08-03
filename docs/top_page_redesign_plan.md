# トップページ改修(レンズ格子ポートフォリオ) — 実現性評価 & 実行計画

> 対象仕様: 「WebGLインタラクティブ・ポートフォリオ 実装指示書 v1.0」(docs/top_page_spec_v1.md に写しを保存)
> 本書は**計画のみ**。実装は承認後に着手する。

---

## 1. 結論(実現性)

**実現可能。** 仕様の核心(レンズ変形・無限パン・決定的割当・アトラス・性能要件)はすべて既知の手法で構成でき、
技術的なブロッカーはない。ただし**仕様が前提とする技術スタック(Vite + TypeScript + npm の three.js)が、
本リポジトリの規約「ビルド工程なし・自己完結HTML・GitHub Pages ルート配信」と衝突する**。
ここだけ着手前の方針決定が必要(→ §4 決定事項)。

## 2. 現状調査(実測)

| 項目 | 現状 |
|---|---|
| 配信 | GitHub Pages (`https://dsflon.github.io/webgl2/`)、リポジトリルート直接配信。CI/Actions なし |
| ビルド | なし。全作品が単一HTML自己完結。npm はルートに存在しない(`loop/runner/` のみ) |
| 現トップ | `index.html`「黒の展示室」— works.json 駆動のCSSカードグリッド + WebGL2背景演出 + GA(gtag, G-Q0Y8RMED5C) + OGP + noscript リンク一覧 |
| データ | `works.json`(ルート) 33作品。スキーマ: `slug/file/title/date/desc/model/tags/series/thumb` |
| 画像 | `thumbs/<slug>.jpg` 800×500 JPEG(計2.4MB)。`tools/thumbs.mjs` で再現生成可能 |
| 依存関係 | works.json は index.html のほか README 運用・`tools/thumbs.mjs`・`loop/`(参照ホワイトリスト #138)からも参照される |

## 3. 仕様との適合ギャップと対応方針

### 3.1 技術スタック(要決定 — 最大の論点)

仕様: Vite + TypeScript(strict) + three.js(npm) + Vitest。
現実: リポジトリはビルドレス静的配信で、Actions も dist も無い。

| 案 | 内容 | 評価 |
|---|---|---|
| **A. site/ ソース + ビルド成果物をルートへコミット(推奨)** | `site/` に Vite+TS プロジェクトを置き、`npm run build` が `index.html` + `assets/top/*.js` をルートへ出力。成果物ごとコミットする | 仕様(TS/Vite/Vitest/ESLint)を満たしつつ、Pages 配信・既存33作品の同居・Actions 不要をすべて維持。成果物コミットの冗長さは許容 |
| B. GitHub Actions で Pages デプロイ | ビルドをCIに寄せる | クリーンだが Pages のデプロイ方式変更(ブランチ→Actions)が必要で、既存運用への影響が最も大きい |
| C. ビルドレスで書く(import map + CDN three) | リポジトリ規約に完全準拠 | 仕様の TS strict / Vitest / バンドル最適化要件を満たせない。仕様逸脱 |

→ **A を推奨**。仕様と規約の両立点。

### 3.2 データ契約(works.json)

仕様スキーマ(`id/title/url/image/tags`)と既存スキーマ(`slug/file/title/…/thumb`)が不一致。
既存 works.json は他ツールからも参照される「生きた単一情報源」なので、**既存スキーマを正とし、
データ層(`data/works.ts`)にアダプタを置く**: `slug→id`, `file→url`, `thumb→image`。
バリデーション(手書きバリデータ、不正エントリはスキップ)は仕様どおり実装。
「作品追加 = works.json に1行 + サムネ生成」という既存運用がそのまま仕様の受け入れ条件
(コード変更なしで作品追加)を満たす。

### 3.3 画像アセット

仕様は WebP 入稿を求めるが、既存 thumbs(JPEG 800×500)で開始して問題ない
(アトラスへ 512×512 cover 焼き込みで吸収。JPEG/WebP の差は転送量のみで、33枚計2.4MBは
「10Mbps で3秒以内」を満たす)。WebP 化は任意の後日最適化とする。

- アトラス: 33作品 × 512² → **4096×4096 1枚**(64枠、ドローコール1)を基本。
  iOS のメモリが気になる場合のフォールバックとして 2048×2048 × 3枚(仕様上限4枚以内)。

### 3.4 既存トップページと周辺資産の扱い

- GA タグ(gtag.js)・OGP・meta description は新 index.html へ**必ず移植**。
- 仕様§9のフォールバック「CSSグリッド静的一覧」は、現「黒の展示室」の簡約版として実装
  (progressive enhancement: 先に静的グリッドを描画 → WebGL 成功時に置換。noscript / WebGL不可 /
  works.json 失敗 / context lost 復帰失敗のすべてを1つの実装でカバーし、SEO実体リンク(§7.3/§10)も兼ねる)。
- クリック遷移先は各作品HTML(相対URL)。仕様どおり `_blank` + noopener で開く(config で同タブへ変更可)。

### 3.5 技術リスクと対策(実現性の根拠)

| 論点 | 評価と対策 |
|---|---|
| インスタンス数 | セル= 画面高/14 ≒ 77px(1080p)で可視+マージン ≈ 700〜900 個。上限8000に対し余裕大。CPU行列更新は毎フレーム余裕 |
| 近傍重複禁止 × 決定性 | 逐次割当は評価順に依存し非決定になりがち。**起動時に seed から N×N のトーラス周期割当表を生成**(制約充足しつつ全周期で8近傍検査、ラップ境界も検査)し、実行時は O(1) 参照。リロード/seed 再現・ユニットテストが容易 |
| 非重複 + GAP_MIN 2px | 閉形式 remap 単独では保証不可(仕様も認めている)。半径方向リマップ + 1〜2回のリラクゼーション補正。テストでポインタ位置を格子サンプリングして最小ギャップを検証 |
| バンドル ≦ gzip 200KB | three をコアのみ import(WebGLRenderer/OrthographicCamera/InstancedMesh/MeshBasicMaterial系)して tree-shake で概ね 120〜160KB。M2 時点で実測し、超過時は import 削減で対処。lil-gui / stats.js は `?debug=1` の動的 import で本番バンドル外 |
| iOS Safari 16+ | 4096² テクスチャ・DPR上限2・touch パン/タップは全て標準対応範囲。context lost 対応も仕様どおり実装 |
| 60/120Hz 同一体感 | 全補間を `1 - pow(1-k, dt*60)` で dt 正規化(仕様§4.3) |

ブロッカーなし。不確実性が残るのは「レンズの K 係数と remap 形状の見た目調整」のみで、
これは仕様が想定するとおり M3 の lil-gui 環境で追い込む。

## 4. 着手前の決定事項(発注者確認)

1. **スタック方針**: §3.1 の A(site/ ソース + 成果物コミット)で進めてよいか。
2. **works.json**: 既存スキーマ維持 + アダプタ(推奨)でよいか。仕様スキーマへの移行は非推奨(周辺ツール破壊)。
3. **旧「黒の展示室」**: フォールバック内蔵に縮退(推奨)か、`gallery.html` として別途温存するか。
4. `_blank` 遷移: 仕様どおりでよいか(自サイト内作品のため同タブ案もある)。

※ 1・2 は回答が無い場合、推奨案を `// SPEC-DEFAULT` 扱いで採用して進められる。

## 5. 実行計画(仕様§13 に準拠 + リポジトリ適応)

| MS | 内容 | 完了条件 |
|---|---|---|
| **M0** 足場 | `site/` に Vite+TS+ESLint+Prettier+Vitest 雛形。ビルド出力→ルート配置の確認。`config.ts` に全パラメータ定義 | `npm run build` でルートに index.html が出て Pages 相当のローカル配信で表示 |
| **M1** データ+フォールバック | works.json アダプタ+バリデータ。静的CSSグリッド(SEO/noscript/フォールバック兼用)。GA/OGP 移植 | WebGL なしで全33作品の閲覧・遷移が成立する「動くサイト」 |
| **M2** 描画基盤 | アトラス焼き込み(チャンク分割・cover・sRGB・mip+異方性)、InstancedMesh、Ortho カメラ(1unit=1px)、リサイズ、トーラス割当表 | 無変形グリッドが1ドローコールで表示、seed 再現、色一致 |
| **M3** レンズ | 半径リマップ+スケール+リラクゼーション、ポインタ Lerp、`?debug=1` の lil-gui/stats | どのポインタ位置でも非重複・GAP_MIN 維持。GUI で K 等を調整し定数化 |
| **M4** 操作系 | ドラッグパン+慣性+ラップアラウンド+自動ドリフト、6px/500ms クリック判別、`_blank` 遷移、注視タイトルのオーバーレイ(クロスフェード) | PC で一連の操作が仕様どおり |
| **M5** 仕上げ | タッチ(レンズ中央固定)、reduced-motion、ローディング進捗+600msフェードイン、context lost、性能実測(fps/drawcall/GC) | iPhone 相当で 55fps、受け入れ基準§8 充足 |
| **M6** 品質 | Vitest(レンズ関数・割当表・近傍制約・クリック判別)、README 追記(作品追加手順)、仕様§14 チェックリスト自己検証 | チェックリスト全項目の結果を添付して報告 |

各 MS 完了時に、起動コマンド・確認手順・debug URL を報告する(仕様§13)。

## 6. 成果物構成(予定)

```
site/                    # ソース(仕様§11 の src/ 構成をこの下に置く)
  src/{main,config}.ts
  src/data/works.ts      # 既存スキーマ→仕様スキーマのアダプタ + バリデータ
  src/gfx/{atlas,grid,lens,renderer}.ts
  src/input/pointer.ts
  src/ui/overlay.ts
  src/fallback/staticGrid.ts
  test/*.spec.ts         # Vitest
index.html               # ビルド成果物(コミット対象)
assets/top/*.js          # ビルド成果物(コミット対象)
works.json               # 既存のまま(単一情報源を維持)
thumbs/*.jpg             # 既存のまま(アトラス原料)
```
