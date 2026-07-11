// V2 レビュー出力の検証(構造: review.schema.json / 意味: 本ファイル)。
// 壊れたレビュー・採点と矛盾する verdict をループに入れないための停止条件。
// Usage: node verify_review.mjs <review.json> [--brief brief.json]
//   --brief を渡すと invariant_id の対応(過不足)も検証する。

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const HERE = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(join(HERE, "..", "schemas", "review.schema.json"), "utf8"),
);

export function verifyReview(review, brief = null) {
  const findings = [];
  const err = (path, rule, message, hint) =>
    findings.push({ path, rule, severity: "error", message, hint });

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  if (!ajv.validate(schema, review)) {
    for (const e of ajv.errors) {
      err(
        e.instancePath || "(root)",
        `schema.${e.keyword}`,
        `${e.instancePath || "(root)"} ${e.message}`,
        "loop/schemas/review.schema.json に適合する完全な JSON を再出力してください",
      );
    }
    return finalize(findings);
  }

  // semantic: verdict と採点の整合(全不変量≥4 かつ common 全軸≥4 ⇔ pass)
  const minScore = Math.min(...review.scores.map((s) => s.score));
  const minCommon = Math.min(
    review.common.style_holds,
    review.common.subject_readable,
    review.common.artifact_free,
  );
  const shouldPass = minScore >= 4 && minCommon >= 4;
  if ((review.verdict === "pass") !== shouldPass) {
    err(
      "/verdict",
      "semantic.verdict_mismatch",
      `verdict=${review.verdict} ですが最低点は 不変量=${minScore}/common=${minCommon} です`,
      "pass は全不変量≥4 かつ common 全軸≥4 のときのみ。採点に合わせて verdict を訂正してください",
    );
  }

  // semantic: brief との id 対応(過不足なく全不変量を採点する)
  if (brief) {
    const briefIds = brief.invariants.map((i) => i.id).sort((a, b) => a - b).join(",");
    const scoreIds = review.scores.map((s) => s.invariant_id).sort((a, b) => a - b).join(",");
    if (briefIds !== scoreIds) {
      err(
        "/scores",
        "semantic.invariant_coverage",
        `採点された id (${scoreIds}) が brief の不変量 (${briefIds}) と一致しません`,
        "brief の全不変量を過不足なく採点してください(採点漏れは甘さの温床)",
      );
    }
  }

  return finalize(findings);
}

function finalize(findings) {
  const errors = findings.filter((f) => f.severity === "error");
  return { summary: { errors: errors.length, warnings: findings.length - errors.length }, findings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node verify_review.mjs <review.json> [--brief brief.json]");
    process.exit(2);
  }
  const bi = process.argv.indexOf("--brief");
  const brief = bi > 0 ? JSON.parse(readFileSync(process.argv[bi + 1], "utf8")) : null;
  const report = { file, ...verifyReview(JSON.parse(readFileSync(file, "utf8")), brief) };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary.errors > 0 ? 1 : 0);
}
