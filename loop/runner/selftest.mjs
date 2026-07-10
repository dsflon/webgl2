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
