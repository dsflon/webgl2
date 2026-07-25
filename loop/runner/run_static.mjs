// Wrapper: the repo path contains a space, so verify_static.mjs's CLI guard
// (import.meta.url === `file://${process.argv[1]}`) never matches. Import the
// exported checker and run it ourselves.
import { readFileSync } from "node:fs";
import { verifyStatic } from "./verify_static.mjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node run_static.mjs <artwork.html>");
  process.exit(2);
}
const report = { file, ...verifyStatic(readFileSync(file, "utf8")) };
console.log(JSON.stringify(report, null, 2));
process.exit(report.summary.errors > 0 ? 1 : 0);
