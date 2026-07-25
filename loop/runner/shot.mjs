// Screenshot + console/pageerror probe for a single artwork URL.
//   node shot.mjs <url> <out.png> [waitMs] [--debug N]
// Lives in loop/runner/ so playwright-core resolves.
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { fakeCameraInit } from "./testscene.mjs";

const url = process.argv[2];
const out = process.argv[3] || "shot.png";
const waitMs = Number(process.argv[4] || 9000);
const dbgIdx = process.argv.indexOf("--debug");
const debugView = dbgIdx > 0 ? process.argv[dbgIdx + 1] : null;

function chromiumOptions() {
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  return {
    ...(executablePath ? { executablePath } : { channel: "chrome" }),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  };
}

const browser = await chromium.launch(chromiumOptions());
const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
const errs = [];
const logs = [];
page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`);
});
await page.addInitScript(fakeCameraInit);
await page.goto(url);
let ready = true;
try {
  await page.waitForFunction(() => window.__artReady === true, null, { timeout: 60000 });
} catch {
  ready = false;
}
await page.waitForTimeout(waitMs);
if (debugView !== null) {
  await page.selectOption("#debugView", String(debugView));
  await page.waitForTimeout(1200);
}
await page.evaluate(() => {
  const p = document.getElementById("panel");
  if (p) p.style.display = "none";
  const t = document.getElementById("togglePanel");
  if (t) t.style.display = "none";
  const c = document.getElementById("statusChip");
  if (c) c.style.display = "none";
  const f = document.getElementById("flipCamera");
  if (f) f.style.display = "none";
});
await page.waitForTimeout(300);
await page.screenshot({ path: out });
const stats = await page.evaluate(() => {
  const c = document.getElementById("gl");
  const g = c.getContext("webgl2");
  const px = new Uint8Array(4 * c.width * c.height);
  g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
  let sum = 0, white = 0, dark = 0;
  const n = c.width * c.height;
  for (let i = 0; i < px.length; i += 4) {
    const m = (px[i] + px[i + 1] + px[i + 2]) / 3;
    sum += m;
    if (px[i] > 245 && px[i + 1] > 245 && px[i + 2] > 245) white++;
    if (m < 6) dark++;
  }
  return {
    mean: +(sum / n).toFixed(1),
    whitePct: +((100 * white) / n).toFixed(2),
    darkPct: +((100 * dark) / n).toFixed(2),
    readout: (document.getElementById("readout") || {}).textContent || "",
  };
});
console.log(JSON.stringify({ url, out, ready, stats, errs, logs }, null, 2));
await browser.close();
