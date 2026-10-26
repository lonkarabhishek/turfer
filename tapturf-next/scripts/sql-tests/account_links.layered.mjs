// Runs the existing SQL checks of the functions that 20261026_account_links.sql
// and 20261026_account_links_reads.sql replace, with those two files applied
// right after each check's own migration file (layered/pglite.mjs), so every
// later assertion of the check runs against the new bodies. Assertions are
// soft (layered/softassert.mjs): the run passes only when the assertions that
// fail are exactly the changes the account-links design makes on purpose
// (EXPECTED below), each with its reason. PGlite only, never a real database.
// Run (after `npx tsc -p tsconfig.test-account.json`, which contact_email needs):
//   PGLITE=<pglite dist/index.js> node scripts/sql-tests/account_links.layered.mjs supabase/migrations
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "../..");
const M = path.resolve(process.argv[2] ?? "supabase/migrations");
const real = process.env.PGLITE;
if (!real) throw new Error("set PGLITE to PGlite's dist/index.js");
const m = (f) => path.join(M, f);

// check -> [its own file the layer goes after, its arguments, the assertions that change on purpose]
const CHECKS = {
  accounts_fixes: [m("20261021_accounts_fixes.sql"), [m("20261021_accounts_usernames.sql"), m("20261021_accounts_fixes.sql")], {
    "no row": "account_resolve's 'new' now also says whether the number left an account lately (was_used)",
  }],
  admin_verified: [m("20261025_admin_verified.sql"), [m("20261025_admin_verified.sql")], {}],
  auth_mirror: [m("20261025_auth_mirror_google_only.sql"), [m("20261025_auth_mirror_google_only.sql")], {
    "a Google sign-up gets its account, without the metadata phone":
      "the auth.users trigger makes no account any more; account_resolve with create does, knowing about links",
  }],
  claims_account: [m("20261025_claims_account.sql"),
    [m("20261019_mytapturf.sql"), m("20261019_mytapturf_claims.sql"), m("20261021_phone_identity_exact_india.sql"), m("20261025_claims_account.sql")], {}],
  contact_email: [m("20261025_contact_email.sql"), [m("20261025_contact_email.sql")], {
    "phone accounts with no email only": "the typed email ask is gone: ask_email is false for every account",
    "a phone account with no email is asked": "the typed email ask is gone: ask_email is false (ask_google replaces it)",
  }],
  user_cities: [m("20261022_people_fixes.sql"),
    [m("20261022_admin_user_details.sql"), m("20261022_user_cities.sql"), m("20261022_people_fixes.sql")], {}],
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "account-links-layered-"));
let bad = 0;
for (const [name, [after, args, expected]] of Object.entries(CHECKS)) {
  // The check as it is, with soft assertions and its relative imports made absolute.
  const src = fs.readFileSync(path.join(here, `${name}.check.mjs`), "utf8")
    .replace(`import assert from "node:assert/strict";`, `import assert from ${JSON.stringify(path.join(here, "layered/softassert.mjs"))};`)
    .replaceAll(`"../../`, `"${app}/`);
  const copy = path.join(tmp, `${name}.check.mjs`);
  fs.writeFileSync(copy, src);
  let out;
  try {
    out = execFileSync(process.execPath, [copy, ...args], {
      cwd: app,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PGLITE: path.join(here, "layered/pglite.mjs"), PGLITE_REAL: real, LAYER_AFTER: after, LAYER_MIG: M },
    });
  } catch (e) {
    console.log(`${name}: did not finish: ${String(e.stderr || e.message).split("\n").find((l) => /error/i.test(l)) ?? "error"}`);
    bad++;
    continue;
  }
  const applied = Number(/^LAYERED APPLIED\t(\d+)$/m.exec(out)?.[1] ?? 0);
  const failed = [...out.matchAll(/^LAYERED FAILURE\t([^\t]*)\t([^\t]*)\t(.*)$/gm)].map((x) => ({ what: x[1], actual: x[2], expected: x[3] }));
  const unexpected = failed.filter((f) => !(f.what in expected));
  const missing = Object.keys(expected).filter((w) => !failed.some((f) => f.what === w));
  const total = /(\d+) checks passed/.exec(out)?.[1] ?? "?";
  if (applied < 1 || unexpected.length || missing.length) bad++;
  console.log(`${name}: ${total} assertions, account-links applied ${applied}x after ${path.basename(after)}; ` +
    `${failed.length - unexpected.length} changed on purpose, ${unexpected.length} unexpected, ${missing.length} expected changes missing`);
  for (const f of failed) console.log(`  ${f.what in expected ? "on purpose" : "UNEXPECTED"}: ${f.what}${f.what in expected ? ` (${expected[f.what]})` : `: got ${f.actual}, wanted ${f.expected}`}`);
  for (const w of missing) console.log(`  MISSING: expected "${w}" to change (${expected[w]})`);
}
fs.rmSync(tmp, { recursive: true, force: true });
if (bad) {
  console.log(`account_links.layered: ${bad} check(s) differ from what the account-links migrations should change`);
  process.exit(1);
}
console.log("account_links.layered: the existing checks keep every behaviour the account-links migrations do not change on purpose");
