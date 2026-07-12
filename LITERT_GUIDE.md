# LiteRT.js 指南書 — 「意味信号」の供給源としてのブラウザ内 ML 推論

カメラ映像を「絵」に変換するリアルタイム作品において、
**GLSL では計算できない意味信号(深度・人物・骨格・言葉)を作品に供給する手段**として
LiteRT.js(および ML 推論全般)を正しく使うための指南書。

- 品質の下位層(プロンプト・ハーネス): [AI_DIRECTION_GUIDE.md](./AI_DIRECTION_GUIDE.md)(以下「制作規約」)
- 制作ループでの使われ方: [loop/DESIGN.md](./loop/DESIGN.md) / S0 brief の `ml` フィールド
- ML 使用の実物(前例): `fable5_papercraft-cam.html`(transformers.js + Depth Anything V2)

## この文書の設計思想

このリポジトリの様式は、輝度・勾配・構造テンソル・セル座標ハッシュといった
**GLSL で毎フレーム計算できる一次特徴**の上に築かれている。ML はそれを置き換えるものではない。

> **ML は「様式の核」ではなく「信号の供給源」である。**
> 筆致・にじみ・紙・粒子といった様式の実装は常に WebGL2 側に残る。
> ML が足すのは、一次特徴からは原理的に導けない**意味**
> (この画素は奥にある/これは人物である/これは左腕である/いまこう発話した)だけである。

この一線を越えて「ML の出力そのものを見せる」作品は、
デモにはなるが様式にはならない(§6 失敗モード M1)。
逆にこの一線を守る限り、ML は既存の様式群に**新しい担当軸**を1本足す道具になる。

## 使い方(最短ルート)

- テーマに ML が要るか迷っている → §2 の判定フロー(3問)
- どの信号・モデルにするか → §2.2 信号カタログ
- LiteRT.js と transformers.js のどちらにするか → §3 比較表
- 実装を発注する → §4 の実装パターン+§7 の語彙を発注書 §4 に貼る
- 検証はどうなるか → §5(?fakesource=1 が全ての鍵)
- 出てきた成果物が変 → §6 の失敗モード表

---

## 目次

1. [LiteRT.js とは何か・何ができるか](#1-litertjs-とは何か何ができるか)
2. [いつ使うか — 判定フローと信号カタログ](#2-いつ使うか--判定フローと信号カタログ)
3. [ランタイム選定 — LiteRT.js か transformers.js か](#3-ランタイム選定--litertjs-か-transformersjs-か)
4. [使い方 — リポジトリ規約に準拠した実装パターン](#4-使い方--リポジトリ規約に準拠した実装パターン)
5. [検証との関係 — V1/V2/V3 と ?fakesource=1](#5-検証との関係--v1v2v3-と-fakesource1)
6. [ML 固有の失敗モードと予防指示](#6-ml-固有の失敗モードと予防指示)
7. [発注書に入れる語彙(制作規約 §5 の続き)](#7-発注書に入れる語彙制作規約-5-の続き)
8. [依存の許可リストとモデルの置き場](#8-依存の許可リストとモデルの置き場)
9. [出典](#9-出典)

---

## 1. LiteRT.js とは何か・何ができるか

LiteRT.js は Google の **ブラウザ内 ML 推論ランタイム**(2026-07 公開)。
LiteRT(旧 TensorFlow Lite)の Web 版で、`.tflite` モデルをブラウザで直接実行する。
TensorFlow.js のモデル実行部分の後継と位置づけられている。

### 1.1 実行バックエンド(加速器)

| accelerator | 実体 | 速度の目安 | このリポジトリでの位置づけ |
|---|---|---|---|
| `webgpu` | ML Drift(GPU) | CPU 比 **5〜60x** | **毎フレーム級のリアルタイム推論はこれ一択** |
| `wasm` | XNNPack(CPU/SIMD/マルチスレッド) | 既存 Web ランタイム比 最大 3x | フォールバック先。オペレータ網羅性が最も広い |
| `webnn` | WebNN API(NPU) | 実験的(Chrome/Edge flag) | 当面使わない(対応環境が狭すぎる) |

重要な性質: 指定した加速器にモデルを完全委譲できない場合、
**LiteRT.js は自動で wasm 実行にフォールバックする**。
「webgpu を指定したのに遅い」ときはまずこれを疑う(§4.7 の model-tester で確認できる)。

### 1.2 モデル形式と変換

- 実行できるのは **`.tflite`**(LiteRT 形式)のみ。ONNX は実行できない(それは transformers.js の領分)。
- PyTorch → `.tflite` は LiteRT Torch(ai-edge-torch)で**1ステップ変換**。JAX / TensorFlow からも変換可。
- 量子化は AI Edge Quantizer でレイヤー単位に調整可能。

### 1.3 パッケージ構成

| パッケージ | 役割 |
|---|---|
| `@litertjs/core` | 本体。`loadLiteRt` / `loadAndCompile` / `Tensor` |
| `@litertjs/tfjs-interop` | TensorFlow.js パイプラインとのテンソル相互変換(本リポジトリでは原則不要) |
| `@litertjs/model-tester` | モデルが webgpu で完全実行できるか・実機レイテンシの計測 |

### 1.4 公式デモが示す能力(= 借りられる既製モデルの水準)

- **Depth Anything V2** — 単眼深度推定をリアルタイム実行し 3D 点群化
- **Real-ESRGAN** — 128px パッチの 4x 超解像をブラウザ内で実行
- **YOLO** — リアルタイム物体検出
- **EmbeddingGemma** — 完全クライアントサイドの意味検索(埋め込み)
- 予告: **LiteRT-LM.js**(LLM のブラウザ実行)

### 1.5 本質的な利点(なぜサーバー推論でなくこれか)

完全オンデバイス — カメラ映像が端末から一切出ない・推論コストゼロ・オフライン動作。
GitHub Pages 配信の単一 HTML 作品という本リポジトリの形式と正確に噛み合う。

---

## 2. いつ使うか — 判定フローと信号カタログ

### 2.1 判定フロー(S0 brief で必ず通す3問)

制作ループでは S0(様式解析)でこのフローを実行し、結果を `brief.json` の `ml`
フィールドに記録する(loop/schemas/invariants.schema.json)。**「使わない」も明示的な判断**である。

```
Q1. その不変量は一次特徴(輝度・勾配・ETF・セル座標・フレーム差分)で実装できるか?
      できる → ML を使わない(needed: false)。これがデフォルト。
      ↓ できない
Q2. 足りないのは「意味信号」か? 具体的に次のどれか1つに言えるか:
      奥行きの順序 / 人物と背景の分離 / 体・顔の構造 / 発話の内容 / 画像の意味
      1つに言えない・2つ以上要る → テーマ側を疑う(様式が信号に依存しすぎ。分割か再設計)
      ↓ 1つに言える
Q3. その信号を合成データに差し替えても(?fakesource=1)様式は成立するか?
      しない → 設計不良。「ML が主役・様式が従」になっている(失敗モード M1)
      する → 採用(needed: true)。信号名・モデル・ランタイム・合成信号の仕様を brief に書く
```

判定に使う言葉: **「この信号が無いとき、何が『見えなく』なるか」を1文で言えること。**
言えなければ Q1 に戻る。(papercraft-cam の実例:「深度が無いと*空間の離散化*が消え、
ただの色面ポスタライズになる」— 言える。だから深度を採用した。)

### 2.2 信号カタログ — 信号 × 様式への効き方 × 代表モデル

| 信号 | 様式に足せる担当軸 | 効き方の例(既存作品の系譜) | 代表モデル(.tflite / ONNX) | 推論頻度の要求 |
|---|---|---|---|---|
| **単眼深度**(depth) | 場/知覚 | 空間の離散化(papercraft の紙層)、空気遠近(水墨の三遠)、レイヤー別パララックス、点群レリーフ | Depth Anything V2 small | 毎フレーム〜1/3 フレーム |
| **人物セグメンテーション** | 場/マーク | 人物と背景で様式を分ける(人物だけ煙化・背景だけ静止画)、輪郭発光、シルエット窓 | MediaPipe Selfie Segmentation 系 | 毎フレーム級 |
| **骨格・顔ランドマーク** | マーク/時間 | 解剖学的に正しい一筆書き(oneline の進化)、関節に吸着する粒子、視線・表情駆動 | MoveNet / BlazePose / Face Landmarker 系 | 毎フレーム級 |
| **音声認識**(ASR) | 時間/マーク | 発話がタイポグラフィとして流れ込む(typo-cam × ds_voice の合流) | Whisper 系(小型) | 発話区切りごと(非リアルタイム可) |
| **テキスト/画像埋め込み** | 色/場 | 発話・被写体の意味でパレットや場を切り替える(意味駆動プリセット) | EmbeddingGemma 等 | 数秒に1回で十分 |
| **超解像** | (最終出力のみ) | SAVE PNG 時だけ 4x 化して印刷品質アーカイブ | Real-ESRGAN | 保存時のみ(1回) |

読み方の注意:

- **1作品1信号**を原則とする。2信号は実装・検証・失敗の面積が倍になる
  (依存が2つ、fakesource が2系統、状態チップが2つ…)。2つ欲しくなったら作品を分ける。
- 「推論頻度の要求」が毎フレーム級の信号を選んだ場合、ランタイムは事実上
  LiteRT.js(webgpu)になる(§3)。
- 超解像だけは様式でなく**書き出しの品質**に効く特殊枠。リアルタイム経路に入れてはならない。

---

## 3. ランタイム選定 — LiteRT.js か transformers.js か

本リポジトリには transformers.js の前例がある(papercraft-cam)。
LiteRT.js はそれを**置き換えるのではなく、要求水準で使い分ける**。

| 観点 | transformers.js(前例あり) | LiteRT.js |
|---|---|---|
| モデル形式 | ONNX(HF Hub に大量) | `.tflite`(litert-community 等。数は少ない) |
| GPU 実行 | WebGPU 対応はモデル・オペ依存で不安定 | **WebGPU が第一級**(ML Drift)。CPU 比 5〜60x |
| 前後処理 | `pipeline()` が全部やってくれる(楽) | **自前**(リサイズ・正規化・NCHW/NHWC・出力デコード) |
| API の粒度 | 高水準(タスク名を渡す) | 低水準(Tensor を渡す)。その分レイテンシ管理が効く |
| メモリ管理 | 自動 | **手動**(`tensor.delete()` 必須。§4.4) |
| 向く用途 | 数百 ms〜数秒に1回の非同期推論 | **毎フレーム級のリアルタイム推論** |

### 選定ルール(発注書 §4 に書く結論)

1. **毎フレーム級**(深度・セグメンテーション・骨格を映像に同期させる)→ **LiteRT.js + webgpu**。
   ただし Phase 2 で model-tester により「webgpu 完全委譲」を確認できることを条件とする。
   確認できなければ transformers.js(または解像度・頻度を落とした LiteRT wasm)へ降格。
2. **数秒に1回・非同期でよい**(ASR・埋め込み・保存時超解像)→ **transformers.js を優先**
   (前例があり、前後処理の実装リスクが小さい)。
3. 同じモデルが両形式で入手できる場合も、上の頻度基準で決める。迷ったら前例側(transformers.js)。

> この選定は S0 の `ml.runtime` に記録し、発注書 §4 で理由ごと固定する。
> Maker に選ばせない(失敗モード M6: ランタイム二重搭載)。

---

## 4. 使い方 — リポジトリ規約に準拠した実装パターン

単一自己完結 HTML・エラー3経路・検証フックというリポジトリ規約(制作規約 §4)の中で
LiteRT.js を使うための標準形。**発注書にはこの節の該当パターンを明記して渡す。**

### 4.1 読み込み(CDN・バージョン固定)

npm も build 工程も使えないので、ESM を CDN から直接 import する。
**バージョンは必ずピン留めする**(`@latest` は再現性を壊し、V1 検証と衝突する)。

```html
<script type="module">
  import { loadLiteRt, loadAndCompile, Tensor } from
    "https://cdn.jsdelivr.net/npm/@litertjs/core@2.5.2/dist/index.js";

  // Wasm ランタイム部品も同じ CDN から(パスはディレクトリで渡す)
  await loadLiteRt("https://cdn.jsdelivr.net/npm/@litertjs/core@2.5.2/wasm/");
</script>
```

許可される外部 URL は §8 の許可リストのみ(V1 静的 lint が機械検査する)。

### 4.2 初期化・加速器選択・フォールバック

```js
let model = null;
let mlBackend = "none"; // 状態チップに出す: "webgpu" | "wasm" | "none"

async function initModel() {
  setChip("DEPTH · BOOTING");             // 状態チップ(papercraft-cam の規約)
  try {
    await loadLiteRt(WASM_DIR);
    try {
      model = await loadAndCompile(MODEL_URL, { accelerator: "webgpu" });
      mlBackend = "webgpu";
    } catch (e) {
      // WebGPU 不可(iOS Safari 等)→ wasm へ明示的に降格
      model = await loadAndCompile(MODEL_URL, { accelerator: "wasm" });
      mlBackend = "wasm";
    }
    setChip(`DEPTH · ${mlBackend.toUpperCase()}`);
  } catch (e) {
    // モデル取得/コンパイル失敗 — 作品は死なせない(§4.5)
    mlBackend = "none";
    setChip("DEPTH · OFFLINE");
    showModelError(e); // RETRY DOWNLOAD ボタン付き
  }
}
```

要点:

- **加速器の降格は自作する**(webgpu → wasm)。LiteRT 内部のオペ単位フォールバックとは別に、
  `navigator.gpu` が無い環境で `loadAndCompile` ごと失敗する経路を握ること。
- wasm 降格時は**推論解像度か頻度を落とす**(例: 入力を 256→192、毎フレーム→1/3 フレーム)。
- モデル読み込みは**カメラ初期化と並行**して行い、どちらか片方の失敗が
  もう片方を巻き込まないこと。

### 4.3 推論ループの非同期分離(最重要)

**描画ループ(rAF)と推論ループを完全に分離する。** 推論を rAF 内で await すると
様式パイプライン全体が推論レイテンシに律速され、fps が崩壊する(失敗モード M2)。

```js
let inferBusy = false;

async function inferLoop() {                 // rAF とは独立に回る
  if (model && !inferBusy && videoReady) {
    inferBusy = true;
    try {
      const out = await runInference(videoFrameSmall()); // §4.4
      uploadToTexture(out);                  // 結果を texSubImage2D で GL へ
    } catch (e) { /* 1回の失敗で止めない。連続失敗で OFFLINE へ */ }
    inferBusy = false;
  }
  setTimeout(inferLoop, 0);                  // in-flight は常に最大1件
}
```

- **in-flight 1件の原則**: 前の推論が終わるまで次を発行しない(キューを作らない)。
- 推論結果はフレームより遅れて届く。**シェーダ側の EMA ping-pong で時間平滑化**して
  「遅れて跳ぶ」のを「遅れて滑らかに追いつく」に変える(papercraft-cam の Depth calm と同じ)。
- 推論入力は**縮小オフスクリーンキャンバス**から取る(例: 256〜350px 角)。
  フル解像度を食わせるのは何も改善しないまま全てを遅くする。

### 4.4 入出力とメモリ管理

LiteRT.js は**手動メモリ管理**。作りっぱなしの Tensor は GPU/Wasm ヒープを食い潰す。

```js
async function runInference(imageData /* ImageData (W×H) */) {
  // 1) 前処理: モデルの入力仕様に合わせる(NCHW/NHWC・正規化はモデルごとに違う!)
  const f32 = preprocess(imageData);                    // 例: RGB→Float32, /255, NCHW
  const input = new Tensor(f32, [1, 3, H, W]);          // 形状はモデル定義に従う

  // 2) 実行(webgpu モデルへは GPU 側へ移してから渡すのが基本形)
  const gpuIn = mlBackend === "webgpu" ? await input.moveTo("webgpu") : input;
  const outputs = await model.run(gpuIn);
  gpuIn.delete();                                       // 入力は即座に解放

  // 3) 読み出し: wasm(CPU)へ移して TypedArray 化
  const cpuOut = await outputs[0].moveTo("wasm");
  const raw = cpuOut.toTypedArray();                    // Float32Array 等
  cpuOut.delete();

  // 4) 後処理: 正規化して Uint8/Float の平面バッファへ(GL アップロード用)
  return postprocess(raw);                              // 例: min-max 正規化 → Uint8Array
}
```

- **`delete()` を try/finally で保証**すること。例外経路でのリークが最も見つけにくい。
- 入出力の形状・dtype・正規化は**モデルごとに違い、変換経路でも変わる**。
  Phase 2 のスパイク(§4.7)で実物を確認してから発注書に固定する。
- GL への受け渡しは `texSubImage2D`(R8 / R16F 等の単チャンネル)+
  `UNPACK_FLIP_Y_WEBGL` は使わずシェーダ側で向きを合わせる(制作規約 §9-10)。

### 4.5 UI・エラー経路(規約への追加分)

カメラの3経路(非セキュア/権限拒否/カメラ無し)に、ML 作品は**第4の経路**を足す:

- **MODEL LOAD FAILED**: CDN 不達・コンパイル失敗時。専用メッセージ+
  `RETRY DOWNLOAD` ボタン(papercraft-cam の `#retryModel` を踏襲)。
- ただしカメラ3経路と違い、**モデル失敗は作品を止めない**。
  合成信号(§4.6)または信号なしの縮退様式で動き続け、状態チップで OFFLINE を明示する。
- **状態チップ**(`#depthStatusChip` 相当)で BOOTING → WEBGPU/WASM → OFFLINE を常時表示。
- readout に推論 fps(描画 fps とは別)を出す。

### 4.6 ?fakesource=1(必須フック)

ML 依存作品は `?fakesource=1` で**モデル無しで様式パイプライン全体を駆動**できること
(制作規約 §4 検証フック)。papercraft-cam の `?fakedepth=1` の一般化。

- 合成信号は「その信号らしさ」を持つこと(深度なら滑らかな遠近勾配+段差、
  セグメンテーションなら人型マスク、骨格なら歩行ポーズ列)。
- 時間軸の不変量がある作品は、合成信号に**動く要素を1つ**含める(V1 `--motion` が依存)。
- 実装は「推論結果テクスチャの供給元を差し替える」1点に局在させること。
  fakesource の分岐が様式パイプラインに散らばったら設計不良。

### 4.7 発注前スパイク(Phase 2 の義務)

ML 作品の発注では、様式実装に入る前に**最小スパイク**で以下を実測・確認する:

1. モデル URL が実在し、ライセンスが再配布/利用可であること
2. `@litertjs/model-tester` 相当の確認 — webgpu で完全委譲できるか、実機レイテンシ
3. 入出力の形状・dtype・正規化(§4.4 を発注書に固定するため)
4. 対象最低ライン(モバイル Safari = wasm 降格)での推論 fps

このスパイクの結果を発注書 §4 に転記してから Phase 3(実装)へ進む。
**スパイクなしで発注書に書いたモデル仕様は「もっともらしい捏造」として扱う**(制作規約 ゲート1 と同じ態度)。

---

## 5. 検証との関係 — V1/V2/V3 と ?fakesource=1

制作ループの3層検証(loop/DESIGN.md §4)に ML はこう写像される:

| 層 | ML 作品で何を検証するか | 何を検証しないか |
|---|---|---|
| V1 静的 | 外部 URL が許可リスト内(§8)/ fakesource フックの存在 / 規約 ID(状態チップ・RETRY) | モデルの妥当性 |
| V1 実行時 | **?fakesource=1 で**全チェック(黒画面・フリッカ・スライダー掃引・エラー経路)。決定的 | 実推論の品質(非決定的なので停止条件にしない) |
| V2 美的 | fakesource スクショで様式の成立を採点+実推論スクショがあれば参考添付 | 推論精度 |
| V3 人間 | 実カメラ+実推論での体験品質(遅延感・追従の気持ちよさ)/ モデルライセンス | — |

原則: **機械検証は合成信号で、意味の検証は人間で。**
実推論は環境依存(GPU・ドライバ・熱)で非決定的なので、ループの停止条件に入れない。
その代わり §4.7 のスパイク結果と V3 の実機確認で品質を担保する。

---

## 6. ML 固有の失敗モードと予防指示

制作規約 §1 と同じ使い方(そのまま発注文に貼れる予防指示)。

| # | 失敗モード | 症状 | 予防指示文(コピペ可) |
|---|---|---|---|
| M1 | **ML 出力の直接展示** | 深度マップやマスクを色付けしただけの「デモ」になる | 「ML 出力は中間信号であり最終画面に直接出さないこと。信号は様式パイプライン(マーク配置・場の変調・レイヤー分割)の**入力**としてのみ使うこと。uDebug でのみ生値を確認可とする」 |
| M2 | 推論による fps 崩壊 | 推論を rAF 内で await し全体が 10fps 化 | 「推論は描画ループと分離した独立非同期ループで行い、in-flight は最大1件。描画は常に最新の**完成済み**推論テクスチャを参照すること(§4.3)」 |
| M3 | 推論結果のフリッカ | 深度・マスクが毎推論で跳ね、様式ごと震える | 「推論結果テクスチャはシェーダ側 EMA ping-pong で時間平滑化し、時定数をスライダー化すること(papercraft-cam の Depth calm 相当)」 |
| M4 | メモリリーク | 数分でタブがクラッシュ(Tensor の delete 漏れ) | 「全 Tensor は try/finally で `delete()` を保証すること。10分連続実行でメモリが平衡することを確認してから完成報告すること」 |
| M5 | モデル失敗で全損 | CDN 不達・WebGPU 無しで真っ黒/無反応 | 「モデル読込失敗・WebGPU 非対応の各経路で、(a) 専用メッセージ+RETRY、(b) 合成信号または縮退様式での継続、(c) 状態チップでの明示、の3点を実装すること(§4.2/§4.5)」 |
| M6 | ランタイム二重搭載 | transformers.js と LiteRT.js を両方 import して初期化が数十秒 | 「ランタイムは発注書 §4 で指定した1つのみ。別ランタイムへの変更が必要と考えた場合は実装せず報告に書くこと」 |
| M7 | 入力仕様の思い込み | NCHW/NHWC・正規化・上下反転の取り違えで出力が無意味 | 「入出力仕様は発注書に固定された値(スパイク実測)に従うこと。動かない場合、uDebug に前処理後の入力と生出力を表示するモードを実装して照合すること」 |
| M8 | フル解像度推論 | 効果ゼロのまま全デバイスで重い | 「推論入力は縮小オフスクリーン(256〜350px 角)から取ること。推論解像度と表示解像度は独立に設計すること」 |

> 運用: ML 作品で新しい事故が起きたら、この表に行を足す(制作規約と同じメタループ)。

---

## 7. 発注書に入れる語彙(制作規約 §5 の続き)

制作規約 §5 と同じ思想 — **正式名称を出せば正しい実装が出てくる。**

| 作りたい表現 | 指示に入れるキーワード | 一言で仕様を固定する指示例 |
|---|---|---|
| 深度で空間を離散化 | **monocular depth estimation**, Depth Anything V2, quantile thresholding, depth EMA ping-pong | 「単眼深度を quantile しきい値で N 層に量子化。深度は EMA ping-pong で平滑化し、時定数をスライダー化」 |
| 深度で空気遠近 | depth-conditioned dilution, atmospheric perspective, 三遠(平遠・深遠・高遠) | 「深度が遠いほど墨を淡く・にじみ半径を大きく(深度条件付き希釈)」 |
| 深度でレリーフ・点群 | depth-displaced point cloud, parallax by depth zone | 「深度でレイヤー別 UV シフト(微小パララックス)」 |
| 人物と背景で様式を分ける | **selfie segmentation**, mask feathering, per-region style routing | 「人物マスクは境界を feathering し、マスク内外で別パスの様式へルーティング」 |
| 体の構造に沿うマーク | **pose landmarks**, skeleton-guided path, landmark attraction field | 「骨格ランドマークを制御点とする吸着場でマークの向きを曲げる」 |
| 発話を画面に入れる | **streaming ASR**, per-utterance layout, glyph advection | 「発話区切りごとにタイポグラフィを生成し、流体場で運ぶ(glyph advection)」 |
| 推論の実装一般 | **LiteRT.js**, `loadAndCompile`, accelerator webgpu/wasm fallback, in-flight 1, tensor `delete()`, inference-render decoupling | 「LiteRT.js(webgpu、wasm 降格付き)。推論は描画と分離、in-flight 1件、全 Tensor を delete」 |

---

## 8. 依存の許可リストとモデルの置き場

単一自己完結 HTML 規約の例外として許可される外部 URL
(V1 `loop/runner/verify_static.mjs` の `EXTERNAL_ALLOWLIST` と同期):

| URL パターン | 用途 |
|---|---|
| `https://cdn.jsdelivr.net/npm/@huggingface/transformers...` | transformers.js 本体 |
| `https://cdn.jsdelivr.net/npm/@litertjs/...` | LiteRT.js 本体(core / wasm)。**バージョンをピン留めすること** |
| `https://huggingface.co/...` | モデル本体(ONNX / .tflite)。`.tflite` は litert-community 等の org にある |

ルール:

- 許可リスト外の URL は V1 静的 lint が error にする。リストへの追加は
  メタループ(人間承認)の領分 — 本書 §8・verify_static・制作規約 §4 の3点を同期変更する。
- モデルは**リビジョン固定 URL**(コミットハッシュ付き)で参照するのが望ましい。
- モデルのライセンス(再配布・商用・クレジット表記)を発注前スパイク(§4.7)で確認し、
  作品ヘッダコメントの「依存」欄にモデル名・ライセンスを書くこと。

---

## 9. 出典

- [LiteRT.js, Google's high performance Web AI Inference — Google Developers Blog(2026-07-09)](https://developers.googleblog.com/litertjs-googles-high-performance-web-ai-inference/)
- [LiteRT for Web with LiteRT.js — 公式ドキュメント](https://ai.google.dev/edge/litert/web)
- [@litertjs/core — npm(README のコード例は v2.5.2 時点)](https://www.npmjs.com/package/@litertjs/core)
- 本リポジトリの ML 前例: `fable5_papercraft-cam.html` / `prompts/fable5_papercraft-cam_order.md`

> **鮮度の注意**: §1・§4 の API は 2026-07 時点の情報。LiteRT.js は活発に開発されており
> (LiteRT-LM.js 予告など)、発注前スパイク(§4.7)で必ず現行バージョンの実挙動を確認すること。
