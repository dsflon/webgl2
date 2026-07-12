# 発注書 — fable5_{SLUG}.html「{作品タイトル}」

> S1 で brief.json から生成する穴埋めテンプレート(構造の実物: prompts/fable5_papercraft-cam_order.md)。
> `{…}` を埋め、埋められない項目は S0 へ差し戻す。生成後は `verify_order.mjs` が lint する。
> 3点同期: 本テンプレ / loop/schemas/order_checklist.md / loop/runner/verify_order.mjs

---

# 依頼: WebGL2 リアルタイム映像作品「{作品タイトル}」の新規制作

## 1. 作りたいもの

{テーマの1〜3文の言語化。カメラ映像が何に置き換わるのか、体験の核は何か}

- ファイル名: `fable5_{SLUG}.html`
- リポジトリ: `dsflon/webgl2`(単一HTML作品集。GitHub Pages で配信)

この様式の本質は「{最重要不変量の一言}」である。これを後処理(ぼかし・色調整・
オーバーレイ)で近似してはならない(制作規約 失敗モード#1)。

## 2. 様式の参照 — 視覚的不変量表(ゲート1通過済み)

参照: {brief.references の言語化を列挙}

| # | 視覚的不変量(実装可能な構造の言葉で) | 担当軸 | 実装原理の指定 | 外した場合の影響 |
|---|---|---|---|---|
{brief.invariants を優先順に行展開}

優先度(外すとその様式に見えなくなる順): {brief.priority}

Phase 1 ではこの表を独自の再解析で置き換えず、復唱と実装上の懸念の列挙のみ行うこと。

## 3. 入力映像から生き残らせる信号

- 生き残る: {brief.signals.survive}
- 様式側で置き換わる: {brief.signals.replaced}
- 被写体(特に人物)が判読できることは受入基準である。

## 4. 技術方針(この指定に従うこと)

実装原理は次の技法語彙で固定する: {brief.vocabulary}

{技法ごとの具体指定。パス構成の出発点、外部依存(MLモデル等)の有無と
?fakesource=1 の実装方針、uDebug のモード割り当て}

### 意味信号(ML)— brief.ml の転記(S0 判定済み。変更禁止)

{brief.ml.needed=false の場合:
「本作は ML を使わない(S0 判定済み)。実装で独自に ML 依存を追加しないこと。」}

{brief.ml.needed=true の場合、以下で固定する:
- 信号: {brief.ml.signal}(1作品1信号 — LITERT_GUIDE.md §2.2)
- ランタイム: {brief.ml.runtime}(選定理由: {LITERT_GUIDE §3 の頻度基準}。変更禁止)
- モデル: {brief.ml.model} — 入出力の形状・dtype・正規化・URL・ライセンスは
  Phase 2 のスパイク(LITERT_GUIDE §4.7)で実測し、本節に転記してから Phase 3 へ進むこと
- 実装パターン: LITERT_GUIDE §4 に従うこと(推論と描画の非同期分離・in-flight 1件・
  推論結果の EMA ping-pong・全 Tensor の delete() 保証・状態チップ・
  MODEL LOAD FAILED + RETRY 経路・モデル失敗でも作品を止めない)
- ?fakesource=1 の合成信号: {brief.ml.fakesource}}

## 5. 進め方(フェーズ制・厳守)

- Phase 1: 不変量表の復唱+実装上の懸念点の列挙(コードを書かない)
- Phase 2: 設計 — 候補アーキテクチャ2〜3案の比較(却下理由付き)、パス構成図
  (入出力・解像度・フォーマット・更新頻度)、フィルレート概算、リスク(コードを書かない)
- Phase 3: 実装 — 骨格(カメラ→cover-fit→素通し→UI→エラー経路)→ 標本
  ({この様式の標本の定義。例: マーク標本/色見本})→ パス追加。
  承認済み標本のパラメタを無断変更しない。1000行超は論理単位で分割書き込み
- Phase 4: 検証 — 検証手順+自己批評ルーブリック。未検証のまま完成と報告しない

## 6. UI 仕様

### スライダー(「写真らしさ ↔ 様式の強さ」の軸で 6〜10 本)

| key | ラベル | 範囲(初期値) | 作用 |
|---|---|---|---|
{スライダー行}

### プリセット・readout・ボタン

- プリセット: {2〜4個。参照に由来する名前で}(標本=色見本で承認を得ること)
- readout: FPS / 描画解像度 / {作品固有の値} 、ボタン: SAVE PNG / RESET LOOK / HIDE UI

## 7. 制約条件(dsflon/webgl2 リポジトリ規約 — 受入基準を兼ねる)

### 成果物の形
- 単一の自己完結 HTML。外部ライブラリ・ビルド工程・外部アセット禁止
  (例外: ML モデル・ランタイムのみ CDN 可 — 許可リストは LITERT_GUIDE.md §8。
  本作の許可: {なし | 具体的な依存名とバージョン})。
- WebGL2 / GLSL ES 3.00。WebGL1 フォールバック不要。
- ファイル冒頭に HTML コメントで: 作品概要 / 実行方法 / 様式解析の要約 /
  パイプライン図 / 全スライダーの説明 を書くこと。
- README.md の作品リストに GitHub Pages の URL を追記すること。

### カメラ
- getUserMedia は facingMode 指定(user/environment)。モバイルでは切替ボタンを表示。
- <video> は playsinline muted autoplay。ミラーはシェーダの UV 反転で行う。
- 非セキュアコンテキスト / 権限拒否 / カメラ無し の3経路それぞれに、
  専用メッセージと再試行ボタンを持つオーバーレイを表示すること。
- カメラとキャンバスのアスペクト比差は cover-fit(切り取り)で吸収すること。

### UI(既存作品の panel 構造を踏襲)
- 実装前に `fable5_papercraft-cam.html` を読み、カメラ取得・UIパネル・エラー表示・
  PNG保存の規約を踏襲すること。
- 全パラメタは単一の state オブジェクトに集約し、スライダー定義は
  [key, ラベル, ヒント, min, max, step] の配列から生成すること。
- DEFAULTS と「RESET LOOK」。「HIDE UI」「SAVE PNG」(preserveDrawingBuffer: true)。
- prefers-reduced-motion 時はアニメーション停止トグルを初期 ON。

### 検証フック(機械検証が依存する。必須)
- window.__artReady: 最初の本描画フレーム完了時に true を立てること。
- ?freeze=1: 時間駆動アニメーションを停止し決定的な静止フレームを出すこと。
- ?fakesource=1: {外部依存がある場合} 合成入力で様式パイプラインを駆動できること。

### 品質基準
- 静止したカメラの前で画面がチラつかないこと(乱数シードはセル座標由来)。
- デスクトップ 60fps / モバイル 30fps 以上(DPR 上限 2、重いバッファは解像度上限)。
- リサイズ・カメラ切替・タブ復帰で壊れないこと。

## 8. 技術注意リスト(遵守すること)

1. GLSL ES 3.0 の予約語を変数名に使わない: coherent, sample, filter, precise,
   restrict, readonly, writeonly, subroutine, input, output, common, partition, active
2. 同一テクスチャを read しながら write しない。feedback/拡散/EMA は必ず ping-pong。
3. float テクスチャは EXT_color_buffer_float を確認し、未対応時の代替を用意。
4. MRT のブレンドは全アタッチメント共通。クリアは clearBufferfv を毎アタッチメント。
5. 方向場は二重角 (cos2θ, sin2θ)。角度の直接 lerp をしない。
6. normalize(ゼロベクトル) は NaN。pow(x,y) は x<0 で未定義。
7. ループは const int MAX + break。
8. 頂点シェーダのテクスチャ参照は textureLod。
9. 乱数は pcg系 hash12。シードに時間を混ぜない。
10. UNPACK_FLIP_Y_WEBGL は DOM ソースのみ。TypedArray アップロードはシェーダ側で向きを合わせる。
11. gl_PointSize は使用時必ず書く。canvas は preserveDrawingBuffer: true。
12. UV・位置計算は highp。
13. ブラーは縦横分離。readPixels を毎フレーム呼ばない。
{作品固有の追加注意}

## 9. 検証環境

- フェイクカメラ+スクリーンショットは `loop/runner/`(testscene.mjs / verify_runtime.mjs)
  を使う。ローカルサーバは python3 -m http.server 8888。
- スクリーンショットは (a) 最終合成 (b) uDebug の主要モード (c) ?fakesource=1 の標本
  の3枚以上。pageerror が出ていないことを毎回確認する。
- 検証できない項目は「未検証」と明記し、確認すべき点を列挙すること。

## 10. 自己批評ルーブリック(スクリーンショット取得後、報告の前に実行)

1. §2 の不変量表の各行を画像と照合し 5 段階で自己採点(存在しなければ1点+理由)。
2. 「縮小して見た印象」(様式の成立)と「等倍で見た印象」(構造の正しさ・誤魔化しの有無)を分ける。
3. 最低点の2項目に、制作規約 §10 翻訳表の語彙で修正案を出す。
4. 全項目4点以上まで最大3周まで自走してよい。採点は甘くしない。

## 11. 報告様式

各フェーズの最後に: 「成果物 / 自分で確認したこと / 未確認のこと / 判断に迷った点」の4項目。
受入基準にない機能は実装せず提案に留めること。
