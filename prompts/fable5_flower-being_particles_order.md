# 発注書 — fable5_flower-being.html を GPU パーティクル花びらに作り直す

## 背景（ユーザーフィードバック）
現行の flower-being は「星・銀河・宇宙」に見え、花のイメージと違う／人型がほぼ分からない／風でなく水面の揺らぎに見える、という指摘。原因は (1) voronoi 花スタンプが放射光＝スターバーストに見える、(2) 花を全画面の密度場で描き人物が輪郭化しない、(3) 流体の速度場で密度を移流させ水面のうねりになっている、の3点。

## 方針の転換（確定）
**フラグメント密度場をやめ、GPU パーティクルで花びらを表現する。** ユーザーもパーティクル化を希望。狙い:
- 花びら＝離散スプライト（花びら/小花テクスチャ）に**回転**を付けてひらひら舞わせる → 星でなく花びら。
- パーティクルを**人物シルエットから発生**させ、体の形に密集 → 人型がはっきり。体から離れて漂う＝「花びらに溶ける」。
- 各粒が独自の速度・浮遊・回転。**人物の動き＝突風**で舞い上がる → 空気中の花びらの動き（水面でない）。
- 背景は黒（チームラボ）。加算＋ブルームで発光。極彩色パレット（マゼンタ/薔薇/紫/シアン/黄金/桃/白）。

参照画像（Read して質感確認）:
- /root/.claude/uploads/6b9e0c08-54a0-59f9-a2f3-92d430625926/9af00682-1784162190366.jpg
- /root/.claude/uploads/6b9e0c08-54a0-59f9-a2f3-92d430625926/ef1bdd6e-1784162280034.jpg

## 実装（現行 fable5_flower-being.html を改造）
### 残す（無改変で流用。壊さない）
- 検知系: ImageSegmenter のみ・288px 縮小推論・33〜250ms 適応間引き・GPU破綻時CPU自動切替・presence=カバレッジ・チップに推論ms/デリゲート・seg マスクの Y反転/cover-fit/mirror（実カメラ座標一致）。**触らない**。
- マスク/運動場パス（P1: seg or fake SDF → マスク EMA ＋ フレーム差分の flow）。これは残し、flow（運動場）を「突風」に使う。運動場は low-res テクスチャとして参照可能に。
- 検証フック: `?fakesource=1`（合成の動く人物＋シーンで全駆動）、`?freeze=1`（dt=0 で**全パーティクル静止・決定的**）、`window.__artReady`、FAKEでも startCamera()、カメラ3エラー経路（英語文言）、`<video playsinline muted autoplay>`、canvas id="gl"、preserveDrawingBuffer:true、固定✕UI/モバイル既定折りたたみ/日本語スライダー/#debugView/#readout/`?fakeseg=1` 診断。
- 単一自己完結、GLSL ES 3.00、RGBA16F(EXT_color_buffer_float)＋フォールバック。

### 撤去してよい
- Stable Fluids の速度場移流・Jacobi 圧力・vorticity・密度場（denFS など）と、それに基づく密度合成。花びらはパーティクルで描くので流体移流は不要。※ただし「人物マスク」と「運動場(flow)」は残す（発生源と突風に使う）。

### 新規: GPU パーティクル系
- **パーティクル状態を FBO テクスチャで管理**（ping-pong）: 位置(xy)・速度(xy)・寿命/年齢・回転・色/種別 などを RGBA16F テクスチャ（数枚 or パック）で保持。粒数 N はテクスチャ解像度で決める。
- **数の端末適応**: 例 デスクトップ 30k〜60k、モバイル/低速は 8k〜16k に自動（devicePixelRatio・画面サイズ・可能なら初期フレーム時間や検知デリゲートで判定）。gl.POINTS（点スプライト）で軽く。gl_PointSize は端末上限に注意しクランプ。
- **シミュレーション（更新シェーダ）**:
  - ドリフト＋**curl noise の風**（解析的、時間で流れる。緩やかに）。
  - **突風＝運動場**: マスク運動場(flow)を風に加算。人が動くと近傍の花びらが舞い上がり渦巻く（動き大きいほど強い）。**水面移流でなく各粒の加速度**として効かせる。
  - 重力/浮遊のわずかな上下、空気抵抗（速度減衰）、**回転（tumble）**を各粒に。
  - 寿命で fade in/out。死んだら**リスポーン**。
- **リスポーン＝発生源**:
  - 一定割合（例 55〜70%）を**人物マスク領域内**に発生（マスクテクスチャをサンプルして採択/棄却、または CPU で mask から発生点を供給）。これで体の形に花びらが密集＝人型が出る。
  - 残りは画面全体に環境花として散布。
  - マスクが動けば発生分布も追従。無人時は環境花のみ。
- **描画（点スプライト）**:
  - 花びら/小花の**スプライト形状**を gl_PointCoord ＋ 粒の回転で描く（花びら＝涙型/楕円、または小さな多弁花。手続き的でよい）。星型の放射光にしない。
  - 色は flowerPalette から粒ごとに（隣接で色が変わる極彩色）。
  - **加算合成**でグロー。寿命で alpha。近傍で重なると密度が上がり「花の塊」に。
  - 大小2〜3サイズを混ぜる（大輪の花＋小さな舞い散り）。
- **ポスト**: 2段ブルームで発光ハロ、フィルミックトーンマップで白飛び回避、黒地維持、控えめグレイン。
- **debug**: 0=最終 / 1=マスク / 2=発生分布 or パーティクル密度 / 3=運動場(風) / 4=パレット標本。

### freeze 決定性（重要）
- 初期化・リスポーンの乱数は **index ベースのハッシュ**で決定的に（Math.random / Date.now を毎フレーム使わない）。`?freeze=1` は dt=0 で**全粒が完全静止**し2フレーム一致すること（verify の flicker）。fakesource の合成シーンや粒初期配置も決定的に。
- `?fakesource=1` 非freeze では画面が変化（motionResponse）。中央が黒/白でない（alive）。

## 検証（自分で実行してから報告）
- ローカル: localhost:8899（無ければ `python3 -m http.server 8899`）。
- `node loop/runner/verify_static.mjs fable5_flower-being.html` → errors 0。
- `node loop/runner/verify_runtime.mjs "http://localhost:8899/fable5_flower-being.html?fakesource=1&freeze=1" --motion` → 10/10 pass。特に flicker（freeze で全粒静止・決定的）と alive を必ず通す。
- スクショ（?fakesource=1 非freeze, 8〜15秒warm）で: (a) 花びらが**粒（スプライト）**として舞い、星/銀河でなく花びらに見える、(b) **人型が花びらの密集で分かる**、(c) 生映像の切り抜きに見えない・背景黒、(d) 白飛びしない、(e) 動き（合成人物のドリフト）で舞い上がる、を目視確認。playwright-core（/opt/pw-browsers/chromium, --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader）＋ fakeCameraInit を addInitScript。`?fakeseg=1` も維持。
- **注意**: swiftshader は WebGL2 float FBO/gl.POINTS 対応。点スプライトが描かれるか（中央輝度>0）を必ず確認。もし swiftshader で gl_PointSize が効かない等あれば、instanced quad へフォールバックも検討（モバイル実機の互換優先）。

## 完了報告
パーティクル系の設計（状態管理・数・発生源・風・描画）、モバイル数適応、freeze 決定性の担保方法、static/runtime 結果、スクショ所見（星でなく花びら/人型が出る/切り抜きなし/白飛びなし）、未確認点(MediaPipe実機・実機GPUの点スプライト)、迷った点。最終テキストがオーケストレータへの報告。
