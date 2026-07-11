// art-loop の状態機械 CLI — 進捗の唯一の正(指南書 Step 4 / DESIGN §7)。
// すべての状態遷移はこの CLI 経由で行う(スキルは JSON を直接編集しない)。
// 書き込みは毎回 state.schema.json で検証し、log.jsonl に追記する。
//
// Usage:
//   node state.mjs init <slug> <theme...>
//   node state.mjs show <slug> | list
//   node state.mjs status <slug> <briefed|ordered|implemented|runtime_ok|aesthetic_ok|submitted|failed>
//   node state.mjs attempt <slug> <brief|order|implement|runtime|aesthetic>
//        → {"attempts":n,"limit":m,"exceeded":bool} を出力。exceeded なら needs-review へ
//   node state.mjs error <slug> <errors.json のパス>       (last_error に原文を保存)
//   node state.mjs needs-review <slug> <resume_stage> <reason...>
//   node state.mjs resume <slug>                            (needs_review → resume_stage の直前状態へ)
//   node state.mjs cost <slug> <approx_tokens> <wall_minutes>
//   node state.mjs next <slug>                              (状態から次のステージを導出)
//
// 環境変数 ART_LOOP_STATE_DIR で状態ディレクトリを差し替え可能(テスト用)。

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  appendFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = process.env.ART_LOOP_STATE_DIR || join(HERE, "..", "state");
const schema = JSON.parse(readFileSync(join(HERE, "..", "schemas", "state.schema.json"), "utf8"));

// サーキットブレーカー①: ステージ別試行上限(DESIGN §9)
export const LIMITS = { brief: 2, order: 2, implement: 3, runtime: 3, aesthetic: 3 };

// 状態 → 次ステージ(袋小路なし。needs_review は resume_stage を持つ)
const NEXT = {
  created: "brief",
  briefed: "order",
  ordered: "implement",
  implemented: "runtime",
  runtime_ok: "aesthetic",
  aesthetic_ok: "submit",
  submitted: "done",
};

// resume_stage → そのステージの直前の status
const STAGE_ENTRY_STATUS = {
  brief: "created",
  order: "briefed",
  implement: "ordered",
  runtime: "implemented",
  aesthetic: "runtime_ok",
  submit: "aesthetic_ok",
};

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function statePath(slug) {
  return join(STATE_DIR, slug, "state.json");
}

export function load(slug) {
  return JSON.parse(readFileSync(statePath(slug), "utf8"));
}

export function save(slug, state, event) {
  state.updated_at = new Date().toISOString();
  if (!validate(state)) {
    const msgs = validate.errors.map((e) => `${e.instancePath} ${e.message}`).join("; ");
    throw new Error(`state.schema.json 違反のため書き込み拒否: ${msgs}`);
  }
  mkdirSync(dirname(statePath(slug)), { recursive: true });
  writeFileSync(statePath(slug), JSON.stringify(state, null, 2));
  appendFileSync(
    join(STATE_DIR, slug, "log.jsonl"),
    JSON.stringify({ at: state.updated_at, event, status: state.status }) + "\n",
  );
  return state;
}

export function init(slug, theme) {
  if (existsSync(statePath(slug))) throw new Error(`${slug} は既に存在します(show で確認)`);
  return save(
    slug,
    {
      slug,
      theme,
      status: "created",
      attempts: { brief: 0, order: 0, implement: 0, runtime: 0, aesthetic: 0 },
      last_error: null,
      requires_human: false,
      blocked_reason: null,
      resume_stage: null,
      cost: { loops: 0, approx_tokens: 0, wall_minutes: 0 },
      pr_url: null,
      updated_at: "",
    },
    "init",
  );
}

export function attempt(slug, stage) {
  if (!(stage in LIMITS)) throw new Error(`未知のステージ: ${stage}`);
  const s = load(slug);
  s.attempts[stage] = (s.attempts[stage] || 0) + 1;
  s.cost.loops += 1;
  save(slug, s, `attempt:${stage}#${s.attempts[stage]}`);
  return { stage, attempts: s.attempts[stage], limit: LIMITS[stage], exceeded: s.attempts[stage] > LIMITS[stage] };
}

export function needsReview(slug, resumeStage, reason) {
  const s = load(slug);
  s.status = "needs_review";
  s.requires_human = true;
  s.blocked_reason = reason;
  s.resume_stage = resumeStage;
  return save(slug, s, "needs_review");
}

export function resume(slug) {
  const s = load(slug);
  if (s.status !== "needs_review") throw new Error(`resume は needs_review のみ(現在: ${s.status})`);
  const entry = STAGE_ENTRY_STATUS[s.resume_stage];
  if (!entry) throw new Error(`resume_stage が不正: ${s.resume_stage}`);
  s.status = entry;
  s.requires_human = false;
  s.blocked_reason = null;
  s.attempts[s.resume_stage] = 0; // 人間の介入後は当該ステージの試行を仕切り直す
  s.resume_stage = null;
  return save(slug, s, "resume");
}

export function next(slug) {
  const s = load(slug);
  if (s.status === "needs_review") return { next: s.resume_stage, blocked: true, reason: s.blocked_reason };
  if (s.status === "failed") return { next: null, blocked: true, reason: "恒久エラー(failed)" };
  return { next: NEXT[s.status] ?? null, blocked: false };
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , cmd, slug, ...rest] = process.argv;
  const out = (o) => console.log(JSON.stringify(o, null, 2));
  try {
    switch (cmd) {
      case "init":
        out(init(slug, rest.join(" ")));
        break;
      case "show":
        out(load(slug));
        break;
      case "list": {
        const rows = existsSync(STATE_DIR)
          ? readdirSync(STATE_DIR, { withFileTypes: true })
              .filter((d) => d.isDirectory())
              .map((d) => {
                try {
                  const s = load(d.name);
                  return { slug: s.slug, status: s.status, requires_human: s.requires_human, updated_at: s.updated_at };
                } catch {
                  return { slug: d.name, status: "(state.json 不正)" };
                }
              })
          : [];
        out(rows);
        break;
      }
      case "status": {
        const s = load(slug);
        s.status = rest[0];
        if (rest[0] !== "needs_review") {
          s.requires_human = false;
          s.blocked_reason = null;
        }
        out(save(s.slug, s, `status:${rest[0]}`));
        break;
      }
      case "attempt":
        out(attempt(slug, rest[0]));
        break;
      case "error": {
        const s = load(slug);
        s.last_error = JSON.parse(readFileSync(rest[0], "utf8"));
        out(save(slug, s, "error"));
        break;
      }
      case "needs-review":
        out(needsReview(slug, rest[0], rest.slice(1).join(" ")));
        break;
      case "resume":
        out(resume(slug));
        break;
      case "cost": {
        const s = load(slug);
        s.cost.approx_tokens += Number(rest[0] || 0);
        s.cost.wall_minutes += Number(rest[1] || 0);
        out(save(slug, s, "cost"));
        break;
      }
      case "next":
        out(next(slug));
        break;
      default:
        console.error("usage: state.mjs init|show|list|status|attempt|error|needs-review|resume|cost|next …");
        process.exit(2);
    }
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }));
    process.exit(1);
  }
}
