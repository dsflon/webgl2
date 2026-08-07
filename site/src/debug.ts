/**
 * ?debug=1 専用モジュール(仕様 §8)。動的 import されるため本番バンドルには含まれない。
 * lil-gui で §4.3/§5.4 の全パラメータを実行時調整、stats.js で fps 表示。
 */
import GUI from 'lil-gui';
import Stats from 'stats.js';
import { CONFIG } from './config';

export interface DebugTools {
  begin(): void;
  end(): void;
}

export function initDebug(): DebugTools {
  const gui = new GUI({ title: 'lens grid' });

  const lens = gui.addFolder('レンズ (§4)');
  lens.add(CONFIG, 'lensRadiusFraction', 0.2, 1, 0.01);
  lens.add(CONFIG, 'tailEnd', 1.2, 4, 0.05);
  lens.add(CONFIG, 'maxScale', 1.5, 10, 0.1);
  lens.add(CONFIG, 'minScale', 0.2, 1, 0.01);
  lens.add(CONFIG, 'lerpPointer', 0.01, 1, 0.01);

  const oc = gui.addFolder('開閉・航跡 (§4.5-4.6)');
  oc.add(CONFIG, 'lensOpenLerp', 0.01, 1, 0.01);
  oc.add(CONFIG, 'lensCloseLerp', 0.01, 1, 0.01);
  oc.add(CONFIG, 'lensMin', 0, 1, 0.01);
  oc.add(CONFIG, 'closeSpeed', 0, 3000, 10);
  oc.add(CONFIG, 'lerpCellBase', 0.01, 1, 0.01);
  oc.add(CONFIG, 'waveLag', 0, 0.9, 0.01);

  const grid = gui.addFolder('グリッド (§3)');
  grid.add(CONFIG, 'cellFraction', 1 / 24, 1 / 6, 0.001);
  grid.add(CONFIG, 'cellAspect', 0.6, 2, 0.05);
  grid.add(CONFIG, 'gapBase', 0, 0.3, 0.01);

  const pan = gui.addFolder('パン (§3.3)');
  pan.add(CONFIG, 'inertiaDamping', 0, 0.99, 0.01);
  pan.add(CONFIG, 'autoDriftX', -60, 60, 1);
  pan.add(CONFIG, 'autoDriftY', -60, 60, 1);

  const look = gui.addFolder('見た目 (§5.4)');
  look.add(CONFIG, 'vignetteMin', 0, 1, 0.01);
  look.add(CONFIG, 'desatMin', 0, 1, 0.01);
  look.add(CONFIG, 'cornerRadius', 0, 24, 1);
  look.add(CONFIG, 'focusHighlight');

  const stats = new Stats();
  stats.showPanel(0);
  stats.dom.style.cssText = 'position:fixed;bottom:0;left:0;z-index:20';
  document.body.appendChild(stats.dom);

  return { begin: () => stats.begin(), end: () => stats.end() };
}
