/**
 * マウス/タッチ統合入力(仕様 §3.3, §4.4, §7.2)。
 * ドラッグ=パン、クリック/タップ=遷移(移動量6px未満かつ500ms未満)、慣性、自動ドリフト。
 */
import { CONFIG, dtLerp } from '../config';

/** クリックかドラッグかの判別(§7.2)。純関数(テスト対象) */
export function isClick(distPx: number, elapsedMs: number, maxDist: number, maxMs: number): boolean {
  return distPx < maxDist && elapsedMs < maxMs;
}

export interface PointerState {
  /** レンズ中心(スクリーンpx, Lerp済み) */
  lensX: number;
  lensY: number;
  /** パンオフセット(ワールドpx) */
  panX: number;
  panY: number;
  /** パン速度(px/s) — レンズ開閉判定にも使う */
  speed: number;
  /** ドラッグ中か */
  dragging: boolean;
  /** 精密ポインタ(マウス)か */
  fine: boolean;
}

export class PointerInput {
  readonly state: PointerState;
  private targetX: number;
  private targetY: number;
  private velX = 0;
  private velY = 0;
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private lastX = 0;
  private lastY = 0;
  private lastMoveT = 0;
  private idleSince = 0;
  private pointerId = -1;
  private clickHandler: ((x: number, y: number) => void) | null = null;

  constructor(private el: HTMLElement, private width: number, private height: number) {
    this.state = {
      lensX: width / 2,
      lensY: height / 2,
      panX: 0,
      panY: 0,
      speed: 0,
      dragging: false,
      fine: window.matchMedia('(pointer: fine)').matches,
    };
    this.targetX = width / 2;
    this.targetY = height / 2;
    this.idleSince = performance.now() / 1000;

    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
  }

  onClick(fn: (x: number, y: number) => void): void {
    this.clickHandler = fn;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (!this.state.fine) {
      this.targetX = width / 2;
      this.targetY = height / 2;
    }
  }

  private onDown = (e: PointerEvent): void => {
    this.state.fine = e.pointerType === 'mouse'; // ハイブリッド機はイベント種別で動的判別(§4.4)
    this.pointerId = e.pointerId;
    this.el.setPointerCapture(e.pointerId);
    this.state.dragging = true;
    this.downX = this.lastX = e.clientX;
    this.downY = this.lastY = e.clientY;
    this.downT = this.lastMoveT = performance.now();
    this.velX = this.velY = 0;
    this.markActive();
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') {
      this.state.fine = true;
      this.targetX = e.clientX;
      this.targetY = e.clientY;
    } else if (CONFIG.touchLensFollows) {
      this.targetX = e.clientX;
      this.targetY = e.clientY;
    }
    if (this.state.dragging && e.pointerId === this.pointerId) {
      const now = performance.now();
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.state.panX -= dx;
      this.state.panY -= dy;
      const dt = Math.max((now - this.lastMoveT) / 1000, 1e-3);
      this.velX = -dx / dt;
      this.velY = -dy / dt;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.lastMoveT = now;
    }
    this.markActive();
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.state.dragging = false;
    this.pointerId = -1;
    const dist = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
    const ms = performance.now() - this.downT;
    if (isClick(dist, ms, CONFIG.clickMaxDist, CONFIG.clickMaxMs)) {
      this.velX = this.velY = 0;
      this.clickHandler?.(e.clientX, e.clientY);
    }
    this.markActive();
  };

  private onLeave = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && !this.state.dragging) {
      // レンズ中心は最後の位置に留める(仕様に指定なし。中央へ戻さない)
    }
  };

  private markActive(): void {
    this.idleSince = performance.now() / 1000;
  }

  /** 毎フレーム更新。dt: 秒 */
  update(dt: number): void {
    const s = this.state;
    // レンズ中心 Lerp(§4.4)
    const touchCenter = !s.fine && !CONFIG.touchLensFollows;
    const tx = touchCenter ? this.width / 2 : this.targetX;
    const ty = touchCenter ? this.height / 2 : this.targetY;
    const k = dtLerp(CONFIG.lerpPointer, dt);
    s.lensX += (tx - s.lensX) * k;
    s.lensY += (ty - s.lensY) * k;

    // 慣性(§3.3)
    if (!s.dragging) {
      const damp = CONFIG.inertiaDamping <= 0 ? 0 : Math.pow(CONFIG.inertiaDamping, dt * 60);
      this.velX *= damp;
      this.velY *= damp;
      if (Math.abs(this.velX) < 1 && Math.abs(this.velY) < 1) this.velX = this.velY = 0;
      s.panX += this.velX * dt;
      s.panY += this.velY * dt;

      // 自動ドリフト(§3.3): 入力停止から driftDelay 秒後に再開
      const idle = performance.now() / 1000 - this.idleSince;
      if (idle > CONFIG.driftDelay && this.velX === 0 && this.velY === 0) {
        s.panX += CONFIG.autoDriftX * dt;
        s.panY += CONFIG.autoDriftY * dt;
      }
    }
    s.speed = s.dragging
      ? Math.hypot(this.velX, this.velY)
      : Math.hypot(this.velX, this.velY);
  }
}
