/**
 * 全パラメータの一元管理(仕様 §4.3, §5.4, §12)。
 * lil-gui (?debug=1) から実行時に書き換えられるため、参照側は毎フレーム読み直すこと。
 */
export const CONFIG = {
  // --- グリッド(§3) ---
  /** セル高 = 画面高 × この係数 */
  cellFraction: 1 / 18,
  /** セル幅/高 比。既存サムネ(800×500)に合わせ 8:5 横長 // SPEC-DEFAULT */
  cellAspect: 1.6,
  /** 変形前のセル間ギャップ(セル寸法比) */
  gapBase: 0.09,
  /** インスタンス上限。超えたらセルを自動拡大 */
  maxInstances: 8000,
  /** 可視窓の外周マージン(セル数) */
  windowMargin: 4,
  /** トーラス周期割当表の一辺 */
  patternSize: 48,
  /** 割当 seed(?seed= で上書き) */
  seed: 42,

  // --- レンズ(§4) ---
  /** コア影響半径 = 画面短辺 × この係数 */
  lensRadiusFraction: 0.45,
  /** 変位の裾野が消える距離(×LENS_RADIUS) */
  tailEnd: 2.4,
  /** 中心セルの最大倍率 */
  maxScale: 5.0,
  /** 裾野圧縮部の最小倍率(これ未満に縮まない) */
  minScale: 0.5,
  /** ポインタ追従 Lerp(60fps基準) */
  lerpPointer: 0.12,

  // --- レンズ開閉(§4.5) ---
  lensOpenLerp: 0.1,
  lensCloseLerp: 0.18,
  lensMin: 0.15,
  /** これ以上のパン速度(px/s)でレンズが閉じる */
  closeSpeed: 600,

  // --- 波の航跡(§4.6) ---
  /** セル毎時間平滑の基準 Lerp(60fps基準) */
  lerpCellBase: 0.35,
  /** 距離によるラグ勾配(0で航跡なし) */
  waveLag: 0.35,

  // --- パン(§3.3) ---
  inertiaDamping: 0.94,
  autoDriftX: 6,
  autoDriftY: 2,
  /** 入力停止からドリフト再開までの秒数 */
  driftDelay: 3,

  // --- クリック判別(§7.2) ---
  clickMaxDist: 6,
  clickMaxMs: 500,
  /** 遷移を別タブで開く // SPEC-DEFAULT */
  openInNewTab: true,

  // --- 見た目(§5.4) ---
  /** 周縁の明度(中心=1) */
  vignetteMin: 0.25,
  /** 周縁の彩度(中心=1) */
  desatMin: 0.6,
  /** 角丸半径(CSS px) */
  cornerRadius: 6,
  /** 注視タイルのハイライト // SPEC-DEFAULT */
  focusHighlight: true,
  /** 注視タイルの隆起倍率(hover時にレンズ倍率へ上乗せし、最前面に重ねて描画) */
  focusPop: 1.35,
  /** 背景色 */
  background: [0x0a / 255, 0x0a / 255, 0x0a / 255] as const,

  // --- アトラス(§5.2) ---
  atlasTileW: 512,
  atlasTileH: 320,
  /** 画像並列ロード数 */
  loadConcurrency: 6,

  // --- モバイル(§4.4, §12) ---
  /** タッチ時にレンズ中心をタップ位置へ追従させる比較用フラグ // SPEC-DEFAULT: 中央固定 */
  touchLensFollows: false,
};

export type Config = typeof CONFIG;

/** prefers-reduced-motion への適応(§7.3) */
export function applyReducedMotion(c: Config): void {
  c.autoDriftX = 0;
  c.autoDriftY = 0;
  c.inertiaDamping = 0; // 慣性無効
  c.lerpPointer = 0.85; // ほぼ即時
  c.lensMin = 1; // 開閉無効(常時開)
  c.waveLag = 0;
  c.lerpCellBase = 0.95; // 航跡無効(ほぼ即時)
}

/** dt 正規化 Lerp 係数(§4.3): 1 - (1-k)^(dt*60) */
export function dtLerp(k: number, dt: number): number {
  return 1 - Math.pow(1 - k, dt * 60);
}
