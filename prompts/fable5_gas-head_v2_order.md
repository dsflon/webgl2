# 発注書 — fable5_gas-head.html を一から作り直す (v2: 全身ガス化 / 実背景)

## ゴール(ユーザー確定要件)
Web カメラに映る人物の **全身が、SMOKE DENSITY 風のグレー粒状ガスに置換されて buoyancy で立ち上る**。
**背景(周囲)は実カメラ映像をほぼそのまま描画**する(黒背景にしない)。人型のグレーの煙の塊が、実写の背景の上を漂い・立ち上る絵。

現行の `fable5_gas-head.html` は「黒背景に頭だけ煙」で、周りが黒くて変 → これを捨てて作り直す。

## 参照(このリポジトリの既存動作ファイル)
- **検知ロジック = `overflowing_aura_4taigyo_v2.html` と同一**にする。
  - `<script type="module">` は使わず(オフライン検証の都合)、MediaPipe は **実カメラ起動時のみ dynamic `import()`** で読む。ただしURL・モデル・オプション・座標変換は overflowing_aura と完全一致させる:
    - import 元: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18`
    - wasm: `.../tasks-vision@0.10.18/wasm`
    - ImageSegmenter: selfie_segmenter float16 `.../image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`、`runningMode:"VIDEO"`, `outputConfidenceMasks:true`, GPU→CPU フォールバック(try/catch)。人物マスク = `confidenceMasks[0].getAsFloat32Array()`。
    - PoseLandmarker: `.../pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`(**必ずこのファイル名。`pose_landmarker.task` は404**)、`runningMode:"VIDEO"`, `numPoses:1`, delegate 指定なし。
  - **注意**: verify_static の許可リストに MediaPipe CDN と storage.googleapis.com/mediapipe-models を追加済み。だからURLは**素直な文字列リテラルで書いてよい**(前回の "https"+"://" のような分割ハックは不要・禁止)。
  - 検知の主役は **セグメンテーションの人物マスク**(全身シルエット)。これがガスの発生源。pose は無くても可(使うなら微妙な上昇補助程度)。

- **ガスの質感 = `fable5_blue-dissolve.html` の DEBUG「SMOKE DENSITY」風**。
  - ほぼ生のグレースケール密度(`vec3(den)` 基調)、白飛びさせない、粒状(fbm mottle)+静的フィルムグレイン。排気ガス/たばこ煙のような凝集した粒感。ネオンの発光チューブにしない。

## パイプライン(全て SCREEN UV で統一。fakesource と実カメラで同一シェーダ経路)
1. **P0 scene**: カメラ映像を cover-fit + mirror(front cam)でフルスクリーン描画。これが背景。ほぼ生(必要ならごく軽い露出/コントラスト調整のみ。**暗い黒背景にしない**)。
2. **P1 mask/motion**: 人物マスク(seg tex or fake)を EMA 平滑化して screen UV に。フレーム差分で運動場も持つ(身体の動きが煙をなびかせる)。cover-fit と mirror をマスクにも正しく適用(Y反転含む)。
3. **半解像度 Stable Fluids**(≤512): semi-Lagrangian 移流 + Jacobi 圧力 + vorticity confinement。
   - **密度注入 = 人物マスク領域全体**(全身)。マスク内を濃く満たし、buoyancy で上へ立ち上らせる。マスクが動けば煙源も追従。
   - curl noise(粗+細)で乱流化、身体の動きを外力に。
   - 上方ほど散逸ゆるめ(煙が上へ billow して残る)、ただし**無限に溜めて飽和させない**(density は [0,1] clamp、注入率と散逸で有界な定常に)。
4. **P density grain**: 密度に fbm を乗算して粒状ムラ、縁をディザで破断(SMOKE DENSITY の粒感)。
5. **P emission/bloom**: グレースケール密度からごく控えめな bloom(白飛び厳禁。blue-dissolve のガスモード同様、bloom は強く抑える)。
6. **P composite**:
   - **背景 = 実カメラ映像(P0)をそのまま**。
   - その上に **グレー粒状ガスを密度でアルファブレンド**。`smokeCol = vec3(density)` 系(ごく淡く寒色に振ってもよいが基本グレー)。密度が高いほど不透明 → 身体は完全にガスで覆われて見えなくなる(全身ガス化)。密度ゼロの所は背景がそのまま(周りは実写)。
   - 全面に静的 cell-hash フィルムグレイン。
   - **重要**: 大きく写った人物(マスクが画面の大半)でも**白飛び・全面真っ白にならない**こと。ガスはグレーで、濃くても純白に張り付かない(上限を抑える)。前回この whiteout でユーザーが困った。
   - uDebug セレクタ: 0=最終 / 1=人物マスク / 2=煙密度(グレー) / 3=速度場 / 4=配色標本 等。

## リポジトリ規約・検証フック(必須。これが無いと機械検証が通らない)
- 単一自己完結 HTML。WebGL2 / GLSL ES 3.00。canvas は `id="gl"`、`preserveDrawingBuffer:true`。RGBA16F(EXT_color_buffer_float)+ RGBA8 符号化フォールバック。
- `<video id="video" playsinline muted autoplay>`(iOS必須、verify_static が要求)。
- `?fakesource=1`: カメラ/MediaPipe を一切使わず、**合成の動く人物マスク+背景シーン**で全パイプラインを駆動(オフライン検証用)。合成背景は真っ黒でなく、判別できる模様/グラデ(実写背景の代役)。合成の人物マスクは中央付近で人型に近い塊がゆっくり動く。
- `?freeze=1`: 全時間駆動 dt=0 で決定的静止(2フレーム完全一致)。fluid/buoyancy/curl/grain/fake動き/EMA を全停止。
- `window.__artReady = true` を入力が来た最初のフレームで立てる。
- **FAKEモードでも `startCamera()` を呼ぶ**(overlay を hidden にしてから)。fakesource が合成でパイプライン駆動する一方、カメラ3エラー経路を観測可能に保つ(verify の cameraDenied 検証が依存)。合成が描画を駆動するので overlay 成功時は隠れる。
- カメラ3エラー経路(overlay の英語文言そのまま): "SECURE CONTEXT REQUIRED" / "PERMISSION DENIED"(retry ボタン表示) / "NO CAMERA FOUND"。`#overlay`/`#overlayTitle`/`#retryCamera` の id を使う。
- UI: smoke-portrait 準拠の**固定✕**(`#closePanel` を絶対配置、`.panel` はスクロールしない shell、`.panel-body` がスクロール)、`#togglePanel`(☰)ランチャー、**モバイル既定折りたたみ**。スライダーは**日本語ラベル**(例: 煙の量/立ち上り/渦/粒状/残像/フィルム粒子/背景の明るさ 等、6本以上)。DEBUG セレクタ(`#debugView`)。FPS/解像度の `#readout`。
- MediaPipe ライブ経路は実機用に正しく書くが「未検証(要実機)」扱い。

## 検証(自分で実行してから報告)
- ローカルサーバ: `python3 -m http.server 8899`(起動済みのはず。無ければ起動)。
- `node loop/runner/verify_static.mjs fable5_gas-head.html` → **errors 0**。
- `node loop/runner/verify_runtime.mjs "http://localhost:8899/fable5_gas-head.html?fakesource=1&freeze=1" --motion` → **10/10 pass**。
  - 特に ready / alive(中心非黒非白) / flicker(freeze決定的) / sliders(6本以上) / debugViews / resize / uiToggle / pageerror0 / cameraDenied("PERMISSION DENIED") / motionResponse。
- fakesource のスクショを撮って、(a) 背景が実写代役として見えている、(b) 人型のグレー粒状ガスが立ち上っている、(c) 白飛びしていない、を自分で目視確認。

## 完了報告に含めること
変更方針、自己確認(背景描画・全身ガス化・白飛び無し)、検証結果(static/runtime)、未確認点(MediaPipe実機)、迷った点。
