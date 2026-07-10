// S0 停止条件 — brief.json の検証(構造: invariants.schema.json / 意味: 本ファイル)。
// Usage: node verify_brief.mjs <brief.json>
// 出力はフィールド単位エラー+修正ヒントの JSON。error があれば exit 1。

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const HERE = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(join(HERE, "..", "schemas", "invariants.schema.json"), "utf8"),
);

export function verifyBrief(brief) {
  const findings = [];
  const err = (path, rule, message, hint) =>
    findings.push({ path, rule, severity: "error", message, hint });

  // structural (schema)
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  if (!ajv.validate(schema, brief)) {
    for (const e of ajv.errors) {
      err(
        e.instancePath || "(root)",
        `schema.${e.keyword}`,
        `${e.instancePath || "(root)"} ${e.message}`,
        "loop/schemas/invariants.schema.json に適合させてください(列構成は発注書の実物準拠)",
      );
    }
    return finalize(findings);
  }

  // semantic: priority は不変量 id の完全な並べ替えであること
  const ids = brief.invariants.map((i) => i.id);
  if (new Set(ids).size !== ids.length) {
    err("/invariants", "semantic.duplicate_id", "不変量の id が重複しています", "id は一意の整数にしてください");
  }
  const sortedIds = [...ids].sort((a, b) => a - b).join(",");
  const sortedPri = [...brief.priority].sort((a, b) => a - b).join(",");
  if (sortedIds !== sortedPri) {
    err(
      "/priority",
      "semantic.priority_mismatch",
      `priority (${brief.priority.join(",")}) が不変量 id 集合 (${ids.join(",")}) の並べ替えになっていません`,
      "全不変量 id をちょうど1回ずつ、優先順に並べてください",
    );
  }

  // semantic: 各 principle が vocabulary のいずれかの語を含むこと
  // (語彙なしの原理は後処理近似=失敗モード#1 に流れやすい)
  brief.invariants.forEach((inv, i) => {
    const hit = brief.vocabulary.some((v) => inv.principle.toLowerCase().includes(v.toLowerCase()));
    if (!hit) {
      err(
        `/invariants/${i}/principle`,
        "semantic.principle_without_vocab",
        `不変量 id=${inv.id} の実装原理に vocabulary の語が含まれていません`,
        "制作規約 §5 の正式名称(vocabulary に列挙した語)で実装原理を固定してください",
      );
    }
  });

  return finalize(findings);
}

function finalize(findings) {
  const errors = findings.filter((f) => f.severity === "error");
  return { summary: { errors: errors.length, warnings: findings.length - errors.length }, findings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node verify_brief.mjs <brief.json>");
    process.exit(2);
  }
  const report = { file, ...verifyBrief(JSON.parse(readFileSync(file, "utf8"))) };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary.errors > 0 ? 1 : 0);
}
