// Phase 1 acceptance test (loop/IMPLEMENTATION_PLAN.md):
//   A. fixture passes verify_static with 0 errors
//   B. broken variants yield the EXPECTED field-level errors/warnings
//   C. fixture passes verify_runtime end-to-end
//   D. a shader-broken variant fails verify_runtime (ready timeout)
//
// Usage: node selftest.mjs [--skip-runtime]
// Serves the repo root itself (no external server needed). Broken variants
// are written to .selftest_tmp/ (gitignored) so the runtime harness can
// load them over HTTP.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyStatic } from "./verify_static.mjs";
import { verifyRuntime } from "./verify_runtime.mjs";

const RUNNER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(RUNNER_DIR, "..", "..");
const FIXTURE = join(REPO_ROOT, "fable5_papercraft-cam.html");
const TMP = join(RUNNER_DIR, ".selftest_tmp");
const PORT = 8917;

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const source = readFileSync(FIXTURE, "utf8");

// ---------- A. fixture passes static lint ----------
{
  const r = verifyStatic(source);
  check(
    "A fixture static: 0 errors",
    r.summary.errors === 0,
    r.summary.errors
      ? r.findings
          .filter((f) => f.severity === "error")
          .map((f) => f.rule)
          .join(",")
      : `warnings=${r.summary.warnings}`,
  );
}

// ---------- B. broken variants yield expected field-level findings ----------
function expectFinding(name, mutated, rule, severity) {
  const r = verifyStatic(mutated);
  const hit = r.findings.find((f) => f.rule === rule && f.severity === severity);
  check(
    `B ${name} → ${rule}(${severity})`,
    !!hit,
    hit ? `"${hit.message}" hint=${hit.hint ? "あり" : "なし"}` : "検出されず",
  );
  if (hit && !hit.hint) failures++;
}

expectFinding(
  "header pipeline section removed",
  source.replace(/パイプライン/g, "工程"),
  "header.pipeline",
  "error",
);
expectFinding(
  "preserveDrawingBuffer disabled",
  source.replace("preserveDrawingBuffer: true", "preserveDrawingBuffer: false"),
  "gl.preserveDrawingBuffer",
  "error",
);
expectFinding(
  "GLSL reserved word as identifier",
  source.replace("float acc = 0.0;", "float sample = 0.0; float acc = 0.0;"),
  "glsl.reserved_word",
  "error",
);
expectFinding(
  "required id removed",
  source.replace('id="readout"', 'id="readout2"'),
  "dom.required_id",
  "error",
);
expectFinding(
  "disallowed external URL",
  source.replace("</title>", '</title><script src="https://unpkg.com/three"></script>'),
  "deps.external_url",
  "error",
);
expectFinding(
  "uTime mixed into a hash seed",
  source.replace("hash12(gl_FragCoord.xy)", "hash12(gl_FragCoord.xy + uTime)"),
  "seed.utime_in_hash",
  "warning",
);
expectFinding(
  "__artReady hook removed",
  source.replace("window.__artReady = true;", ""),
  "hook.artReady",
  "error",
);

// ---------- E. order lint (Phase 2) ----------
{
  const orderSrc = readFileSync(
    join(REPO_ROOT, "prompts", "fable5_papercraft-cam_order.md"),
    "utf8",
  );
  const { verifyOrder } = await import("./verify_order.mjs");

  const legacy = verifyOrder(orderSrc, { legacy: true });
  check(
    "E order fixture (--legacy): 0 errors",
    legacy.summary.errors === 0,
    legacy.findings.map((f) => f.rule).join(",") || "clean",
  );
  const strict = verifyOrder(orderSrc);
  check(
    "E order fixture (strict): only order.hooks fails",
    strict.summary.errors === 1 && strict.findings[0].rule === "order.hooks",
    strict.findings.map((f) => f.rule).join(","),
  );
  const noInv = verifyOrder(orderSrc.replaceAll("視覚的不変量", "特徴"));
  check(
    "E order without invariant table → order.invariant_table",
    noInv.findings.some((f) => f.rule === "order.invariant_table"),
  );
  const fewSliders = verifyOrder(
    orderSrc
      .split("\n")
      .filter(
        (l) =>
          !/^\| (depthRange|depthSmooth|cutSmooth|edgeLight|flatten) /.test(l),
      )
      .join("\n"),
  );
  check(
    "E order with 5 sliders → order.sliders",
    fewSliders.findings.some((f) => f.rule === "order.sliders" && /5 本/.test(f.message)),
  );
}

// ---------- F. brief / review schemas (Phase 2) ----------
const validBrief = {
  slug: "papercraft-cam",
  theme: "多層ペーパーカットのジオラマ",
  references: [
    {
      type: "image",
      description:
        "深いティール〜緑の限定パレットの多層ペーパーカット。手前ほど濃く奥ほど淡い",
    },
  ],
  signals: {
    survive: ["形態(シルエット)", "奥行きの順序"],
    replaced: ["色(パレットへ写像)", "テクスチャ(紙へ)"],
  },
  vocabulary: ["quantile", "EMA", "SDF", "Kuwahara", "split toning", "cell-hash"],
  invariants: [
    { id: 1, invariant: "空間が4〜6枚の平面レイヤーに離散化され中間深度が存在しない", axis: "場/知覚", principle: "単眼深度を quantile しきい値で量子化し EMA で安定化", if_missing: "ただの写真になる" },
    { id: 2, invariant: "輪郭がハサミで切った紙で、切り口ハイライトの帯が走る", axis: "マーク", principle: "深度場のぼかし再閾値化と擬似 SDF 境界帯", if_missing: "写真の切り抜きコラージュ" },
    { id: 3, invariant: "レイヤー内部はフラットな紙の色に置き換わっている", axis: "色", principle: "Kuwahara 平坦化と深度ゾーン別 split toning", if_missing: "ポスタライズ写真" },
    { id: 4, invariant: "レイヤー間の柔らかいドロップシャドウが紙の厚みを作る", axis: "物質", principle: "EMA 済み深度場を広くぼかしオフセット参照して乗算", if_missing: "平面的で立体感が消える" },
    { id: 5, invariant: "微小パララックスでレイヤーが別速度に動き立体と知覚される", axis: "時間/知覚", principle: "quantile 層ごとのレイヤー別UVシフト", if_missing: "1枚絵と区別がつかない" },
    { id: 6, invariant: "紙の繊維グレインとレイヤーごとの色ムラが物質感を作る", axis: "物質", principle: "cell-hash 由来の静的グレイン(時間シード禁止)", if_missing: "プラスチックに見える" },
  ],
  priority: [1, 2, 4, 3, 5, 6],
};
{
  const { verifyBrief } = await import("./verify_brief.mjs");
  const ok = verifyBrief(validBrief);
  check("F valid brief: 0 errors", ok.summary.errors === 0, ok.findings.map((f) => f.rule).join(","));

  const two = verifyBrief({ ...validBrief, invariants: validBrief.invariants.slice(0, 2), priority: [1, 2] });
  check(
    "F brief with 2 invariants → schema.minItems",
    two.findings.some((f) => f.rule === "schema.minItems" && f.path.includes("invariants")),
    two.findings.map((f) => `${f.rule}@${f.path}`).join(","),
  );
  const badAxis = structuredClone(validBrief);
  badAxis.invariants[0].axis = "雰囲気";
  check(
    "F brief with axis=雰囲気 → schema.pattern",
    verifyBrief(badAxis).findings.some((f) => f.rule === "schema.pattern"),
  );
  const badPri = verifyBrief({ ...validBrief, priority: [1, 2, 3] });
  check(
    "F brief priority mismatch → semantic.priority_mismatch",
    badPri.findings.some((f) => f.rule === "semantic.priority_mismatch"),
  );
  const noVocab = structuredClone(validBrief);
  noVocab.invariants[1].principle = "輪郭をなめらかにして紙らしく見せる";
  check(
    "F brief principle without vocab → semantic.principle_without_vocab",
    verifyBrief(noVocab).findings.some((f) => f.rule === "semantic.principle_without_vocab"),
  );
}
{
  const { verifyReview } = await import("./verify_review.mjs");
  const validReview = {
    artifact: { file: "fable5_papercraft-cam.html", commit: "abc1234" },
    stance: "reject-seeking",
    scores: validBrief.invariants.map((inv) => ({
      invariant_id: inv.id,
      score: 4,
      evidence: "final.png と等倍クロップで該当構造の存在と滑らかさを確認した",
    })),
    common: { style_holds: 4, subject_readable: 5, artifact_free: 4 },
    verdict: "pass",
    summary: "全不変量が構造として確認でき、等倍でも誤魔化しが見られない",
  };
  const ok = verifyReview(validReview, validBrief);
  check("F valid review: 0 errors", ok.summary.errors === 0, ok.findings.map((f) => `${f.rule}@${f.path}`).join(","));

  const low = structuredClone(validReview);
  low.scores[0].score = 3; // fix_instructions が無い → schema の if/then で required 違反
  check(
    "F review score<4 without fix_instructions → schema.required",
    verifyReview(low, validBrief).findings.some((f) => f.rule === "schema.required"),
  );
  const inflated = structuredClone(validReview);
  inflated.scores[0].score = 3;
  inflated.scores[0].fix_instructions = ["切り口帯の幅を+30%し、ハイライト彩度を落とす"];
  check(
    "F review verdict=pass with score 3 → semantic.verdict_mismatch",
    verifyReview(inflated, validBrief).findings.some((f) => f.rule === "semantic.verdict_mismatch"),
  );
  const partial = structuredClone(validReview);
  partial.scores = partial.scores.slice(0, 5);
  check(
    "F review missing an invariant → semantic.invariant_coverage",
    verifyReview(partial, validBrief).findings.some((f) => f.rule === "semantic.invariant_coverage"),
  );
}

// ---------- G. state machine + mock two-path + resume (Phase 3) ----------
{
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  process.env.ART_LOOP_STATE_DIR = join(TMP, "state");
  const st = await import("./state.mjs");

  // モック両経路(指南書 Step 6): 1回目は壊れた出力 → 2回目に合格
  st.init("mock-a", "モックテーマA");
  const gen = [source.replace(/パイプライン/g, "工程"), source]; // attempt1=broken, attempt2=fixed
  let status = null;
  for (;;) {
    const a = st.attempt("mock-a", "implement");
    if (a.exceeded) {
      st.needsReview("mock-a", "implement", "上限超過(モック)");
      status = "needs_review";
      break;
    }
    const r = verifyStatic(gen[Math.min(a.attempts - 1, gen.length - 1)]);
    if (r.summary.errors === 0) {
      status = "implemented";
      break;
    }
    writeFileSync(join(TMP, "errors.json"), JSON.stringify(r.findings));
    const s = st.load("mock-a");
    s.last_error = r.findings;
    st.save("mock-a", s, "error");
  }
  const a = st.load("mock-a");
  check(
    "G mock repair loop: 2回目に合格",
    status === "implemented" && a.attempts.implement === 2 && Array.isArray(a.last_error),
    `attempts=${a.attempts.implement}, last_error=${a.last_error?.length}件保存`,
  );

  // 上限超過 → needs_review 経路(常に壊れた出力)
  st.init("mock-b", "モックテーマB");
  let exceeded = false;
  for (;;) {
    const t = st.attempt("mock-b", "implement");
    if (t.exceeded) {
      st.needsReview("mock-b", "implement", "3回で収束せず。仮説: ヘッダ節の指示が曖昧");
      exceeded = true;
      break;
    }
    // 常に不合格(修正しないモック)
  }
  const b = st.load("mock-b");
  check(
    "G mock limit path: 上限超過→needs_review(仮説付き)",
    exceeded && b.status === "needs_review" && b.requires_human && /仮説/.test(b.blocked_reason),
    `attempts=${b.attempts.implement}(limit=${st.LIMITS.implement}), reason="${b.blocked_reason}"`,
  );
  check(
    "G needs_review → next は blocked+resume_stage",
    (() => {
      const n = st.next("mock-b");
      return n.blocked && n.next === "implement";
    })(),
  );
  st.resume("mock-b");
  const b2 = st.load("mock-b");
  check(
    "G resume: ステージ入口状態へ戻り attempts リセット",
    b2.status === "ordered" && b2.attempts.implement === 0 && !b2.requires_human,
  );

  // 中断・再開: S3(runtime)完了で打ち切り → 再実行は S4(aesthetic)から
  st.init("mock-c", "モックテーマC");
  const c = st.load("mock-c");
  c.status = "runtime_ok";
  st.save("mock-c", c, "simulate-interrupt");
  check(
    "G interruption: runtime_ok からの再開は aesthetic",
    st.next("mock-c").next === "aesthetic",
  );

  // スキーマ違反の書き込みは拒否される
  let rejected = false;
  try {
    const bad = st.load("mock-c");
    bad.status = "bogus";
    st.save("mock-c", bad, "invalid");
  } catch (e) {
    rejected = /schema/.test(e.message);
  }
  check("G invalid state write is rejected by schema", rejected);

  // コスト記録
  const before = st.load("mock-c").cost.approx_tokens;
  const cc = st.load("mock-c");
  cc.cost.approx_tokens += 12000;
  cc.cost.wall_minutes += 4.5;
  st.save("mock-c", cc, "cost");
  check("G cost recording", st.load("mock-c").cost.approx_tokens === before + 12000);
}

// ---------- C & D. runtime ----------
if (!process.argv.includes("--skip-runtime")) {
  // static file server over the repo root
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
  const server = createServer((req, res) => {
    const path = normalize(join(REPO_ROOT, decodeURIComponent(req.url.split("?")[0])));
    if (!path.startsWith(REPO_ROOT) || !existsSync(path)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
    res.end(readFileSync(path));
  });
  await new Promise((r) => server.listen(PORT, r));

  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  // C. fixture end-to-end (fakedepth: offline, freeze: deterministic stills)
  {
    const r = await verifyRuntime(
      `http://localhost:${PORT}/fable5_papercraft-cam.html?fakedepth=1&freeze=1`,
      { timeout: 45000 },
    );
    check(
      "C fixture runtime: all checks pass",
      r.pass,
      r.checks.map((c) => `${c.pass ? "✓" : "✗"}${c.id}`).join(" "),
    );
    for (const c of r.checks) if (!c.pass) console.log(`     ${c.id}: ${c.detail}`);
  }

  // H. motion-response check (時間的不変量の V1 格上げ — メタループ #1)
  //    fixture: fable5_blue-dissolve.html(動く合成シーンを持つ承認済み作品)
  {
    const { checkMotion } = await import("./verify_runtime.mjs");
    const base = `http://localhost:${PORT}/fable5_blue-dissolve.html?fakesource=1`;
    const live = await checkMotion(base, { settle: 8000, gap: 2000 });
    check(
      "H motion: unfrozen moving-source scene keeps changing",
      live.pass,
      `mean|Δ|=${live.diff.toFixed(3)}/255 (要 >${live.threshold})`,
    );
    const frozen = await checkMotion(`${base}&freeze=1`, { settle: 4000, gap: 2000 });
    check(
      "H motion: frozen scene must fail the motion check",
      !frozen.pass,
      `mean|Δ|=${frozen.diff.toFixed(3)}/255`,
    );
  }

  // D. shader-broken variant must fail (boot error → no __artReady)
  {
    writeFileSync(
      join(TMP, "broken_shader.html"),
      source.replace("fragColor = vec4(col, 1.0);", "fragColor = vec4(col, 1.0)"),
    );
    const r = await verifyRuntime(
      `http://localhost:${PORT}/loop/runner/.selftest_tmp/broken_shader.html?fakedepth=1&freeze=1`,
      { timeout: 12000, settle: 1000 },
    );
    const readyCheck = r.checks.find((c) => c.id === "ready");
    check("D broken shader runtime: fails on ready", !r.pass && !readyCheck.pass, readyCheck.detail);
  }

  server.close();
}

console.log(failures === 0 ? "\nSELFTEST OK" : `\nSELFTEST FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
