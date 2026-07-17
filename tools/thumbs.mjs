// tools/thumbs.mjs — gallery thumbnail capture (docs/gallery_plan.md §4)
//
// Usage:
//   node tools/thumbs.mjs            # capture all works listed in works.json
//   node tools/thumbs.mjs slug ...   # capture only the given slugs
//
// Reads per-work startup recipes from tools/thumbs.recipes.json.
// Serves nothing itself — expects http://localhost:8888 (repo root).
// Output: thumbs/<slug>.jpg (800x500, JPEG q82). Files present in
// thumbs/manual/<slug>.jpg are treated as hand-made overrides and copied
// instead of captured (the script never overwrites manual art).

import { readFileSync, existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "loop", "runner", "package.json"));
const { chromium } = require("playwright-core");

const BASE = process.env.THUMBS_BASE || "http://localhost:8888";
const OUT_DIR = join(ROOT, "thumbs");
const MANUAL_DIR = join(OUT_DIR, "manual");
const W = 800;
const H = 500;
const JPEG_QUALITY = 82;

// getUserMedia mock: video = the loop-runner synthetic scene (a person-ish
// figure so detection-driven works have a subject), audio = a quiet
// oscillator so mic-driven works get a live-looking signal.
function mediaMockInit() {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const x = canvas.getContext("2d");
  let t = 0;
  function draw() {
    t += 1 / 60;
    const sky = x.createLinearGradient(0, 0, 0, 400);
    sky.addColorStop(0, "#a9c4d8");
    sky.addColorStop(1, "#e6e0cf");
    x.fillStyle = sky;
    x.fillRect(0, 0, 1280, 400);
    x.fillStyle = "#6f7f6a";
    x.fillRect(0, 400, 1280, 320);
    // simple bust: dark sweater + head, slight sway so motion fields see life
    const cx = 640 + Math.sin(t * 0.6) * 14;
    x.fillStyle = "#2e2a33";
    x.beginPath();
    x.ellipse(cx, 640, 250, 190, 0, Math.PI, 0);
    x.fill();
    x.fillStyle = "#e3b491";
    x.beginPath();
    x.ellipse(cx, 400, 118, 148, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#3a2e26";
    x.beginPath();
    x.ellipse(cx, 320, 126, 86, 0, Math.PI, 0, true);
    x.fill();
    x.fillStyle = "#2a2118";
    x.beginPath();
    x.ellipse(cx - 42, 392, 13, 9, 0, 0, Math.PI * 2);
    x.ellipse(cx + 42, 392, 13, 9, 0, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = "#8e5b41";
    x.lineWidth = 7;
    x.beginPath();
    x.moveTo(cx - 26, 478);
    x.quadraticCurveTo(cx, 494, cx + 26, 478);
    x.stroke();
    requestAnimationFrame(draw);
  }
  draw();

  navigator.mediaDevices.getUserMedia = async (constraints = {}) => {
    const stream = canvas.captureStream(30);
    if (constraints.audio) {
      const ac = new AudioContext();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      gain.gain.value = 0.18;
      osc.frequency.value = 180;
      const dst = ac.createMediaStreamDestination();
      osc.connect(gain).connect(dst);
      osc.start();
      for (const track of dst.stream.getAudioTracks()) stream.addTrack(track);
    }
    return stream;
  };
}

async function captureOne(browser, work, recipe) {
  const manual = join(MANUAL_DIR, `${work.slug}.jpg`);
  const out = join(OUT_DIR, `${work.slug}.jpg`);
  if (existsSync(manual)) {
    copyFileSync(manual, out);
    return { slug: work.slug, mode: "manual", bytes: statSync(out).size };
  }

  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 120)));
  await page.addInitScript(mediaMockInit);

  const q = recipe.query ? `?${recipe.query}` : "";
  await page.goto(`${BASE}/${work.file}${q}`, { waitUntil: "load", timeout: 45000 });

  for (const sel of recipe.click || []) {
    await page.locator(sel).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  for (const key of recipe.keys || []) {
    await page.keyboard.press(key).catch(() => {});
    await page.waitForTimeout(250);
  }
  if (recipe.readyFlag) {
    await page
      .waitForFunction(() => window.__artReady === true, null, { timeout: 30000 })
      .catch(() => {});
  }
  await page.waitForTimeout(recipe.warmMs ?? 5000);
  // hide UI chrome via JS click (bypasses actionability checks — panels may
  // overlap the canvas or animate, which makes locator clicks flaky)
  for (const sel of recipe.hide || []) {
    await page
      .evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, sel)
      .catch(() => {});
  }
  if (recipe.hide && recipe.hide.length) await page.waitForTimeout(600);
  // last-resort chrome removal: inject CSS when a work has no reliable
  // close/toggle control (thumbnails only — the live page is untouched)
  if (recipe.hideCss) {
    await page.addStyleTag({ content: recipe.hideCss }).catch(() => {});
    await page.waitForTimeout(200);
  }

  await page.screenshot({ path: out, type: "jpeg", quality: JPEG_QUALITY });
  await page.close();
  return {
    slug: work.slug,
    mode: "auto",
    bytes: statSync(out).size,
    errors: pageErrors.length ? pageErrors.slice(0, 2) : undefined,
  };
}

const works = JSON.parse(readFileSync(join(ROOT, "works.json"), "utf8"));
const recipes = JSON.parse(readFileSync(join(ROOT, "tools", "thumbs.recipes.json"), "utf8"));
const only = process.argv.slice(2);
const targets = only.length ? works.filter((w) => only.includes(w.slug)) : works;

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(MANUAL_DIR, { recursive: true });

const exe =
  process.env.CHROMIUM_PATH ||
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const results = [];
for (const work of targets) {
  const recipe = recipes[work.slug] || {};
  try {
    const r = await captureOne(browser, work, recipe);
    results.push(r);
    console.log(
      `${r.mode === "manual" ? "M" : "·"} ${work.slug}  ${(r.bytes / 1024).toFixed(0)}KB` +
        (r.errors ? `  pageerror: ${r.errors.join(" | ")}` : ""),
    );
  } catch (e) {
    results.push({ slug: work.slug, mode: "FAIL", error: e.message });
    console.log(`✗ ${work.slug}  FAIL: ${e.message.slice(0, 100)}`);
  }
}
await browser.close();

const total = results.reduce((s, r) => s + (r.bytes || 0), 0);
console.log(
  `\n${results.filter((r) => r.mode !== "FAIL").length}/${targets.length} captured, ` +
    `total ${(total / 1024 / 1024).toFixed(2)}MB`,
);
process.exit(results.some((r) => r.mode === "FAIL") ? 1 : 0);
