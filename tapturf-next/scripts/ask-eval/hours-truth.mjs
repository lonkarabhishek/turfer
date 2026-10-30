// node scripts/ask-eval/hours-truth.mjs <hours rows.json> <truth.json>
//
// Adds grade.mjs's hours truth to truth.json: each active turf's week as its
// page reads the hours (lib/ai/openAt.ts weekOf over normaliseOpeningHours,
// compiled to .test-out by npm run test:ask; run that first), and the turfs
// open all day by their row (is_24x7). The rows come from the SELECT in the
// stage notes (eval-howto.md): [{ id, opening_hours, start_time, end_time, is_24x7 }].
// The week is encodeWeek's ("360-1380|...", Monday first), which grade.mjs reads.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const [rowsFile, truthFile] = process.argv.slice(2);
if (!rowsFile || !truthFile) {
  console.error("usage: node hours-truth.mjs <hours rows.json> <truth.json>");
  process.exit(2);
}
const compiled = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.test-out/ask/lib/ai/openAt.js");
if (!fs.existsSync(compiled)) {
  console.error(`${compiled} is missing: run npm run test:ask first (it compiles lib/ai/openAt.ts)`);
  process.exit(2);
}
const { weekOf, encodeWeek } = createRequire(import.meta.url)(compiled);

let rows = JSON.parse(fs.readFileSync(rowsFile, "utf8"));
// The SQL editor's export of the one-column SELECT: [{ "rows": [...] }].
if (rows.length === 1 && Array.isArray(Object.values(rows[0])[0])) rows = Object.values(rows[0])[0];
const hours = {};
const allDay = [];
for (const r of rows) {
  if (r.is_24x7 === true) allDay.push(r.id);
  const w = weekOf(r);
  if (w) hours[r.id] = encodeWeek(w);
}
const truth = JSON.parse(fs.readFileSync(truthFile, "utf8"));
fs.writeFileSync(truthFile, `${JSON.stringify({ ...truth, hours, allDay }, null, 2)}\n`);
console.log(`${Object.keys(hours).length} weeks and ${allDay.length} open all day of ${rows.length} turfs added to ${truthFile}`);
