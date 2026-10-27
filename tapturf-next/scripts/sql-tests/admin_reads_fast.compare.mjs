// Prints one read-only query that runs the live bodies of the four admin reads
// 20261027_admin_reads_fast.sql replaces next to the new ones, on the same
// snapshot, and returns counts only: rows each, rows only the old one returns
// and rows only the new one returns (EXCEPT ALL both ways), and whether the
// rows come back in the same order. No names, numbers or emails leave the
// database. The site owner check is left out (each body after it is run as
// it is), and private.google_accounts() is inlined, so this works before the
// file is applied. Run it as postgres (the SQL editor, or execute_sql) right
// before applying: every line should say only_old = only_new = 0 and
// same_order = true.
// Usage: node scripts/sql-tests/admin_reads_fast.compare.mjs supabase/migrations
import fs from "node:fs";

/** The body of the last `create or replace function <name>(` in src (between its $$). */
export function body(src, name) {
  const at = src.lastIndexOf(`create or replace function ${name}(`);
  if (at < 0) throw new Error(`${name} not found`);
  const open = src.indexOf("$$", at);
  return src.slice(open + 2, src.indexOf("$$", open + 2));
}

/** The query a plpgsql admin read returns: after `return query`, up to its `;` before `end;`. */
export function returned(fnBody) {
  const at = fnBody.indexOf("return query");
  if (at < 0) throw new Error("no return query");
  const end = fnBody.lastIndexOf(";", fnBody.lastIndexOf("end;"));
  return fnBody.slice(at + "return query".length, end).trim();
}

/** Where each replaced body lives today (md5-pinned in the migration's header). */
export const LIVE = {
  "public.admin_ticks": "20261027_verified_tick.sql",
  "public.admin_verified": "20261026_account_links.sql",
  "public.admin_google_unfinished": "20261026_account_links.sql",
  "public.admin_people": "20261026_account_links_reads.sql",
};

/** A query with private.google_accounts() inlined as a subquery whose columns carry the function's names. */
export function inlined(q, fast) {
  const ga = body(fast, "private.google_accounts").trim().replace(/;\s*$/, "");
  return q.split("private.google_accounts()").join(`(select g.* from (${ga}) as g (auth_uid, user_id, via))`);
}

export function compareSql(M) {
  const fast = fs.readFileSync(`${M}/20261027_admin_reads_fast.sql`, "utf8");
  const one = ([name, file]) => {
    const oldQ = returned(body(fs.readFileSync(`${M}/${file}`, "utf8"), name));
    const newQ = inlined(returned(body(fast, name)), fast);
    const ordered = (cte) => `(select md5(string_agg(t.r, '|' order by t.k)) from (select ${cte}::text as r, row_number() over () as k from ${cte}) t)`;
    return `(with o as (
${oldQ}
), n as (
${newQ}
)
select '${name}' as fn,
       (select count(*) from o) as old_rows,
       (select count(*) from n) as new_rows,
       (select count(*) from (select * from o except all select * from n) d) as only_old,
       (select count(*) from (select * from n except all select * from o) d) as only_new,
       ${ordered("o")} is not distinct from ${ordered("n")} as same_order)`;
  };
  // And the shared mapping itself, against private.google_account for every auth user.
  const mapping = `(with n as (${inlined("select * from private.google_accounts()", fast)})
select 'private.google_accounts' as fn,
       (select count(*) from auth.users) as old_rows,
       (select count(*) from n) as new_rows,
       (select count(*) from auth.users a where not exists (
          select 1 from n where n.auth_uid = a.id and n.user_id is not distinct from private.google_account(a.id))) as only_old,
       (select count(*) from n where n.user_id is distinct from private.google_account(n.auth_uid)) as only_new,
       true as same_order)`;
  return [...Object.entries(LIVE).map(one), mapping].join("\nunion all\n") + ";\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [M] = process.argv.slice(2);
  if (!M) throw new Error("usage: admin_reads_fast.compare.mjs <supabase/migrations>");
  process.stdout.write(compareSql(M));
}
