# WebGL2 リアルタイム映像作品 制作ガイド

カメラ映像を「絵」に変換するリアルタイム作品(油絵・水墨・ASCII・線画・粒子・流体…)を、
外部ライブラリなしの単一 HTML + WebGL2 で作るための、考え方・観点・手段の総まとめ。

本リポジトリの作品群(`fable5_van-gogh.html`, `suibokuga_*.html`, `ascii_*.html`,
`fable5_water-cam.html` など)を題材に、**新しい様式の作品を自力でゼロから設計・実装・
検証できる**ことをゴールとする。

---

## 目次

1. [制作の思考フレームワーク](#1-制作の思考フレームワーク)
2. [共通アーキテクチャ(作品の骨格)](#2-共通アーキテクチャ作品の骨格)
3. [知覚レイヤー — 映像から何を読み取るか](#3-知覚レイヤー--映像から何を読み取るか)
4. [場レイヤー — ノイズと流れの設計](#4-場レイヤー--ノイズと流れの設計)
5. [マークレイヤー — 表現手法カタログ](#5-マークレイヤー--表現手法カタログ)
6. [色の設計](#6-色の設計)
7. [物質感の設計](#7-物質感の設計)
8. [時間の設計](#8-時間の設計)
9. [性能設計](#9-性能設計)
10. [検証と反復 — AIなしで見た目を追い込む方法](#10-検証と反復--aiなしで見た目を追い込む方法)
11. [トラブルシューティング表](#11-トラブルシューティング表)
12. [GLSL / WebGL2 の罠一覧](#12-glsl--webgl2-の罠一覧)
13. [ケーススタディ: fable5_van-gogh.html](#13-ケーススタディ-fable5_van-goghhtml)
14. [新作チェックリスト](#14-新作チェックリスト)
15. [検索キーワード集](#15-検索キーワード集)

---

## 1. 制作の思考フレームワーク

### 1.1 様式の解体(Style Deconstruction)

「〇〇風にしたい」という要求を、そのまま実装してはいけない。
最初にやるのは **参考作品を観察して、その様式を成立させている「不変量」を言語化する** こと。

手順:

1. 参考画像を 10 枚程度集める(同一作家でも時期で様式が違う。時期まで絞る)。
2. 縮小して見る(遠目)・部分拡大して見る(筆致)・グレースケール化して見る(明度構造)。
3. 「これを外したらその様式に見えなくなる」特徴を **5±2 個** 書き出す。
4. 各特徴を後述の 6 視点(知覚/場/マーク/色/物質/時間)のどれで実現するか対応表を書く。

ワークシートの型:

| 視覚的特徴(不変量) | それが担う知覚的役割 | 実装原理 | 主要パラメタ | 検証方法 |
|---|---|---|---|---|
| 例: 筆致が1本ずつ独立 | 「絵の具で描いた」感 | インスタンス化した筆致クワッド | 長さ/幅/密度 | 拡大して1本ずつ見えるか |
| 例: 筆致が輪郭に沿う | 形態の説明 | 構造テンソル方向場 | 平滑化半径 | 顔の輪郭で向きが揃うか |
| 例: 群青×黄の補色 | 時代の色彩 | 輝度ゾーン別スプリットトーン | 各ゾーンの色 | 実作品と並べて比較 |

### 1.2 最重要原則: 一次特徴を後処理で近似しない

このリポジトリには同じ題材の失敗作と成功作が両方ある。

- `van-gogh_sakana.html`(旧作): 流れ方向にピクセルを**ぼかす**方式。
  「筆致」という様式の一次特徴を、ブラー+ノイズという後処理で近似した。
  結果は「ノイズの乗ったぼやけた写真」にしかならなかった。
- `fable5_van-gogh.html`(新作): 数万個の筆致クワッドを**実際に1本ずつ置く**方式。
  一次特徴(独立した筆致)をレンダリング構造そのものとして実装した。

> **様式の核になる特徴は、シェーダの「見た目調整」ではなく、
> 描画アーキテクチャ(何を・何個・どう描くか)のレベルで実装する。**

ぼかし・色調整・オーバーレイで足せるのは二次的な特徴(質感・トーン)だけである。

### 1.3 6視点モデル

どんな様式も、以下の 6 つの独立した設計軸に分解できる。
新作の設計とは、この 6 枠を埋めることに等しい。

| 視点 | 問い | 代表的な手段 |
|---|---|---|
| **知覚** | 入力映像から何を読み取るか | 輝度、エッジ、方向場、領域、動き |
| **場** | 画面全体を支配する流れ・構造は何か | ノイズ、渦、流体、重力 |
| **マーク** | 画面を構成する最小単位(筆致・文字・粒・線)は何か | スプラッティング、グリフ、粒子、線 |
| **色** | どんな色空間・パレットに写像するか | スプリットトーン、量子化、補色 |
| **物質** | 何の上に何で描かれた「モノ」なのか | 紙・カンバス、厚み、光沢、粒状 |
| **時間** | 静止画でなく映像であることをどう使うか | 安定性、揺らぎ、残像、脈動 |

### 1.4 「写真 ↔ 様式」軸の設計

カメラ作品の本質的なトレードオフは **被写体の残存(認識できる)** と **様式の強さ(絵に見える)**。

- 入力から「生き残らせる信号」を最初に決める。
  - ASCII: 輝度のみ / 一筆書き: エッジのみ / 油絵: 形態+部分的な色 / 水面: 形態+動き
- 生き残らせる信号は**高精細に**、置き換える信号は**大胆に**。中途半端が一番弱い。
- UI スライダーは必ずこの軸に沿って設計する(例: Palette strength = 色の置換度、
  Stroke length = 形態の破壊度)。ユーザーが軸上を動けることが作品の懐の深さになる。
- 顔が題材なら「目・鼻・口の周辺だけ様式を弱める」ゲーティング(エッジ強度で制御)が有効。

### 1.5 反復の作法

1. 1回の反復で直すのは **1〜3点まで**。全部一度に変えると因果が分からなくなる。
2. 直す前に、スクリーンショットを見て問題を**言語化**する
   (「毛糸っぽい」→ 筆致のアスペクト比が高すぎる、と翻訳してから触る)。
3. パラメタは倍率で動かす(1.0 → 1.5 → 0.75)。微調整は最後。
4. 縮小表示(遠目)と等倍表示の両方で判断する。様式は遠目で、破綻は等倍で見える。

---

## 2. 共通アーキテクチャ(作品の骨格)

### 2.1 単一 HTML・無依存という制約

本リポジトリの作品はすべて「1つの HTML、外部ライブラリなし、GitHub Pages で動く」。
この制約は意図的なもの:

- 依存が無い = 10年後も動く可能性が高い。ビルド不要で fork・改造が容易。
- WebGL2 + GLSL ES 3.00 は現行ブラウザで安定して使える最小公倍数。
- 例外は ML 系(人物セグメンテーション等)のみ CDN 許容(`fable5_water-cam.html` の MediaPipe)。

### 2.2 ファイル構成テンプレート

```
<!doctype html>
<!-- ヘッダコメント: 作品名 / 実行方法 / 様式解析 / パイプライン図 / スライダー一覧 -->
<html>
<head>  <style>   … パネル・オーバーレイの CSS … </style> </head>
<body>
  <canvas id="gl"></canvas>
  <video id="video" playsinline muted autoplay></video>   <!-- 不可視 -->
  <button id="togglePanel">HIDE UI</button>
  <button id="flipCamera">REAR CAM</button>               <!-- モバイルのみ表示 -->
  <section id="panel"></section>                          <!-- JSで生成 -->
  <div id="overlay">…カメラ要求/エラー表示…</div>
  <script> (() => { "use strict"; /* 全ロジック */ })(); </script>
</body>
</html>
```

ヘッダコメントに**様式解析とパイプライン図を書き残す**こと。未来の自分への最重要ドキュメント。

### 2.3 カメラ取得の定石

```js
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: state.facingMode,          // "user" | "environment"
           width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
});
video.srcObject = stream;
await video.play();
```

必須の周辺処理:

- **セキュアコンテキスト必須**: `https:` か `localhost` 以外では動かない。
  事前に判定して専用エラーメッセージを出す(黙って失敗させない)。
- `<video>` は `playsinline muted autoplay` の3点セット(iOS対策)。
- エラーは `error.name` で分岐: `NotAllowedError`(拒否) / `NotFoundError` /
  `OverconstrainedError`(カメラ無し) / その他。各々に再試行ボタン付きの案内を出す。
- カメラ切替時は旧ストリームの `track.stop()` を忘れない。
- **ミラー**: フロントカメラは鏡像(セルフィー慣習)、リアは非鏡像。
  ミラーはシェーダの UV 反転で行い、パイプラインの残りは正像を見る。
- テクスチャ更新は毎フレーム:

```js
if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
}
```

- `gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)` を最初に1回
  (DOM 由来アップロードのみに効く。FBO には無関係)。

### 2.4 cover-fit(アスペクト比の吸収)

カメラとキャンバスの縦横比は一致しない。CSS の `object-fit: cover` 相当を UV で行う:

```glsl
vec2 coverUv(vec2 uv, vec2 canvasRes, vec2 videoRes, bool mirror) {
  float ca = canvasRes.x / canvasRes.y, va = videoRes.x / videoRes.y;
  vec2 st = uv;
  if (ca > va)      st.y = (uv.y - 0.5) / (ca / va) + 0.5;   // 横長キャンバス: 縦を切る
  else              st.x = (uv.x - 0.5) / (va / ca) + 0.5;   // 縦長キャンバス: 横を切る
  if (mirror) st.x = 1.0 - st.x;
  return st;
}
```

最初のパスで cover-fit 済みの「シーンテクスチャ」を作り、以後の全パスはそれだけを見る。
こうするとアスペクト比・ミラーの問題がパイプラインから消える。

### 2.5 マルチパスの骨格コード

全パスは「フルスクリーン三角形 + フラグメントシェーダ」が基本形。

```glsl
// 共通頂点シェーダ(頂点バッファ不要)
#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](vec2(-1,-1), vec2(3,-1), vec2(-1,3));
out vec2 vUv;
void main() { vec2 p = POS[gl_VertexID]; vUv = p*0.5+0.5; gl_Position = vec4(p,0,1); }
```

```js
// パス実行ヘルパ
function renderPass(target, program, setup) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
  gl.viewport(0, 0, target ? target.width : canvas.width,
                    target ? target.height : canvas.height);
  gl.useProgram(program);
  setup();                       // uniform とテクスチャのバインド
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// FBO 生成(RGBA8 基本。float が要る場合は §12 参照)
function makeTarget(w, h, mipmap = false) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
                   mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
    throw new Error("FBO incomplete");
  return { tex, fbo, width: w, height: h };
}
```

覚えておくこと:

- **同じテクスチャを読みながら書けない** → 2枚用意して交互に使う(ping-pong)。
- uniform 位置は `gl.getActiveUniform` で全列挙して名前→location の辞書を作ると楽。
- リサイズ時は FBO を作り直す。`devicePixelRatio` は 2 で頭打ちにする。
- キャンバスコンテキストは `preserveDrawingBuffer: true` にすると
  `canvas.toDataURL()` で「PNG保存」ボタンが実装できる。

### 2.6 UI パネルの定石

```js
const state = { swirl: 1.0, brushSize: 1.69, /* … */ };   // 全パラメタの単一ソース
const uiRows = [
  // [key, ラベル, ヒント, min, max, step]
  ["swirl", "Swirl", "flat regions curl", 0, 1.8, 0.01],
];
// uiRows から <input type=range> 群を innerHTML で生成し、input イベントで state を更新。
// "RESET LOOK" は DEFAULTS オブジェクトを Object.assign で書き戻すだけ。
```

- スライダーは §1.4 の「写真↔様式」軸に沿って命名・配列する。
- **プリセット**(`<select>`)は「参考にした実作品名」で命名すると作品の説得力が上がる
  (例: The Starry Night · 1889)。プリセット = 色などの uniform セット。
- FPS / 解像度 / 描画要素数の readout を常設する(性能退行に即気づける)。
- `prefers-reduced-motion` を初期値に反映(アニメ停止トグルをONに)。
- モバイル: パネルは下部シート化、カメラ切替ボタンを表示(メディアクエリで出し分け)。

---

## 3. 知覚レイヤー — 映像から何を読み取るか

すべての様式は「入力から何を測るか」で決まる。以下は測定器のカタログ。

### 3.1 輝度と前処理

```glsl
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
```

- 判定・解析は輝度で、描画は色で行うのが基本。
- カメラ映像はノイジー。解析前に軽い平滑化(3×3 ガウシアン or ダウンサンプル)を挟むと
  すべての下流が安定する。
- 露出が環境依存で暴れる場合は、輝度ヒストグラムの min/max を EMA で追跡して正規化する
  (簡易オートゲイン)。

### 3.2 Sobel 勾配(エッジの強さと向き)

```glsl
// 8近傍の輝度 tl,tc,tr,ml,mr,bl,bc,br を取ってから:
float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
float gy = -bl - 2.0*bc - br + tl + 2.0*tc + tr;
vec2 grad = vec2(gx, gy);        // エッジを「横切る」方向
float mag = length(grad);        // エッジの強さ
vec2 tangent = vec2(-gy, gx);    // エッジに「沿う」方向(90度回転)
```

用途: 筆致の向き、輪郭抽出、被写体部分の様式弱め(ゲーティング)、線画。

### 3.3 構造テンソルと ETF(Edge Tangent Flow) — 方向場の本命

Sobel を1画素で使うと向きがガタつく。**構造テンソルを空間平滑化してから固有解析**すると、
輪郭に沿った滑らかな方向場(ETF)が得られる。絵画系・線画系の質を最も左右する技術。

```glsl
// 1) 各サンプル点で tensor = (gx*gx, gx*gy, gy*gy) を計算
// 2) ガウシアン重みで近傍(例: 3×3 を間隔2.4pxで)を平均 → E, F, G
float det   = sqrt(max((E-G)*(E-G) + 4.0*F*F, 0.0));
float phi   = 0.5 * atan(2.0*F, E - G) + 1.5707963;  // +π/2 で「接線」方向
float aniso = det / (E + G + 1e-5);                  // 異方性 0(等方)〜1(強い線)
float mag   = clamp(sqrt(E + G) * k, 0.0, 1.0);      // エッジ強度
```

**二重角表現**: 方向は θ と θ+180° が同値なので、そのまま `vec2(cosθ, sinθ)` を
テクスチャに入れるとバイリニア補間で符号が反転する境界が生じる。
`vec2(cos2θ, sin2θ)` で格納し、読む側で `θ = 0.5 * atan(v.y, v.x)` と復号すると、
補間もブレンドも破綻しない。**2つの方向場を混ぜるときも二重角ベクトル同士を mix して
normalize する**(角度を直接 lerp してはいけない)。

方向場は低解像度(1/3〜1/4)で十分。むしろ低解像度の方が滑らかで良い。

### 3.4 DoG / XDoG(線画抽出)

ガウシアン差分。線画・スケッチ・漫画風の核。

```
D(x)  = G_σ(x) − k·G_{kσ}(x)                     // 通常の DoG(k ≈ 1.6)
S(x)  = (1 + p)·G_σ(x) − p·G_{kσ}(x)             // XDoG: p で輪郭を強調(p = 20〜40)
T(u)  = u ≥ ε ? 1.0 : 1.0 + tanh(φ·(u − ε))      // 軟判定しきい値(ε≈0.5〜0.8, φ=10〜100)
```

実装は「σ でぼかしたパス」「kσ でぼかしたパス」(それぞれ縦横分離の2パス)を作って合成。
σ を大きくすると太い構造だけ、小さくすると細部まで拾う。
ETF に沿ってぼかす(Flow-based DoG)と線がさらに滑らかになる。

### 3.5 Kuwahara フィルタ(絵画的平坦化)

近傍を4象限に分け、各象限の平均と分散を計算し、**分散が最小の象限の平均色**を出力。
エッジを保ちながら面をベタ塗り化する。油絵・水彩の下地に有効。
発展形: 円形8セクタ版、構造テンソルで回転させる異方性 Kuwahara(品質最高)。

### 3.6 時間方向の解析

- **EMA(指数移動平均)**: `smoothed = mix(prev, current, α)`(α = 0.05〜0.3)。
  解析結果(輝度・方向場)を EMA するとチラつきが激減する。ping-pong FBO で実装。
- **フレーム差分**: `abs(cur − prev)` で動き量。動いた場所だけインクを落とす、
  粒子を発生させる、等のトリガに使える。
- **簡易オプティカルフロー**: 輝度勾配と時間差分から
  `flow ≈ −dt·grad / (|grad|² + ε)`(Lucas-Kanade の1画素版)。粗いが流体の外力に十分。

### 3.7 セグメンテーション・顔(外部MLを使う場合)

人物マスクが要る表現(`fable5_water-cam.html`: 人体だけ水になる)は
MediaPipe Tasks-Vision(CDN)の selfie_segmenter を使う。

- マスクは低解像度(256²)で来る → **フェザリング(ぼかし)パスを必ず挟む**。
- マスク由来のエッジ場(Sobel)を作ると「輪郭ぎわだけ光る/滴る」等の演出ができる。
- ML 推論は毎フレームでなく 2〜3 フレームに1回でも見た目は保てる(EMA併用)。

---

## 4. 場レイヤー — ノイズと流れの設計

### 4.1 基本ノイズ一式(コピペ用)

```glsl
float hash12(vec2 p) {                       // 2D → 1D ハッシュ(定番 pcg 系)
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {                       // 値ノイズ(バイリニア補間)
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i),               hash12(i + vec2(1,0)), f.x),
             mix(hash12(i + vec2(0,1)),   hash12(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {                          // フラクタルブラウン運動(4オクターブ)
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);        // 回転でグリッド痕を消す
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = r * p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
```

- **ドメインワープ** `fbm(p + k*vec2(fbm(p), fbm(p+5.2)))` は雲・大理石・墨の濃淡に。
- セル/ボロノイノイズは §5.8。

### 4.2 curl noise(発散のない流れ)

ノイズの勾配を90度回転させると、湧き出しのない「渦っぽい」ベクトル場になる。
粒子や筆致を流すのに最適(密度が偏らない)。

```glsl
vec2 curl(vec2 p) {
  vec2 e = vec2(0.01, 0.0);
  float nx1 = fbm(p + e.xy), nx0 = fbm(p - e.xy);   // ∂n/∂x
  float ny1 = fbm(p + e.yx), ny0 = fbm(p - e.yx);   // ∂n/∂y
  return vec2(ny1 - ny0, -(nx1 - nx0)) / (2.0 * e.x);
}
```

### 4.3 渦場(明示的な vortex)

『星月夜』のような「見せる渦」は curl noise では弱い。中心を持つ渦を明示的に置く:

```glsl
vec2 field = vec2(0.0);
for (int i = 0; i < 4; i++) {
  vec2 c = /* 時間でゆっくり漂う中心 */;
  vec2 d = p - c;
  float spin = (i % 2 == 0) ? 1.0 : -1.0;
  field += spin * vec2(-d.y, d.x) / (dot(d, d) + 0.02);   // 接線方向 / 距離減衰
}
field += curl(p * 3.6) * 16.0;      // ベースの乱流を足す
```

分母の `+0.02` は中心の発散防止と渦径の調整を兼ねる。

### 4.4 方向場の合成(知覚 × 場)

被写体は ETF に従い、平坦部は場に従う。**コヒーレンス(確信度)で重み付けして合成**する:

```glsl
float coher = smoothstep(0.04, 0.16, mag) * smoothstep(0.18, 0.55, aniso);
vec2 dir2 = normalize(mix(swirlDoubleAngle, etfDoubleAngle, coher));  // 二重角で混合
```

これが「顔は輪郭に沿い、背景は渦巻く」を1枚のテクスチャで実現する要。
出力レイアウト例: `RGBA = (cos2θ*0.5+0.5, sin2θ*0.5+0.5, coher, edgeMag)`。

---

## 5. マークレイヤー — 表現手法カタログ

各手法: **原理 → 実装の要点 → パラメタ設計 → 落とし穴** の順。
該当作品はファイル名から対応が分かるものを付記。

### 5.1 筆致スプラッティング(油絵・パステル・点描) — `fable5_van-gogh.html`

**原理**: 画面をジッター付きグリッドで覆い、各セルに1本の「筆致クワッド」を
インスタンシングで描く。向きは方向場、色は筆致中心の1点(面積平均)から採る。
**筆致1本 = ほぼ均一な1色** が油絵らしさの核心。

実装の要点:

```glsl
// 頂点シェーダ(インスタンスごとに実行される計算)
vec2 cell = vec2(float(gl_InstanceID % uCols), float(gl_InstanceID / uCols));
vec2 centerPx = (cell + 0.5) * uSpacing + (hash22(cell) - 0.5) * uSpacing * 1.15;
vec4 flow  = textureLod(uFlow, centerPx / uRes, 0.0);       // 方向場(VTF)
float angle = 0.5 * atan(flow.y*2.0-1.0, flow.x*2.0-1.0);   // 二重角の復号
vec3 color = textureLod(uColor, centerPx / uRes, lod).rgb;  // ミップ = 面積平均色
// 6頂点(2三角形)のコーナーを dir/nrm で展開して gl_Position へ
```

- 色テクスチャは毎フレーム `generateMipmap` し、`lod ≈ log2(spacing/2)` で読む。
  これで「筆致の下の平均色」が1回のフェッチで得られる(WebGL2はNPOTミップ可)。
- **粗→細の多層**(例: 間隔34px → 19px → 10.5px → 輪郭用6.5px)を後勝ちで重ねる。
  細部レイヤーはエッジ強度でゲート(平坦部には置かない)して「密度の緩急」を作る。
- フラグメント側: 局所座標 (u,v) で丸端矩形+剛毛の筋(1Dノイズ)+端の欠け。
  `v -= curve * (u*u - 0.4)` で「コンマ状に曲がる」筆致になる(平坦部ほど曲げる)。
- MRT で高さも同時に書き、後段でレリーフ照明(§7.1)。

パラメタ設計: 長さ/幅比は 2.5:1〜4:1(細長すぎると毛糸になる)。
エッジ上の筆致は短く(×0.55)、平坦部は長く(×1.25)。

落とし穴: 筆致が長いと色境界をまたいで「色が漏れる」→ エッジで短縮+輪郭レイヤーで再定義。
乱数シードはセル座標から取る(時間から取るとチラつく)。

### 5.2 グリフモザイク(ASCII・タイポ) — `ascii_*.html`, `fable5_typo-cam.html`

**原理**: 画面をセル分割し、各セルの平均輝度に応じた文字をグリフアトラスから貼る。

実装の要点:

1. 起動時に 2D canvas へ文字群を等幅で描き、各文字の**インク被覆率**を数えて
   暗→明に整列したアトラステクスチャを作る(被覆率が単調でないと階調が壊れる)。
2. シェーダ:

```glsl
vec2 cell = floor(vUv * uGrid);
vec2 cuv  = fract(vUv * uGrid);                       // セル内座標
float l   = luma(texture(uScene, (cell + 0.5) / uGrid).rgb);
float idx = floor((1.0 - l) * (uGlyphCount - 1.0) + 0.5);
float ink = texture(uAtlas, vec2((idx + cuv.x) / uGlyphCount, cuv.y)).r;
```

- セル輝度はダウンサンプル済みテクスチャ(セル解像度と同じ大きさ)から読むと安定。
- **チラつき対策が品質の8割**: セル輝度を EMA し、さらに「隣の文字に変わるのは
  しきい値を跨いで数フレーム続いた時だけ」というヒステリシスを入れる。
- 色付けは「文字色=セル色 × 輝度補正」か「単色ターミナル風」の2路線。

### 5.3 線画系(輪郭線・スクリブル・一筆書き) — `fable5_scribble-cam.html`, `fable5_oneline-cam.html`

- **輪郭線**: XDoG(§3.4)+ ETF 方向ぼかしで安定した線。紙テクスチャに乗算合成。
- **ハッチング**: 方向場に沿った平行線 `sin(dot(p, nrm) * freq)` を
  輝度しきい値で段階的に重ねる(暗いほど層を増やす。クロスハッチは2方向目を直交で)。
- **スクリブル(ぐるぐる描き)**: 粒子(§5.5)をエッジ+暗部に引き寄せつつ curl で
  揺らし、軌跡をフィードバックバッファ(§5.10)に描き溜める。
  「誤差蓄積」型: まだ暗くなっていない場所ほど強く引き寄せると密度が輝度に収束する。
- **一筆書き**: 1本の折れ線の頂点列を JS で管理。各頂点を「近傍の暗い場所」へ
  毎フレーム少しずつ移動(引力=輝度勾配、斥力=自己交差回避、平滑化=隣接頂点との
  バネ)。線はテクスチャに描かず LINE_STRIP で直接描く。

### 5.4 水墨・水彩 — `suibokuga_*.html`

**原理**: 「にじみ(拡散)」「エッジダーク(顔料の縁溜まり)」「紙の粒状」の3点セット。

- **にじみ**: 墨量テクスチャを ping-pong で反復拡散。等方ブラーではなく、
  紙ノイズの勾配方向に偏らせた拡散にすると繊維ににじむ。
  しきい値付き拡散(`ink > paperResist ? 広がる : 止まる`)で輪郭が不規則になる。
- **エッジダーク**: 墨量 α の勾配が大きい所を暗くする:
  `color *= 1.0 - k * smoothstep(0.0, 0.3, length(vec2(dFdx(a), dFdy(a))))`。
  これだけで一気に水彩に見える(最重要)。
- **紙**: fbm の谷に顔料が溜まる= `pigment *= 0.9 + 0.2 * paperNoise`。
  乾いた刷毛(かすれ)は、進行方向に伸ばした1Dノイズで墨量をゲート。
- 墨の投下は「フレーム差分(動き)」や「エッジ」をトリガにすると
  被写体が動くたびに描き足される作品になる。

### 5.5 粒子系(群れ・火花・砂) — `iwashi_ball_*.html`, `suibokuga_particle.html`

**原理**: 粒子の状態(位置・速度)を float テクスチャに格納し、
更新はフラグメントシェーダ、描画は `gl_VertexID` で状態をフェッチする頂点シェーダで行う。

```glsl
// 更新パス(状態テクスチャ ping-pong)
vec4 pos = texelFetch(uPos, ivec2(gl_FragCoord.xy), 0);
vec4 vel = texelFetch(uVel, ivec2(gl_FragCoord.xy), 0);
// 力: curl場 + 輝度勾配(明るい方へ) + 中心回帰 など
// 描画パス(gl.POINTS を N 個)
ivec2 ij = ivec2(gl_VertexID % texW, gl_VertexID / texW);
vec4 p = texelFetch(uPos, ij, 0);
gl_Position = vec4(p.xy, 0.0, 1.0);  gl_PointSize = ...;
```

- float テクスチャへの描画は `EXT_color_buffer_float` が必要(§12)。
  代替: RGBA8 に 16bit 固定小数で2チャンネルずつパック(モバイル安全)。
- **群れ(boids)**: 厳密な近傍探索は不要。「粗いグリッドに平均速度を書いた
  低解像度テクスチャ」を参照して整列させれば、O(N) で群れに見える。
  分離は「自分の周囲の粒子密度テクスチャ」の勾配から取る。
- 魚群など形が要る場合は POINTS でなくインスタンス化した細長い三角形を
  速度方向に向ける。尾びれは `sin(time*freq + phase)` で頂点を揺らす。

### 5.6 流体シミュレーション(Stable Fluids) — `suibokuga_fluid.html`

**原理**: Jos Stam の安定流体。速度場と染料場を半ラグランジュ移流し、
圧力投影で非圧縮にする。全パス半解像度で十分。

パス構成(毎フレーム、この順):

1. **移流**: `vel(x) = vel_prev(x − dt * vel_prev(x))`(バイリニア補間)
2. **外力**: マウス/オプティカルフロー/輝度勾配を速度に加算
3. (任意)**渦度強化**: `ω = ∂v/∂x − ∂u/∂y` を求め `ε·(∇|ω|×ω)` を加える(渦が保つ)
4. **発散**: `div = 0.5 * (vR.x − vL.x + vU.y − vD.y)`
5. **圧力**: ヤコビ反復 `p = (pL + pR + pU + pD − div) / 4.0` を 20〜50 回
6. **投影**: `vel −= 0.5 * vec2(pR − pL, pU − pD)`
7. **染料移流**: 速度場で色を運ぶ(僅かに減衰 ×0.995)

- 反復回数は品質と負荷の直接トレード。モバイルは 20 回+半解像度。
- 速度・圧力は RGBA16F(`EXT_color_buffer_float`)。染料は RGBA8 でよい。
- カメラ連携: フレーム差分(§3.6)を外力にすると「動くと墨が舞う」になる。

### 5.7 屈折・水・ガラス — `fable5_water-cam.html`

**原理**: 法線マップで UV をずらして背景を読む(屈折)+ フレネル + スペキュラ。

```glsl
vec3 n = normalFromHeight(...);                        // fbm や流体から生成
vec3 refr = texture(uScene, uv + n.xy * uRefract).rgb; // 屈折
float fresnel = pow(1.0 - max(n.z, 0.0), 3.0);         // 縁ほど反射
float spec = pow(max(dot(n, halfDir), 0.0), 60.0);     // 鋭いハイライト
```

- 人物マスク(§3.7)内だけ屈折させると「水でできた人」になる。
- 高さ場を時間で流す(`fbm(p + vec2(0, t))`)と流下する水膜。
- 滴(ドリップ)はシルエット下端の列ごとに1Dハッシュで速度を変えて落とす。

### 5.8 モザイク・ボロノイ・ステンドグラス

```glsl
// セルラーノイズ: 最近傍の特徴点までの距離と ID
vec2 g = floor(p); vec2 f = fract(p);
float d1 = 8.0; vec2 id;
for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++) {
  vec2 o = vec2(x, y);
  vec2 r = o + hash22(g + o) - f;
  float d = dot(r, r);
  if (d < d1) { d1 = d; id = g + o; }
}
```

- セル ID の位置で映像色をサンプル → 各セルがベタ塗りタイルに。
- 2番目に近い距離 d2 との差 `d2 − d1` が小さい所=セル境界 → 黒鉛線(ステンドグラス)。
- セル密度をエッジ強度で変える(顔は細かく、背景は粗く)と主題が立つ。

### 5.9 ハーフトーン・ディザ

- **網点**: 回転グリッド上の距離で円を描く。
  `r = sqrt(1.0 - luma) * 0.7; dot = smoothstep(r, r - aa, length(fract(p) - 0.5))`
  CMYK 4版を 15°/75°/0°/45° で重ねると印刷風(モアレは仕様であり味)。
- **Bayer ディザ**: 4×4 行列(0..15)/16 をしきい値に `step(threshold, luma)`。
  レトロ・新聞・リソグラフ風。誤差拡散はGPUに向かない(逐次依存)ので Bayer か
  ブルーノイズテクスチャで代用する。

### 5.10 フィードバック・残像・オーラ — `overflowing_aura*.html`, `live_portrait_in_flux.html`

**原理**: 前フレームの自分自身を読み、減衰・変形させて今フレームに合成(ping-pong 必須)。

```glsl
vec3 prev = texture(uPrev, vUv + warp * 0.002).rgb;   // 少しずらす=流れる残像
vec3 cur  = ...;
fragColor = vec4(max(cur, prev * uDecay), 1.0);       // max型: 光の軌跡
// mix(prev, cur, a) 型: もやのような溶け合い
```

- `warp` に curl 場や外向き放射を入れると「オーラが立ち上る」。
- 減衰 0.90〜0.98 の差は巨大。0.001 刻みで詰める価値がある。
- 完全に黒に戻らない問題(残留)は `max(prev * decay - 1.0/255.0, 0.0)` で解消。

### 5.11 グリッチ・シフト

- 行単位の水平ずらし: `uv.x += (hash12(vec2(floor(uv.y * rows), floor(t*8.0))) - 0.5) * amp;`
  ただし `amp` は「たまに大きい」(しきい値付きハッシュ)にするのがコツ。常時だと安い。
- RGB チャンネルを別々の UV オフセットで読む(色収差)。
- ブロックノイズ: 粗いセルごとに別フレーム(EMAテクスチャ)を読む。

---

## 6. 色の設計

### 6.1 実作品からパレットを採取する

- 8〜16 色。**色相の網羅ではなく明度域の網羅**を優先する
  (最暗部・暗部・中間・明部・最明部が全部パレット内にあること)。
- 名画の影は黒ではない(ゴッホの影は群青、印象派の影は紫)。
  影用の色を必ず「色相を持った暗色」にする。
- スポイトで拾うだけでなく、グレースケール化した参考画像と見比べて
  「どの明度帯にどの色相が割り当てられているか」の対応表を作る。

### 6.2 輝度ゾーン別スプリットトーン(推奨手法)

パレット最近傍量子化(全画素を最も近いパレット色に置換)は硬く濁りやすい。
まず試すべきは**輝度ゾーンごとに目標色へ寄せる**方式:

```glsl
float l  = luma(c);
float sw = 1.0 - smoothstep(0.10, 0.48, l);                       // 影ゾーン
float mw = smoothstep(0.18, 0.5, l) * (1.0 - smoothstep(0.5, 0.85, l)); // 中間
float hw = smoothstep(0.55, 0.95, l);                             // ハイライト
c = mix(c, uShadow * (0.35 + 1.5 * l), sw * strength);
c = mix(c, uMid    * (0.45 + 1.1 * l), mw * strength * 0.5);
c = mix(c, uLight  * (0.75 + 0.35 * l), hw * strength);
```

- `* (0.35 + 1.5*l)` の形は「目標色を明度で変調」= ゾーン内の階調を保つ工夫。
- **灰色度重み**: 彩度の低い画素ほど強く寄せ、色のある物体は地の色を残す。
  `gray = 1.0 - clamp((max(c.rgb) - min(c.rgb)) * 2.4, 0.0, 1.0)` を strength に乗算。
  これで「灰色の壁は絵の色になり、赤い服は赤いまま強調される」。

### 6.3 補色分離

彩度スライダーの代わりに、暖色と寒色を反対方向へ押す:

```glsl
float warm = clamp((c.r + 0.55*c.g - 1.25*c.b) * 1.4, -1.0, 1.0);
c *= mix(vec3(0.88, 0.97, 1.16),      // 寒色は青へ
         vec3(1.14, 1.04, 0.80),      // 暖色は黄へ
         warm * 0.5 + 0.5);
```

単純な彩度上げより「絵の具の対比」に近づく。

### 6.4 マーク単位の色操作(分割筆触)

色処理には2つの階層がある: **画素単位**(§6.2〜6.3)と**マーク単位**。
筆致・粒子・タイルごとに:

- 暖冷ジッター: 隣接マークで交互に暖色/寒色へ僅かに振る(hash で決定)。
- 明度ジッター: ±10〜15%。
- 補色アクセント: 確率 2〜3% でパレットのアクセント色に置換(画面が締まる)。

これらは頂点シェーダ(マークごとに1回)で行うのが自然で安価。

### 6.5 その他

- 最終出力の直前に `pow(c, vec3(0.95〜1.0))` で僅かに持ち上げると「ワニス感」。
- 高度な補間・混色が要る場合は OKLab / OKLCH を検索(知覚均等色空間)。
- 量子化するなら輝度も距離に含める:
  `dist = dot(d,d) + (luma(c)-luma(p))² * 0.35`(シーンの明暗関係が崩れない)。

---

## 7. 物質感の設計

### 7.1 高さ場 → 法線 → レリーフ照明(インパスト)

「厚み」は色でなく**光**で表現する。マーク描画時に高さも書き(MRT)、
最終合成で法線を導出してライティング:

```glsl
float hL = texture(uH, uv - vec2(texel.x, 0)).r,  hR = texture(uH, uv + vec2(texel.x, 0)).r;
float hD = texture(uH, uv - vec2(0, texel.y)).r,  hU = texture(uH, uv + vec2(0, texel.y)).r;
vec3 n = normalize(vec3((hL - hR) * k, (hD - hU) * k, 1.0));   // k = 強度 × 2〜4
vec3 L = normalize(vec3(-0.5, 0.62, 0.72));                    // 左上からの定番光
float diff = clamp(dot(n, L), 0.0, 1.0);
float spec = pow(max(dot(n, normalize(L + vec3(0,0,1))), 0.0), 16.0);
col *= mix(1.0, 0.68 + 0.48 * diff, amount);
col += lightColor * spec * amount * 0.2;
```

- スペキュラの強さと鋭さ(指数)で「油絵(鈍い16)↔ 濡れた水面(鋭い60+)」が変わる。
- やり過ぎるとプラスチックになる。diff の振れ幅(0.68+0.48)を狭めるのが先。

### 7.2 紙・カンバス

```glsl
float wx = sin(p.x * 1.85 + 2.2 * fbm(uv * 34.0));   // 縦糸(位相をノイズで揺らす)
float wy = sin(p.y * 1.62 + 2.2 * fbm(uv.yx * 29.0)); // 横糸
float weave = wx * wy * 0.5 + (fbm(p * 0.05) - 0.5) * 0.6;
col *= 1.0 + weave * amount * (0.08 + 0.26 * thin);   // thin = 絵の具が薄い所ほど見える
```

**「絵の具が厚い所では下地が見えない」**という物理を入れる(高さ場と連動)と一気に本物らしい。
和紙は weave でなく fbm 主体+繊維(伸ばした1Dノイズ)。

### 7.3 仕上げ(全作品共通の最終パス)

順序も含めて定石: レリーフ照明 → 地のテクスチャ → ビネット → 色被せ → ガンマ。

```glsl
vec2 d = uv - 0.5;  d.x *= aspect;
col *= mix(0.82, 1.03, smoothstep(0.95, 0.25, dot(d, d)));   // ビネット
col *= vec3(1.015, 0.995, 0.955);                            // 暖色ワニス
fragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.96)), 1.0);
```

粒状(グレイン)を足すなら `(hash12(fragCoord + t) - 0.5) * 0.03`。時間で変えると
フィルム、固定すると印刷物の質感になる。

---

## 8. 時間の設計

### 8.1 チラつき(フリッカ)対策 — 動画作品の生命線

チラつきの原因は例外なく「**フレームごとに変わる乱数・判定**」。対策の優先順:

1. 乱数シードは**スクリーン空間のセル座標**から取る(時間を混ぜない)。
   マークの位置・形・色ジッターが全フレームで同一になり、色だけが映像に追従する。
2. 解析値(輝度・方向場)は EMA(§3.6)で平滑化してから使う。
3. 離散的な切替(グリフ選択・しきい値)にはヒステリシスを入れる。
4. どうしても揺らぎが欲しい部分だけ、**低周波の時間ノイズ**(0.5Hz 以下)で動かす。

### 8.2 「生きている絵」の作り方

静止したカメラでも絵が死なないように:

- マークの角度を `sin(t * 0.7 + hash * 2π) * 0.05` 程度で微揺動(呼吸)。
- 場(渦・ノイズ)の座標を `t * 0.02` 程度で漂流させる。
- 明滅・脈動は輝度でなくスペキュラや彩度に載せると品がある。

必ず**一時停止トグル**を付け、`prefers-reduced-motion` で初期ONにする。

### 8.3 時間スケールの分離

「速い動き=映像への追従」「中speed=粒子・流体」「遅い=場の漂流」の3層に分け、
それぞれ独立した係数を持たせる。全部同じ速度で動くと安っぽくなる。

---

## 9. 性能設計

### 9.1 解像度戦略(最も効く)

| バッファ | 推奨解像度 | 理由 |
|---|---|---|
| 表示キャンバス | CSS×DPR(上限2) | 見た目の解像度 |
| マーク描画(paint) | 長辺 1280〜1440 に上限 | フィルレートの主犯。最終パスで拡大 |
| 方向場・解析 | paint の 1/3〜1/4 | 滑らかさはむしろ向上 |
| 流体・ブラー | 1/2〜1/4 | 低周波なので劣化が見えない |

`paintScale = min(1, 1408 / max(w, h))` のような上限を最初から入れておく。

### 9.2 コスト見積りの暗算

- フィルレート: モバイルGPUはおおむね 2〜4 Gpx/s。60fps なら1フレーム 30〜60 Mpx。
  フル解像度(2Mpx)のパスは**10本前後が上限**と覚える。
- インスタンス: 筆致4万個 × 平均 400px = 16Mpx。1080p のフルパス8本ぶん。
  重なり(オーバードロー)が実質コストなので、幅×長さ×個数で管理する。
- ヤコビ反復: 半解像度 0.5Mpx × 40回 = 20Mpx。反復回数はスライダー化してよい。

### 9.3 その他の定石

- `gl.readPixels` を毎フレーム呼ばない(パイプラインが止まる)。
- `generateMipmap` は必要なテクスチャ1枚だけ。
- ブラーは必ず縦横分離(N² → 2N)。
- FPS readout を常設し、開発中に閾値割れへ即気づく(§2.6)。
- uniform 更新はまとめる。プログラム切替は最小に(パス順を工夫)。

---

## 10. 検証と反復 — AIなしで見た目を追い込む方法

「シェーダを書く→ブラウザで見る→直す」を人力で高速に回すための道具立て。

### 10.1 フェイクカメラ(その1): getUserMedia を差し替える

カメラなしの環境・再現可能なテスト映像で反復するには、ページ読み込み前に
`getUserMedia` を canvas ストリームに差し替える。開発コンソールや Playwright の
`addInitScript` に以下を仕込む:

```js
navigator.mediaDevices.getUserMedia = async () => {
  const c = document.createElement("canvas");
  c.width = 1280; c.height = 720;
  const x = c.getContext("2d");
  (function draw(t) {
    // ここに合成テストシーンを描く(下記 10.3)
    requestAnimationFrame(draw);
  })(0);
  return c.captureStream(30);
};
```

### 10.2 フェイクカメラ(その2): Chrome のフラグ

```
chrome --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
       [--use-file-for-fake-video-capture=/path/to/test.y4m]
```

フラグ版は許可ダイアログも消える。y4m を指定すれば実写でテストできる。

### 10.3 良いテストシーンの条件

合成シーンには次を必ず含める(様式の全側面を1枚で検査するため):

- **平坦なグラデーション領域**(空)→ 場・渦・色写像の検査
- **強い円形エッジ**(太陽・顔輪郭)→ 方向場・輪郭線の検査
- **顔らしき構造**(肌の陰影+目鼻)→ 被写体保存・ゲーティングの検査
- **暗部と最明部**(髪・ハイライト)→ パレットの明度域の検査

### 10.4 スクリーンショット反復ループ(Playwright)

```js
// shot.mjs — node shot.mjs http://localhost:8888/work.html out.png
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));  // ← シェーダエラーが出る
await page.addInitScript(/* 10.1 のフェイクカメラ */);
await page.goto(process.argv[2]);
await page.waitForTimeout(3500);
await page.click("#togglePanel");           // UIを隠す
await page.screenshot({ path: process.argv[3] });
await browser.close();
```

- `pageerror` フックが**シェーダコンパイルエラーの検出器**になる(throw する実装にしておく)。
- サーバは `python3 -m http.server 8888` で十分。
- SwiftShader(ソフトウェアGL)は激遅だが1枚の絵の検証には十分。FPS計測は実機で。

### 10.5 シェーダのデバッグ術

- **中間バッファの直視**: デバッグ用 uniform `uDebug` を最終パスに足し、
  `if (uDebug == 1) { fragColor = texture(uFlow, vUv); return; }` のように
  各パスの出力を切り替えて見られるようにする。原因の切り分けが一瞬になる。
- **false color**: 方向場は `hue = angle`、スカラー場は虹色マップで可視化。
  `fragColor = vec4(dir * 0.5 + 0.5, 0, 1)` だけでも向きの乱れが見える。
- **二分法**: 疑わしいパスを `fragColor = vec4(vUv, 0, 1)` に置換して素通しし、
  どのパスで壊れるかを特定してから中を見る。
- NaN の検出: `if (any(isnan(col))) fragColor = vec4(1,0,1,1);`(マゼンタ表示)。

---

## 11. トラブルシューティング表

| 症状 | 主な原因 | 対処 |
|---|---|---|
| 画面が真っ黒 | FBO incomplete(float 未対応フォーマット) | `checkFramebufferStatus` を throw に。RGBA8 に落とすか拡張を確認 |
| 〃 | normalize(ゼロベクトル) → NaN 伝播 | `normalize(v + vec2(1e-5, 0.0))` |
| 〃 | ブレンド有効のまま α=0 で描いた | パス前後で `enable/disable(BLEND)` を明示 |
| 〃 | viewport がターゲットと不一致 | renderPass ヘルパで毎回設定 |
| カメラが映らない | 非セキュアコンテキスト | localhost か HTTPS。事前判定してメッセージ表示 |
| 〃 | iOS の自動再生制限 | `playsinline muted` + `await video.play()` |
| 映像が上下反転 | FLIP_Y 未設定/二重適用 | DOM アップロードのみに効くことを理解して1回だけ |
| チラつく | 乱数シードに時間が混入 | シードはセル座標ハッシュに(§8.1) |
| 〃 | 解析値が生のまま | EMA+ヒステリシス(§3.6, §8.1) |
| 輪郭がガタつく | 方向場が画素単位 Sobel | 構造テンソル+平滑化+二重角(§3.3) |
| 縞・格子が出る | ノイズのオクターブ回転なし / セル境界 | fbm に回転行列、ジッター量を上げる |
| モバイルだけ壊れる | float テクスチャ・highp 非対応 | `EXT_color_buffer_float` 確認、RGBA8 パック代替 |
| モバイルで低FPS | DPR・フィルレート | DPR上限2、paint バッファ上限、レイヤー数削減 |
| 保存PNGが真っ黒 | preserveDrawingBuffer 無効 | コンテキスト生成時に true |
| デプロイ後だけ動かない | パスの大文字小文字 / 相対パス | GitHub Pages は大文字小文字を区別する |

---

## 12. GLSL / WebGL2 の罠一覧

実際に踏んだものを含む。シェーダが「文法は合ってるのに落ちる」時はまずここを見る。

1. **予約語**: `coherent`, `sample`, `filter`, `precise`, `restrict`, `readonly`,
   `writeonly`, `subroutine`, `input`, `output`, `common`, `partition`, `active` は
   GLSL ES 3.0 で変数名に使えない(本リポジトリでは `coherent` で実際にコンパイル失敗した)。
2. **`texture()` は頂点シェーダでも使える**(WebGL2)。ミップ付きは `textureLod` で
   明示 LOD を渡す(頂点シェーダには自動微分がないため)。
3. **MRT のブレンドは全アタッチメント共通**(WebGL2 に per-attachment blend はない)。
   クリアは `gl.clearBufferfv(gl.COLOR, i, [...])` をアタッチメントごとに。
4. **float テクスチャへ描く**には `EXT_color_buffer_float` の取得が必要
   (RGBA16F/RGBA32F を internalformat にするだけでは不可)。LINEAR フィルタには
   `OES_texture_float_linear`(RGBA32F の場合)。
5. **NPOT テクスチャ**は WebGL2 なら mipmap も REPEAT も可(WebGL1 との大きな違い)。
6. `pow(x, y)` は x<0 で未定義。`abs` か `max(x, 0.0)` を挟む。
7. 整数除算・剰余は負数で処理系差があった歴史がある。インデックス計算は非負を保つ。
8. ループ上限は uniform でもよいが、実際は `const int MAX` で回して `if (i >= uN) break;`
   の方がドライバ互換性・速度とも安全。
9. `mediump` のモバイル実機は本当に fp16 で動く。位置・UV 計算は `highp` を明示。
10. `dFdx/dFdy` はフラグメントのみ。2×2 クワッド単位なので細線で荒れる。
11. uniform 配列の location は `name[0]` で返る実装がある。名前正規化して辞書化する。
12. 乱数に `fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453)` は精度崩壊しやすい。
    §4.1 の hash12 を使う。
13. 同一テクスチャの read & write は未定義(黒・ちらつき・機種差)。必ず ping-pong。
14. `gl_PointSize` は書かないと未定義。上限も機種差がある(`ALIASED_POINT_SIZE_RANGE`)。

---

## 13. ケーススタディ: fable5_van-gogh.html

本ガイドの手順を実際に適用した記録。

**1) 様式の解体**(§1.1)— 後期ゴッホ(1888-90)の不変量:

| 不変量 | 6視点 | 実装 |
|---|---|---|
| 筆致が1本ずつ独立・1本1色 | マーク | インスタンス筆致クワッド ~4万個、ミップ採色 |
| 筆致が輪郭に沿って流れる | 知覚+場 | 構造テンソルETF、平坦部は渦場へブレンド |
| 補色対比・分割筆触 | 色 | ゾーン別スプリットトーン+マーク単位暖冷ジッター |
| 厚塗りの隆起 | 物質 | MRT高さマップ→法線→左上光 |
| 暗色の輪郭線 | マーク | 強エッジのみ細い暗筆致レイヤー |
| 作品ごとの配色 | 色 | 実作品採取の4プリセット |

**2) パイプライン**: カメラ → cover-fit → 色グレーディング(+mip)→
方向場(1/3解像度)→ 筆致4層(粗→細→輪郭、MRT)→ レリーフ照明+織り+ビネット。

**3) 検証**: フェイクカメラ(合成ポートレート)+ Playwright スクショで反復。
初回は `coherent` 予約語でコンパイル失敗(§12-1)。
2回目のスクショで「筆致が細長すぎて毛糸に見える」と言語化 → 幅+30%・長さ−15%、
照明のスペキュラ −33%、輪郭のゲート緩和。3回目で完成判定。

**4) 教訓**: 旧作(スミア方式)との差は §1.2 の原則そのもの。
様式の核はパラメタ調整では埋まらず、描画構造の選択で決まった。

---

## 14. 新作チェックリスト

**設計**
- [ ] 参考画像を集め、不変量を 5±2 個言語化した(§1.1)
- [ ] 6視点(知覚/場/マーク/色/物質/時間)の対応表を書いた(§1.3)
- [ ] 入力から「生き残らせる信号」を決めた(§1.4)
- [ ] パス構成図と各バッファの解像度・予算を決めた(§9)

**実装**
- [ ] 骨格テンプレ(§2)から開始し、パスを1本ずつ false-color で確認しながら追加
- [ ] 乱数シードはセル座標由来(§8.1)。解析値は EMA(§3.6)
- [ ] スライダーは「写真↔様式」軸で命名し、DEFAULTS と RESET を用意(§2.6)
- [ ] pause トグル+ reduced-motion、ミラー、カメラ切替、PNG保存、FPS readout

**検証**
- [ ] フェイクカメラ+スクショ反復(§10)。縮小と等倍の両方で確認(§1.5)
- [ ] モバイル実機(縦画面・DPR・熱)で確認
- [ ] カメラ拒否/カメラ無し/非セキュアの3エラー経路を確認
- [ ] README にリンク追加、GitHub Pages で動作確認

---

## 15. 検索キーワード集

より深く調べるための正式名称(日本語資料が少ない領域は英語で):

- 絵画的レンダリング全般: *painterly rendering*, Hertzmann “Painterly Rendering with
  Curved Brush Strokes of Multiple Sizes” (1998), *stroke-based rendering*
- 方向場: *edge tangent flow*, *structure tensor*, *coherence-enhancing filtering*
- 線画: *XDoG*, *flow-based DoG (FDoG)*, *hatching / tonal art maps*
- 平坦化: *Kuwahara filter*, *anisotropic Kuwahara*
- 流体: Jos Stam “Stable Fluids” (1999), *GPU Gems Ch.38 Fast Fluid Dynamics*
- 粒子・群れ: Reynolds *boids*, *curl noise* (Bridson 2007), *transform feedback*
- 水彩: *watercolor rendering edge darkening granulation*(Curtis 1997)
- ハーフトーン: *halftone shader CMYK rotation*, *ordered dithering Bayer matrix*
- 色: *OKLab color space*, *split toning*
- WebGL2: *WebGL2 fundamentals*(webgl2fundamentals.org — 最良の入門)
- セグメンテーション: *MediaPipe selfie segmentation*

---

*このガイドは dsflon/webgl2 の制作過程(特に van-gogh_sakana → fable5_van-gogh の
改良サイクル)から抽出した。新しい様式に挑むときは §1 から順に埋めていけば、
同じ品質水準の作品を自力で再現できるはずである。*
