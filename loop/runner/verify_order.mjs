// S1 停止条件 — 発注書の決定的 lint。定義: loop/schemas/order_checklist.md
// Usage: node verify_order.mjs <order.md> [--legacy]
//   --legacy: 検証フック規約(Phase 0)以前に書かれた実物の検証用に order.hooks を免除

import { readFileSync } from "node:fs";

const VOCAB = [
  "kuwahara",
  "edge tangent flow",
  "etf",
  "xdog",
  "fdog",
  "halftone",
  "voronoi",
  "curl noise",
  "stable fluids",
  "split toning",
  "スプリットトーン",
  "ema",
  "hysteresis",
  "ヒステリシス",
  "sdf",
  "stroke splatting",
  "quantile",
  "分位点",
  "bayer",
  "oklab",
  "cell-hash",
  "ping-pong",
  "dilate",
  "boids",
  "impasto",
  "granulation",
  "edge darkening",
];

// ヘッダ行に needle を含む Markdown 表の本体行数を数える
function tableRows(source, needle) {
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("|") && lines[i].includes(needle)) {
      let n = 0;
      for (let j = i + 2; j < lines.length && lines[j].trim().startsWith("|"); j++) n++;
      return n;
    }
  }
  return -1;
}

export function verifyOrder(source, opts = {}) {
  const findings = [];
  const err = (path, rule, message, hint) =>
    findings.push({ path, rule, severity: "error", message, hint });

  const firstLine = source.split("\n").find((l) => l.startsWith("#")) || "";
  if (!/発注|依頼/.test(firstLine)) {
    err("title", "order.title", "先頭見出しが発注書になっていません", "「# 発注書 — <ファイル名>」形式にしてください");
  }

  const invRows = tableRows(source, "視覚的不変量");
  if (invRows < 0 || !source.includes("担当軸")) {
    err("invariants", "order.invariant_table", "不変量表(視覚的不変量/担当軸)が見つかりません", "制作規約ゲート1の表形式で様式解析を含めてください");
  } else if (invRows < 3 || invRows > 7) {
    err("invariants", "order.invariant_table", `不変量が ${invRows} 行です(要 3〜7 = 5±2)`, "様式の核となる不変量を 5±2 個に絞ってください");
  }

  const sliderRows = tableRows(source, "ラベル");
  if (sliderRows < 0) {
    err("ui.sliders", "order.sliders", "スライダー定義表(ラベル列)が見つかりません", "「写真↔様式」軸で 6〜10 本のスライダー表を含めてください");
  } else if (sliderRows < 6 || sliderRows > 10) {
    err("ui.sliders", "order.sliders", `スライダーが ${sliderRows} 本です(要 6〜10)`, "制作規約ゲート2: スライダーは 6〜10 本");
  }

  const presence = [
    ["signals", "order.signals", /生き残らせる信号/, "「入力から生き残らせる信号」の節を含めてください"],
    ["phases", "order.phases", /Phase 1[\s\S]*Phase 2[\s\S]*Phase 4/, "フェーズ制(Phase 1〜4)の進め方を含めてください"],
    ["constraints", "order.constraints", /制約条件[\s\S]*単一の自己完結[\s\S]*カメラ[\s\S]*品質基準/, "制作規約 §4 の規約ブロックを同梱してください"],
    ["technotes", "order.technotes", /予約語[\s\S]*ping-pong|ping-pong[\s\S]*予約語/, "制作規約 §9 の技術注意リストを同梱してください"],
    ["verification", "order.verification", /フェイクカメラ[\s\S]*スクリーンショット|スクリーンショット[\s\S]*フェイクカメラ/, "検証環境(フェイクカメラ+スクリーンショット手順)を同梱してください"],
    ["rubric", "order.rubric", /自己批評/, "自己批評ルーブリック(制作規約 §7.4)を同梱してください"],
    ["report", "order.report", /報告様式/, "報告様式(成果物/確認済み/未確認/迷った点)を指定してください"],
  ];
  for (const [path, rule, re, hint] of presence) {
    if (!re.test(source)) err(path, rule, `${rule} の必須要素が見つかりません`, hint);
  }

  if (!opts.legacy && !(/__artReady/.test(source) && /freeze/.test(source))) {
    err(
      "constraints.hooks",
      "order.hooks",
      "検証フック(window.__artReady / ?freeze=1)の要求が制約条件にありません",
      "制作規約 §4「検証フック」を規約ブロックに含めてください(Phase 0 で追補済みの現行規約)",
    );
  }

  const lower = source.toLowerCase();
  const vocabHits = VOCAB.filter((v) => lower.includes(v));
  if (vocabHits.length < 3) {
    err(
      "vocabulary",
      "order.vocab",
      `技法語彙が ${vocabHits.length} 語しか見つかりません(要3語以上。検出: ${vocabHits.join(", ") || "なし"})`,
      "制作規約 §5 の正式名称で実装原理を固定してください(語彙なしの発注は後処理近似に流れる)",
    );
  }

  const errors = findings.filter((f) => f.severity === "error");
  return { summary: { errors: errors.length, warnings: findings.length - errors.length }, findings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node verify_order.mjs <order.md> [--legacy]");
    process.exit(2);
  }
  const report = {
    file,
    ...verifyOrder(readFileSync(file, "utf8"), { legacy: process.argv.includes("--legacy") }),
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary.errors > 0 ? 1 : 0);
}
