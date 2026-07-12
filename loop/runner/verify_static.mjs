// V1 static lint — deterministic, no LLM. See loop/runner/README.md for the
// error/warning/deferred classification and loop/DESIGN.md §4 for the design.
//
// Usage:  node verify_static.mjs <artwork.html> [--json]
// Output: JSON report; exit 1 if any severity=error finding exists.
//
// Every finding follows the repair-feedback format (guide §3.2-3):
// { path, rule, severity, message, hint, line? }

import { readFileSync } from "node:fs";

const RESERVED = [
  "coherent",
  "sample",
  "filter",
  "precise",
  "restrict",
  "readonly",
  "writeonly",
  "subroutine",
  "input",
  "output",
  "common",
  "partition",
  "active",
];

// LITERT_GUIDE.md §8 と同期(3点同期: 本リスト / LITERT_GUIDE §8 / 制作規約 §4)
const EXTERNAL_ALLOWLIST = [
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers/,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@litertjs\//,
  /^https:\/\/huggingface\.co\//,
];

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

export function verifyStatic(source) {
  const findings = [];
  const err = (path, rule, message, hint, line) =>
    findings.push({ path, rule, severity: "error", message, hint, line });
  const warn = (path, rule, message, hint, line) =>
    findings.push({ path, rule, severity: "warning", message, hint, line });

  // --- header comment: the 5 mandatory sections (repo constraint block) ---
  const headerMatch = source.match(/<!--([\s\S]*?)-->/);
  const header = headerMatch ? headerMatch[1] : "";
  if (!headerMatch || lineOf(source, headerMatch.index) > 5) {
    err(
      "header",
      "header.comment",
      "ファイル冒頭に HTML コメントのヘッダがありません",
      "制作規約 §4「成果物の形」: 概要/実行方法/様式解析/パイプライン図/スライダー説明をコメントで書く",
    );
  } else {
    const sections = [
      ["header.run_instructions", /実行方法/, "「実行方法」"],
      ["header.style_analysis", /様式解析|不変量/, "「様式解析(不変量)」"],
      ["header.pipeline", /パイプライン/, "「パイプライン図」"],
      ["header.sliders", /スライダー/, "「スライダーの説明」"],
    ];
    for (const [rule, re, label] of sections) {
      if (!re.test(header)) {
        err(
          "header",
          rule,
          `ヘッダコメントに ${label} の節がありません`,
          "制作規約 §4 の5節構成(概要/実行方法/様式解析/パイプライン図/スライダー)に従ってください",
        );
      }
    }
  }

  // --- conventional DOM ids (panel/overlay/readout plumbing) ---
  const REQUIRED_IDS = [
    "togglePanel",
    "savePng",
    "resetLook",
    "overlay",
    "overlayTitle",
    "overlayText",
    "retryCamera",
    "readout",
    "panel",
    "video",
  ];
  for (const id of REQUIRED_IDS) {
    if (!new RegExp(`id=["']${id}["']`).test(source)) {
      err(
        `dom.#${id}`,
        "dom.required_id",
        `規約ID #${id} が存在しません`,
        "fable5_papercraft-cam.html の UI/オーバーレイ規約を踏襲してください",
      );
    }
  }

  // --- video element attributes ---
  const videoTag = source.match(/<video[^>]*>/);
  if (videoTag) {
    for (const attr of ["playsinline", "muted", "autoplay"]) {
      if (!videoTag[0].includes(attr)) {
        err(
          "dom.video",
          "video.attributes",
          `<video> に ${attr} がありません`,
          "<video id=\"video\" playsinline muted autoplay> が規約(iOS で必須)",
          lineOf(source, videoTag.index),
        );
      }
    }
  }

  // --- WebGL / camera conventions ---
  const simpleRules = [
    [
      /preserveDrawingBuffer:\s*true/,
      "gl.preserveDrawingBuffer",
      "preserveDrawingBuffer: true がありません",
      "SAVE PNG と readPixels 検証の前提。コンテキスト取得オプションに追加してください",
    ],
    [
      /Math\.min\(\s*2\s*,\s*(window\.)?devicePixelRatio/,
      "gl.dprCap",
      "devicePixelRatio の上限(Math.min(2, dpr))がありません",
      "モバイルでの過負荷防止。resize 処理で DPR を 2 に制限してください",
    ],
    [
      /facingMode/,
      "camera.facingMode",
      "getUserMedia の facingMode 指定がありません",
      "facingMode: 'user'|'environment' を指定し、モバイルで切替ボタンを出してください",
    ],
    [
      /window\.__artReady\s*=\s*true/,
      "hook.artReady",
      "検証フック window.__artReady がありません",
      "最初の本描画フレーム完了時に window.__artReady = true を立ててください(制作規約 §4 検証フック)",
    ],
    [
      /["']freeze["']/,
      "hook.freeze",
      "?freeze=1(時間駆動停止スイッチ)の処理が見当たりません",
      "URLSearchParams で freeze=1 を読み、時間駆動アニメーションを停止してください",
    ],
    [
      /prefers-reduced-motion/,
      "a11y.reducedMotion",
      "prefers-reduced-motion への対応がありません",
      "reduced-motion 時はアニメーション停止トグルを初期 ON にしてください",
    ],
  ];
  for (const [re, rule, message, hint] of simpleRules) {
    if (!re.test(source)) err(rule.split(".")[0], rule, message, hint);
  }

  // --- the 3 camera error paths (fixture-derived message keys) ---
  for (const key of ["SECURE CONTEXT", "PERMISSION DENIED", "NO CAMERA"]) {
    if (!source.includes(key)) {
      err(
        "camera.errorPaths",
        "camera.error_paths",
        `カメラエラー経路「${key}」の専用メッセージが見当たりません`,
        "非セキュア/権限拒否/カメラ無しの3経路に専用オーバーレイを出してください(制作規約 §4)",
      );
    }
  }

  // --- GLSL reserved words used as identifiers ---
  const reservedRe = new RegExp(
    String.raw`\b(?:float|int|uint|bool|[iu]?vec[234]|mat[234])\s+(${RESERVED.join("|")})\b`,
    "g",
  );
  let m;
  while ((m = reservedRe.exec(source)) !== null) {
    err(
      "glsl.identifiers",
      "glsl.reserved_word",
      `GLSL 予約語 "${m[1]}" が変数名に使われています`,
      "別名に変更してください(制作規約 §9-1。環境によって沈黙のコンパイル失敗になります)",
      lineOf(source, m.index),
    );
  }

  // --- external dependencies (single-file rule; ML exception allowlist) ---
  const urlRe = /["'](https?:\/\/[^"']+)["']/g;
  while ((m = urlRe.exec(source)) !== null) {
    const url = m[1];
    if (url.startsWith("http://localhost")) continue;
    if (!EXTERNAL_ALLOWLIST.some((re) => re.test(url))) {
      err(
        "deps.external",
        "deps.external_url",
        `許可リスト外の外部URL: ${url}`,
        "単一自己完結 HTML が規約。外部依存は ML(transformers.js / LiteRT.js / HF Hub)のみ許可(LITERT_GUIDE.md §8)",
        lineOf(source, m.index),
      );
    }
  }

  // --- warnings: approximate rules handed over to V2 (README の3分類) ---
  if (/hash\w*\s*\([^)]*uTime/.test(source)) {
    warn(
      "seed.time",
      "seed.utime_in_hash",
      "ハッシュ/シード計算に uTime が混入している可能性があります",
      "マーク配置・グレインのシードはセル座標のみから導出(フリッカの典型因)。V2 レビューで要確認",
      lineOf(source, source.match(/hash\w*\s*\([^)]*uTime/).index),
    );
  }
  if (
    /\bEMA\b|feedback|prev(ious)?\s*frame/i.test(source) &&
    (source.match(/createFramebuffer/g) || []).length < 2
  ) {
    warn(
      "gl.pingpong",
      "gl.pingpong_suspect",
      "EMA/feedback の記述がありますが FBO が2枚未満です(同一テクスチャ read&write の疑い)",
      "ping-pong(read と write を別テクスチャに)へ。V2 レビューで要確認",
    );
  }
  const lines = source.split("\n").length;
  if (lines > 6000) {
    warn(
      "file.size",
      "file.too_large",
      `ファイルが ${lines} 行あります(目安 6000 行超)`,
      "パス構成の見直し、またはデバッグコードの削除を検討",
    );
  }

  const errors = findings.filter((f) => f.severity === "error");
  return {
    summary: { errors: errors.length, warnings: findings.length - errors.length },
    findings,
  };
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node verify_static.mjs <artwork.html>");
    process.exit(2);
  }
  const report = { file, ...verifyStatic(readFileSync(file, "utf8")) };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary.errors > 0 ? 1 : 0);
}
