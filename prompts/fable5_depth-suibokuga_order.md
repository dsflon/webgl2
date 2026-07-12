# 発注書 — fable5_depth-suibokuga.html「Sumi Sansui — 深度三遠の水墨」

> この文書は [AI_DIRECTION_GUIDE.md](../AI_DIRECTION_GUIDE.md) §3.1 マスター依頼文の穴埋め版であり、
> **このままコピーして実装担当の生成AIに渡す**ことを想定した自己完結の依頼文である。
> S1 で `loop/state/depth-suibokuga/brief.json` から生成した。構造の実物は
> `prompts/fable5_papercraft-cam_order.md`。ML の実装方針は [LITERT_GUIDE.md](../LITERT_GUIDE.md) に従う。

---

# 依頼: WebGL2 リアルタイム映像作品「深度三遠の水墨山水」の新規制作

## 1. 作りたいもの

Webカメラの映像を、リアルタイムに **水墨山水画** として描画する作品。

単眼深度推定モデルで映像の奥行きを推定し、**深度を「三遠」(遠・中・近)の墨の階調に写像**する。
近景ほど墨は濃く輪郭が明瞭に、遠景ほど墨は淡く輪郭が大気に溶ける(空気遠近)。
被写体の形態は、白から黒への階調境界で顔料が縁に溜まる **水墨のにじみ** として置き換わり、
紙の繊維に沿った粒状ムラが物質感を作る。

- ファイル名: `fable5_depth-suibokuga.html`
- リポジトリ: `dsflon/webgl2`(単一HTML作品集。GitHub Pages で配信)
- タイトル表記: `FABLE5 · Sumi Sansui — WebGL2 depth-driven ink landscape`

この様式の本質は「**深度が墨の三遠に置き換わっている**」ことである。これを後処理(ぼかし・
色調整・オーバーレイ)で近似してはならない(制作規約 失敗モード#1)。特に、輝度だけで
遠近を偽装した「グレースケール+ぼかし」は最も警戒すべき失敗である。

## 2. 様式の参照 — 視覚的不変量表(ゲート1通過済み)

参照: 郭熙『林泉高致』の三遠法(高遠・深遠・平遠。遠景ほど墨が淡く輪郭が大気に溶ける)。
墨の五彩(焦・濃・重・淡・清)。本リポジトリの既存水墨作品 suibokuga_fluid / suibokuga_particle の
墨のにじみ・紙の質感・無彩色階調を採取元とする。

| # | 視覚的不変量(実装可能な構造の言葉で) | 担当軸 | 実装原理の指定 | 外した場合の影響 |
|---|---|---|---|---|
| 1 | **深度に応じて墨の濃度と輪郭の明瞭さが減衰し、遠景ほど淡く輪郭が大気に溶ける(三遠の空気遠近)** | 場/知覚 | monocular depth estimation の深度で墨の不透明度とエッジ強度を depth-conditioned dilution により遠方ほど減衰 | 輝度だけでは遠い暗部と近い暗部を区別できず、奥行きのない平面的な墨絵になる |
| 2 | **白から黒への階調境界で顔料が縁に溜まって暗くなり、内側が抜ける水墨のにじみ** | マーク/物質 | threshold diffusion による反復拡散と、勾配で境界を暗くする edge darkening | のっぺりした連続濃淡になり、墨のにじみ(渇筆・破墨)に見えない |
| 3 | **紙の繊維に沿った顔料の粒状ムラが、にじみの中に不均一な物質感を作る** | 物質 | cell-hash 由来の静的グレインを紙の谷に溜める paper granulation(時間シード禁止) | 均一で乾いたデジタル的な面になりプラスチックに見える |
| 4 | **墨は無彩色〜わずかな冷暖のみで、白紙・清・淡・重・濃・焦の段階的な階調を持つ** | 色 | 輝度ゾーン別 split toning で墨の五彩へ写像し、彩度の低い画素ほど強く寄せる | 均一グレーで墨の階調(五彩)が死に、濃淡の抑揚が消える |
| 5 | **被写体が前後に動くと所属する『遠』が変わり、墨の濃度と滲みが遅れて滑らかに追従する** | 時間/知覚 | depth EMA ping-pong で深度を平滑化し、quantile 層への帰属を安定遷移させる | 深度がちらついて墨が毎フレーム震える、または追従せず一枚絵と区別がつかない |

優先度(外すとその様式に見えなくなる順): **1 > 2 > 4 > 3 > 5**

Phase 1 ではこの表を独自の再解析で置き換えず、復唱と実装上の懸念の列挙のみ行うこと。

## 3. 入力映像から生き残らせる信号

- 生き残る: 被写体の形態(シルエット) / 奥行きの順序(深度) / 明暗の階調
- 様式側で置き換わる: 色(墨の無彩色五彩へ写像) / テクスチャ(紙とにじみへ)
- 被写体(特に人物)が判読できることは受入基準である。遠景に溶けても「そこに何かが居る」ことは残す。

## 4. 技術方針(この指定に従うこと)

実装原理は次の技法語彙で固定する: monocular depth estimation / depth-conditioned dilution /
depth EMA ping-pong / quantile / threshold diffusion / edge darkening / paper granulation /
cell-hash / split toning。

パス構成の出発点(Phase 2 で承認を得てから実装):

- P0 カメラ cover-fit 取り込み → 輝度・勾配(構造テンソル)算出
- P1 深度取得(実推論 or `?fakesource=1` の合成深度)→ R16F へ
- P2 深度 EMA ping-pong(depth EMA ping-pong。時定数=Depth calm)→ R16F
- P3 にじみ: threshold diffusion の反復拡散 + edge darkening → R16F/R8
- P4 墨化合成: 深度で depth-conditioned dilution(遠方ほど淡く・エッジ減衰)+
  輝度ゾーン別 split toning(墨の五彩)+ cell-hash の paper granulation
- uDebug: RAW DEPTH / SMOOTH DEPTH / INK / FINAL の4モード

### 意味信号(ML)— brief.ml の転記(S0 判定済み。変更禁止)

本作は ML を使う(S0 判定済み。LITERT_GUIDE.md §2.1 判定フロー通過)。

- 信号: **depth**(単眼深度。1作品1信号 — LITERT_GUIDE §2.2)
- 判定根拠: 深度が無いと三遠(遠景ほど淡く滲む空気遠近)が作れず、輝度だけでは遠い暗部と
  近い暗部を区別できないため、ただの平面的な墨絵になる。
- ランタイム: **LiteRT.js**(accelerator=webgpu、wasm 降格付き)。選定理由: 被写体の深度移動に
  墨の三遠が追従する体験(不変量5)は毎フレーム級の応答を要するため(LITERT_GUIDE §3 ルール1)。
  **ランタイムの変更禁止**(失敗モード M6)。
- モデル: Depth-Anything-V2-Small の `.tflite` を候補とする。**入出力の形状・dtype・正規化・
  実 URL・ライセンスは Phase 2 のスパイク(LITERT_GUIDE §4.7)で実測し本節に転記してから
  Phase 3 へ進むこと。** スパイク未実施のまま仕様を確定しない(捏造の禁止)。
- 実装パターンは LITERT_GUIDE §4 に厳密に従うこと:
  - §4.1 CDN 読込はバージョンをピン留め(`@litertjs/core@<pin>`。許可リストは §8)。
  - §4.2 webgpu で `loadAndCompile`、失敗時は wasm へ明示降格し推論解像度/頻度を落とす。
  - §4.3 **推論は描画ループ(rAF)と分離した独立非同期ループ。in-flight は最大1件**
    (失敗モード M2)。
  - §4.4 全 Tensor は try/finally で `delete()` を保証(失敗モード M4)。推論入力は
    256〜320px 角の縮小オフスクリーンから(失敗モード M8)。
  - §4.5 状態チップ(BOOTING→WEBGPU/WASM→OFFLINE)と MODEL LOAD FAILED + RETRY 経路。
    **モデル失敗でも作品を止めず**、合成深度または縮退様式で継続(失敗モード M5)。
  - §6 M1: 深度マップを最終画面に直接出さない。深度は様式パイプラインの入力としてのみ使う
    (uDebug でのみ生値可)。
  - §6 M3: 推論結果テクスチャは P2 の depth EMA ping-pong で時間平滑化し、時定数をスライダー化。
- `?fakesource=1` の合成信号: 手前から奥への滑らかな深度勾配に前景シルエットの段差を重ねた
  合成深度場で全パスを駆動する。**不変量5(時間)の検証のため前景シルエットを左右にゆっくり
  動かすこと**(V1 の運動応答チェック `--motion` が依存)。合成の分岐は「深度テクスチャの
  供給元の差し替え」1点に局在させること。

## 5. 進め方(フェーズ制・厳守)

- Phase 1: 不変量表の復唱+実装上の懸念点の列挙(コードを書かない)
- Phase 2: 設計 — 候補アーキテクチャ2〜3案の比較(却下理由付き)、パス構成図
  (入出力・解像度・フォーマット・更新頻度)、フィルレート概算、リスク、**ML スパイク結果**
  (LITERT_GUIDE §4.7)。ここまでコードを書かない
- Phase 3: 実装 — 骨格(カメラ→cover-fit→素通し→UI→エラー経路)→ 標本
  (墨の五彩の色見本と、単一シルエットに対するにじみ1枚の標本)→ パス追加。
  承認済み標本のパラメタを無断変更しない。1000行超は論理単位で分割書き込み
- Phase 4: 検証 — 検証手順+自己批評ルーブリック。未検証のまま完成と報告しない

## 6. UI 仕様

### スライダー(「写真らしさ ↔ 様式の強さ」の軸で 6〜10 本)

| key | ラベル | 範囲(初期値) | 作用 |
|---|---|---|---|
| inkStrength | Ink strength | 0–1 (0.8) | 墨化の全体強度(写真↔墨) |
| depthDilution | Sanyen dilution | 0–1 (0.7) | 深度による遠方の墨の希釈(三遠の効き) |
| depthCalm | Depth calm | 0–1 (0.6) | 深度 EMA の時定数(追従の速さ↔落ち着き) |
| bleedRadius | Bleed radius | 0–1 (0.5) | にじみ(threshold diffusion)の反復量 |
| edgeDark | Edge darkening | 0–1 (0.55) | にじみ境界の顔料溜まりの暗さ |
| paperGrain | Paper grain | 0–1 (0.4) | 紙の粒状(paper granulation)量 |
| toneSplit | Sumi five-tones | 0–1 (0.6) | split toning の階調分割(墨の五彩の効き) |
| paperWarm | Paper warmth | -1–1 (0.1) | 紙と墨の冷暖(冷=青墨↔暖=茶墨) |

### プリセット・readout・ボタン

- プリセット: 「Heiho 平遠」(淡くワイド)/「Shinen 深遠」(濃淡の対比強)/
  「Hatsuboku 溌墨」(にじみ強) — 標本(色見本)で承認を得ること。
- readout: FPS / 描画解像度 / 推論FPS(描画とは別)/ 深度バックエンド(WEBGPU/WASM/OFFLINE)。
  ボタン: SAVE PNG / RESET LOOK / HIDE UI。

## 7. 制約条件(dsflon/webgl2 リポジトリ規約 — 受入基準を兼ねる)

### 成果物の形
- 単一の自己完結 HTML。外部ライブラリ・ビルド工程・外部アセット禁止
  (例外: ML モデル・ランタイムのみ CDN 可 — 許可リストは LITERT_GUIDE.md §8。
  本作の許可: `@litertjs/core`(バージョンピン留め)+ Depth-Anything-V2-Small `.tflite`)。
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
  PNG保存・深度状態チップの規約を踏襲すること。
- 全パラメタは単一の state オブジェクトに集約し、スライダー定義は
  [key, ラベル, ヒント, min, max, step] の配列から生成すること。
- DEFAULTS と「RESET LOOK」。「HIDE UI」「SAVE PNG」(preserveDrawingBuffer: true)。
- prefers-reduced-motion 時はアニメーション停止トグルを初期 ON。

### 検証フック(機械検証が依存する。必須)
- window.__artReady: 最初の本描画フレーム完了時に true を立てること。
- ?freeze=1: 時間駆動アニメーションを停止し決定的な静止フレームを出すこと。
- ?fakesource=1: 合成深度場で様式パイプラインを駆動できること(§4 の合成信号仕様)。
  動きに反応する作品(不変量に「時間」を含む)なので合成シーンに動く前景を1つ含めること。

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
14. ML 推論は描画と分離した非同期ループで in-flight 1件。全 Tensor を delete()(LITERT_GUIDE §4.3/§4.4)。

## 9. 検証環境

- フェイクカメラ+スクリーンショットは `loop/runner/`(testscene.mjs / verify_runtime.mjs)
  を使う。ローカルサーバは python3 -m http.server 8888。
- スクリーンショットは (a) 最終合成 (b) uDebug の主要モード (c) ?fakesource=1 の標本
  の3枚以上。pageerror が出ていないことを毎回確認する。
- 実推論(LiteRT.js + 実 `.tflite`)は非決定的かつ環境依存のため V1 の停止条件にしない。
  `?fakesource=1` の合成深度で全チェックを行う(LITERT_GUIDE §5)。実推論の品質は人間確認(V3)。
- 検証できない項目は「未検証」と明記し、確認すべき点を列挙すること。

## 10. 自己批評ルーブリック(スクリーンショット取得後、報告の前に実行)

1. §2 の不変量表の各行を画像と照合し 5 段階で自己採点(存在しなければ1点+理由)。
2. 「縮小して見た印象」(様式の成立)と「等倍で見た印象」(構造の正しさ・誤魔化しの有無)を分ける。
3. 最低点の2項目に、制作規約 §10 翻訳表の語彙で修正案を出す。
4. 全項目4点以上まで最大3周まで自走してよい。採点は甘くしない。

## 11. 報告様式

各フェーズの最後に: 「成果物 / 自分で確認したこと / 未確認のこと / 判断に迷った点」の4項目。
受入基準にない機能は実装せず提案に留めること。
