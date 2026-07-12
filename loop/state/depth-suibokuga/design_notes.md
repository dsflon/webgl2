# design_notes — depth-suibokuga「Sumi Sansui — 深度三遠の水墨」

発注書: `prompts/fable5_depth-suibokuga_order.md` / 参照実装: `fable5_papercraft-cam.html` /
ML 指南: `LITERT_GUIDE.md` §4/§6。本ノートは Phase 1〜2 の成果物(実装前)。

---

## Phase 1 — 不変量表の復唱と実装上の懸念

発注書 §2 の不変量表を独自解析で置き換えず、そのまま復唱する(優先度 **1 > 2 > 4 > 3 > 5**)。

| # | 不変量(復唱) | 担当軸 | 実装原理 | 外すと |
|---|---|---|---|---|
| 1 | 深度に応じて墨の濃度と輪郭の明瞭さが減衰し、遠景ほど淡く輪郭が大気に溶ける(三遠の空気遠近) | 場/知覚 | depth-conditioned dilution(深度で墨の不透明度・エッジ強度を遠方ほど減衰) | 平面的な墨絵になる(遠い暗部と近い暗部が区別できない) |
| 2 | 白→黒の階調境界で顔料が縁に溜まって暗くなり、内側が抜ける水墨のにじみ | マーク/物質 | threshold diffusion の反復拡散 + edge darkening(勾配で境界を暗く) | のっぺりした連続濃淡。渇筆・破墨に見えない |
| 4 | 墨は無彩色〜わずかな冷暖のみ、白紙・清・淡・重・濃・焦の段階的階調 | 色 | 輝度ゾーン別 split toning で墨の五彩へ写像、低彩度画素ほど強く寄せる | 均一グレーで五彩が死ぬ |
| 3 | 紙の繊維に沿った粒状ムラがにじみ中に不均一な物質感 | 物質 | cell-hash 由来の静的グレインを紙の谷に溜める paper granulation(時間シード禁止) | 均一で乾いたデジタル面。プラスチック |
| 5 | 被写体が前後に動くと所属する「遠」が変わり、墨の濃度と滲みが遅れて滑らかに追従 | 時間/知覚 | depth EMA ping-pong で深度平滑化、層帰属を安定遷移 | 墨が毎フレーム震える／一枚絵と区別つかない |

### 実装上の懸念点(列挙のみ)

1. **不変量1が本作の生命線**。輝度反転(暗い=墨)だけだと「深い暗部の近景」と「淡い遠景」が同じ濃さになり、
   §1 の失敗モード「グレースケール+ぼかし」に堕ちる。深度 D を必ず希釈係数とエッジ鋭度の両方に効かせる必要がある。
2. 深度の**符号の約束**が事故要因。Depth-Anything 系は inverse-depth(近い=大)を出すことが多い。合成深度も
   「近い=大」で統一し、シェーダは一貫して `farness = 1 - D` を使う。実モデルの符号は人間スパイクで確認要(下記)。
3. **にじみ(不変量2)を後処理ぼかしで代用しない**。単なるガウスぼかしは「内側が抜ける」を作れない。
   反復拡散した場の**勾配**で境界を darken し、内部を lift する edge darkening を明示的に置く。
4. にじみ半径を深度で変えたいが、分離ブラーは per-pixel に sigma を変えられない。→ **sharp と diffused の2枚を用意し、
   farness で mix** する近似で depth-conditioned dilution を実現(遠=diffused 寄り=大気に溶ける)。
5. 五彩(不変量4)は 6 段階の階調(白紙・清・淡・重・濃・焦)。連続濃淡だと五彩が見えないので soft-quantize が要る。
   ただし量子化しすぎると被写体シルエット(受入基準)が潰れる。toneSplit で連続↔5段を可変にする。
6. フリッカ(品質基準・不変量3/5)。グレイン・にじみのシードは **gl_FragCoord のみ**。EMA は ping-pong 必須。
   `?freeze=1` では合成深度の運動と depthMix イージングを停止し決定的静止を出す。
7. ML は「信号の供給源」であって様式の核ではない(LITERT §M1)。深度マップを最終画面に出さない(uDebug のみ生値)。

---

## Phase 2 — 設計

### 候補アーキテクチャ(2〜3案の比較・却下理由付き)

**案A(採用): 深度→墨密度場→反復拡散→深度条件付き合成 の単方向パイプライン**
- P0 scene(cover-fit)→ P1 depth 供給 → P2 depth EMA ping-pong → P3 墨密度場(輝度+勾配+深度希釈)→
  P4/P5 threshold diffusion 反復拡散(ping-pong)→ P6 最終合成(edge darkening + split toning + granulation)。
- 長所: 各不変量が1パスに対応し検証・自己批評が行いやすい。ping-pong は EMA と拡散の2箇所で FBO を共有できる。
- 短所: パス数が多め(フィルレートは下記概算で許容内)。

**案B(却下): 深度で N 層に量子化してレイヤー別に墨を塗る(papercraft の紙層の水墨版)**
- 却下理由: 「離散した紙層」は papercraft の様式であって水墨ではない。三遠は**連続的な空気遠近**で、
  層境界の段差が出ると不変量1の「大気に溶ける」が壊れる。量子化は色(五彩)側だけに留めるべき。

**案C(却下): 単一 uber-shader で全部を1パス**
- 却下理由: 反復拡散(不変量2)は近傍を複数回参照する feedback で、1パスでは表現できない(§技術注意2 の
  read/write 同時禁止に抵触)。EMA も ping-pong が要る。分割は必須。

### パス構成図(入出力・解像度・フォーマット・更新頻度)

```
video ─►[P0 scene]  cover-fit + mirror(UV反転)            RGBA8  paintW×paintH(長辺≤1408)   毎フレーム
                                                                                             │
 (実推論 or 合成)                                                                             │
  ├ 実: LiteRT.js 独立ループ→ 256px角入力→ depth→ min-max正規化 u8 → depthRawTex(R8)  推論FPS(別ループ, in-flight1)
  └ 合成: ?fakesource=1 / モデル失敗時 → シェーダ内 synthDepth()（供給元差し替え1点）
                                                                                             │
[P2 ema]   depthRaw or synth + emaPrev → depthEMA          R16F   procW×procH(長辺~320)     毎フレーム(ping-pong emaA/emaB)
[P3 ink]   flat(scene) + depthEMA → 墨密度場 inkRaw         R16F   inkW×inkH(長辺~760)       毎フレーム
[P4/P5]    inkRaw を分離ガウスで反復拡散(H,V)×2回 → inkSoft R16F   inkW×inkH                  毎フレーム(ping-pong inkA/inkB + tmp)
[P6 final] flat + depthEMA + inkRaw + inkSoft → 画面        RGBA8(既定FB)  canvas               毎フレーム
           depth-conditioned dilution(sharp↔diffused mix)+ edge darkening + split toning
           (墨の五彩)+ paper granulation(cell-hash)+ vignette
uDebug: 0 RAW DEPTH / 1 SMOOTH DEPTH / 2 INK / 3 FINAL(既定)
```

FBO 一覧: scene(RGBA8) / emaA,emaB(R16F, ping-pong) / inkRaw(R16F) / inkA,inkB(R16F, 拡散 ping-pong) /
blurTmp(R16F)。EXT_color_buffer_float 未対応時は R16F→RGBA8 に自動降格(papercraft 同方式)。

### フィルレート概算(desktop 1100×750, DPR 上限2 → 実 canvas ~ 2200×1500 だが paint 長辺 1408 に制限)

- paint ~ 1408×960 ≈ 1.35 Mpx。P0/P6 = 各 1回 canvas 相当 ≈ 2200×1500=3.3Mpx(P6のみ最終FB)。
- proc(EMA) 320×218 ≈ 0.07Mpx ×1。ink 760×518 ≈ 0.39Mpx ×(P3 1 + 拡散 4)= 約2.0Mpx。
- 合計おおよそ 3.3(P6) + 1.35(P0) + 2.0(ink群) + 0.07 ≈ **6.7 Mpx/frame**。60fps で ~0.4 Gpx/s。
  swiftshader(CI)でも __artReady と静止検証は通る水準。モバイルは DPR2+paint制限+proc/ink 縮小で 30fps 目標。

### リスク

- R16F 非対応環境 → RGBA8 降格で EMA が 8bit 化しフリッカ懸念 → papercraft 同様 alpha 下限でザラつき低減。
- ink 拡散を強くすると被写体シルエット(受入基準)が溶けすぎる → bleedRadius と farness で上限を設ける。
- 実モデルの入出力仕様が想定と違うと出力が無意味(§M7)→ uDebug の RAW/SMOOTH で生値を目視照合できるようにする。

### ML スパイクの扱い(LITERT §4.7)— **実推論経路は未検証(要人間スパイク)**

このサンドボックスは HF / CDN へ到達できないため、§4.7 の発注前スパイク(実 `.tflite` URL の実在確認・
`model-tester` による webgpu 完全委譲確認・入出力 shape/dtype/正規化の実測・モバイル wasm 降格 fps)は**実行できていない**。
したがって実推論コードは以下の前提で**防御的に**実装し、確定仕様としては扱わない:

- 候補モデル URL: `https://huggingface.co/litert-community/Depth-Anything-V2-Small/resolve/main/...`(**実在・ライセンス未確認**)。
- 想定入出力: 入力 NCHW `[1,3,256,256]` float32、`/255` 後 ImageNet 標準化(mean .485/.456/.406, std .229/.224/.225)。
  出力は単チャンネル inverse-depth を min-max 正規化して u8 化(**shape/正規化は要実測**)。
- ランタイム: `@litertjs/core@2.5.2`(webgpu、失敗時 wasm 明示降格)。**ランタイム変更禁止**(§M6)。
- 失敗しても作品を止めない: モデル取得/コンパイル失敗・WebGPU 非対応時は状態チップ OFFLINE +
  MODEL LOAD FAILED + RETRY を出し、**合成深度へフォールバック**して様式を継続(§M5)。
- **機械検証(V1)は全て `?fakesource=1` の合成深度で通す**ことを受入条件とする(実モデルは無くても完全動作)。
- 実推論の品質・遅延感・モデルライセンスは **人間確認(V3)** に委ねる。

上記のため、発注書 §4「意味信号(ML)」のモデル仕様欄は **未確定(スパイク未実施)** のまま Phase 3 実装に進む。
これは捏造回避の明示的記録であり、確定値のように書かない。
</content>
</invoke>
