// Wrapper: the repo path contains a space, so verify_runtime.mjs's CLI guard
// never matches. Import the exported harness and run it ourselves.
//   node run_runtime.mjs <url> [--motion] [--longrun] [--shots dir] [--settle ms]
import { verifyRuntime } from "./verify_runtime.mjs";

function argVal(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : dflt;
}
const url = process.argv[2];
if (!url) {
  console.error("usage: node run_runtime.mjs <url> [--motion] [--longrun]");
  process.exit(2);
}
const report = await verifyRuntime(url, {
  timeout: Number(argVal("--timeout", 60000)),
  settle: Number(argVal("--settle", 25000)),
  shotsDir: argVal("--shots", null),
  motion: process.argv.includes("--motion"),
  longrun: process.argv.includes("--longrun"),
});
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
