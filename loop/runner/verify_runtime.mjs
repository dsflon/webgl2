// V1 runtime verification — deterministic Playwright harness, no LLM.
// See loop/DESIGN.md §4 (V1) and loop/runner/README.md.
//
// Usage:
//   node verify_runtime.mjs <url> [--timeout ms] [--settle ms] [--shots dir] [--motion]
//
// --motion: 運動応答チェックを追加する(brief に担当軸「時間」の不変量がある作品用。
//           freeze を外した URL で「動く合成シーンに画面が追従して変化するか」を測る)
//
// The URL should already carry the verification params the artwork supports,
// e.g. ?fakesource=1&freeze=1 (papercraft-cam: ?fakedepth=1&freeze=1).
// Checks: __artReady / pageerror / canvas alive / flicker (frozen) /
// slider sweep / debug views / resize / UI toggle / camera-denied overlay.
//
// Output: JSON report {url, pass, checks:[{id, pass, detail}]}; exit 1 on fail.

import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { fakeCameraInit, deniedCameraInit } from "./testscene.mjs";

function argVal(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : dflt;
}

function chromiumOptions() {
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  return {
    ...(executablePath ? { executablePath } : { channel: "chrome" }),
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  };
}

// Sample a 96×96 block from the canvas center via readPixels
// (requires preserveDrawingBuffer:true — enforced by verify_static).
const SAMPLE_FN = () => {
  const c = document.getElementById("gl");
  const g = c.getContext("webgl2");
  const w = 96;
  const h = 96;
  const x = Math.max(0, (c.width >> 1) - 48);
  const y = Math.max(0, (c.height >> 1) - 48);
  const px = new Uint8Array(4 * w * h);
  g.readPixels(x, y, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
  return Array.from(px);
};

function stats(sample) {
  let sum = 0;
  for (let i = 0; i < sample.length; i += 4) {
    sum += (sample[i] + sample[i + 1] + sample[i + 2]) / 3;
  }
  return sum / (sample.length / 4);
}

function meanAbsDiff(a, b) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum +=
      (Math.abs(a[i] - b[i]) +
        Math.abs(a[i + 1] - b[i + 1]) +
        Math.abs(a[i + 2] - b[i + 2])) /
      3;
    n++;
  }
  return sum / n;
}

// Temporal-invariant support (メタループ #1 — blue-dissolve パイロットからの還元):
// 「動きに反応する」は静止画からは判定できない。決定的な翻訳:
//   frozen(?freeze=1)なら静止する — 既存の flicker チェックが担保
//   unfrozen+動く合成シーンなら画面が変化し続ける — この checkMotion が担保
// 使い方: brief の不変量に担当軸「時間」を含む作品は --motion を付けて実行する。
// 前提: ?fakesource=1 の合成シーンに動く要素が1つ含まれること(制作規約 §4)。
export async function checkMotion(url, opts = {}) {
  const settle = opts.settle ?? 8000;
  const gap = opts.gap ?? 2000;
  // 0.5/255: frozen(=0.000)との分離は十分保ちつつ、低FPS環境(swiftshader)でも
  // 動く合成シーンが確実に超えるマージンを取る
  const threshold = opts.threshold ?? 0.5;
  const timeout = opts.timeout ?? 60000;
  const browser = await chromium.launch(chromiumOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
    await page.addInitScript(fakeCameraInit);
    await page.goto(url);
    await page.waitForFunction(() => window.__artReady === true, null, { timeout });
    await page.waitForTimeout(settle);
    const s1 = await page.evaluate(SAMPLE_FN);
    await page.waitForTimeout(gap);
    const s2 = await page.evaluate(SAMPLE_FN);
    const diff = meanAbsDiff(s1, s2);
    return { pass: diff > threshold, diff, threshold };
  } catch (e) {
    return { pass: false, diff: -1, threshold, error: e.message };
  } finally {
    await browser.close();
  }
}

export async function verifyRuntime(url, opts = {}) {
  const timeout = opts.timeout ?? 60000;
  const settle = opts.settle ?? 25000;
  const shotsDir = opts.shotsDir ?? null;
  if (shotsDir) mkdirSync(shotsDir, { recursive: true });

  const checks = [];
  const add = (id, pass, detail) => checks.push({ id, pass, detail });

  const browser = await chromium.launch(chromiumOptions());
  try {
    // ---- main pass: fake camera ----
    const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.addInitScript(fakeCameraInit);
    await page.goto(url);

    let ready = true;
    try {
      await page.waitForFunction(() => window.__artReady === true, null, { timeout });
    } catch {
      ready = false;
    }
    add("ready", ready, ready ? `__artReady within ${timeout}ms` : `__artReady NOT set within ${timeout}ms — 起動失敗か検証フック未実装`);

    if (ready) {
      // let eased transitions/EMAs converge before measuring stillness
      await page.waitForTimeout(settle);

      const s1 = await page.evaluate(SAMPLE_FN);
      const bright = stats(s1);
      add(
        "alive",
        bright > 8 && bright < 250,
        `canvas center mean=${bright.toFixed(1)} (要 8..250 — 真っ黒/真っ白でない)`,
      );

      await page.waitForTimeout(2500);
      const s2 = await page.evaluate(SAMPLE_FN);
      const diff = meanAbsDiff(s1, s2);
      add(
        "flicker",
        diff < 2.0,
        `frozen-scene mean|Δ|=${diff.toFixed(3)}/255 over 2.5s (要 <2.0。?freeze=1 で計測すること)`,
      );
      if (shotsDir) await page.screenshot({ path: `${shotsDir}/final.png` });

      // slider sweep: min → max → default for every range input
      const sliderIds = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#panel input[type="range"]')).map((el) => el.id),
      );
      for (const id of sliderIds) {
        for (const pos of ["min", "max", "default"]) {
          await page.evaluate(
            ([id, pos]) => {
              const el = document.getElementById(id);
              el.value = pos === "min" ? el.min : pos === "max" ? el.max : el.defaultValue;
              el.dispatchEvent(new Event("input"));
            },
            [id, pos],
          );
          await page.waitForTimeout(150);
        }
      }
      const afterSweep = stats(await page.evaluate(SAMPLE_FN));
      add(
        "sliders",
        sliderIds.length >= 6 && afterSweep > 8,
        `${sliderIds.length}本を両端掃引(要6本以上)、掃引後 mean=${afterSweep.toFixed(1)}`,
      );

      // debug views (optional convention)
      const hasDebug = await page.evaluate(() => !!document.getElementById("debugView"));
      if (hasDebug) {
        const n = await page.evaluate(() => document.getElementById("debugView").options.length);
        for (let d = 0; d < n; d++) {
          await page.selectOption("#debugView", String(d));
          await page.waitForTimeout(200);
        }
        await page.selectOption("#debugView", "0");
        add("debugViews", true, `${n} モードを巡回`);
      }

      // resize twice
      await page.setViewportSize({ width: 560, height: 860 });
      await page.waitForTimeout(700);
      await page.setViewportSize({ width: 1200, height: 700 });
      await page.waitForTimeout(700);
      add("resize", stats(await page.evaluate(SAMPLE_FN)) > 8, "2回のリサイズ後もキャンバス生存");

      // UI toggle
      await page.click("#togglePanel");
      await page.waitForTimeout(400);
      const collapsed = await page.evaluate(() =>
        document.getElementById("panel").classList.contains("collapsed"),
      );
      await page.click("#togglePanel");
      add("uiToggle", collapsed, "HIDE UI で .collapsed が付く");
    }

    add(
      "pageerror",
      pageErrors.length === 0,
      pageErrors.length ? `pageerror ${pageErrors.length}件: ${pageErrors[0]}` : "pageerror 0件",
    );
    await page.close();

    // ---- camera-denied pass ----
    const page2 = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page2.addInitScript(deniedCameraInit);
    await page2.goto(url);
    await page2.waitForTimeout(2500);
    const denied = await page2.evaluate(() => ({
      shown: !document.getElementById("overlay").classList.contains("hidden"),
      title: document.getElementById("overlayTitle").textContent,
      retry: !document.getElementById("retryCamera").hidden,
    }));
    add(
      "cameraDenied",
      denied.shown && /PERMISSION/i.test(denied.title) && denied.retry,
      `overlay=${denied.shown} title="${denied.title}" retry=${denied.retry}`,
    );
    await page2.close();
  } finally {
    await browser.close();
  }

  // Motion-response check (opt-in): freeze を外した URL で実施
  if (opts.motion) {
    const motionUrl = url
      .replace(/([?&])freeze=1&?/, "$1")
      .replace(/[?&]$/, "");
    const m = await checkMotion(motionUrl, { timeout: opts.timeout });
    checks.push({
      id: "motionResponse",
      pass: m.pass,
      detail: m.error
        ? `checkMotion failed: ${m.error}`
        : `unfrozen mean|Δ|=${m.diff.toFixed(3)}/255 over 2s (要 >${m.threshold} — 動く合成シーンに画面が追従)`,
    });
  }

  return { url, pass: checks.every((c) => c.pass), checks };
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  if (!url) {
    console.error("usage: node verify_runtime.mjs <url> [--timeout ms] [--settle ms] [--shots dir]");
    process.exit(2);
  }
  const report = await verifyRuntime(url, {
    timeout: Number(argVal("--timeout", 60000)),
    settle: Number(argVal("--settle", 25000)),
    shotsDir: argVal("--shots", null),
    motion: process.argv.includes("--motion"),
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
}
