#!/usr/bin/env node
/**
 * Writes redirects/turf-ids.csv: one permanent redirect per active turf
 * from its old id URL to its slug URL (/turf/<uuid> -> /turf/<slug>).
 * Nothing reads that file today, and it is not committed.
 *
 * Old id URLs are already handled: app/turf/[id]/page.tsx calls
 * permanentRedirect, so /turf/<uuid> answers 308 to /turf/<slug> on every
 * request (since commit 859cdd4). That costs one function run per old link,
 * which is fine at today's traffic.
 *
 * To serve these at the edge later, before any page renders: once the
 * owner confirms the Vercel plan includes bulk redirects (it can be a paid
 * add-on), run this script, commit redirects/turf-ids.csv, and add
 *   "bulkRedirectsPath": "redirects/turf-ids.csv"
 * to vercel.json. Keep the page's permanentRedirect as the fallback for
 * turfs added after the file was made, and run the script again when turfs
 * are added (slugs never change on rename, see
 * supabase/migrations/20261019_turf_slugs.sql; a slug edited by hand needs
 * its old slug added here too).
 *
 * Read only: one paged select of id and slug, with the public anon key:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... node scripts/turf-redirects.mjs
 *
 * It refuses to write when the read looks short (fewer rows than 90% of
 * the current file), so a failed page never drops redirects. --force
 * writes anyway. The md5 it prints matches this query in the database:
 *   select md5(string_agg(id::text || ',' || slug, E'\n' order by id)) from turfs where is_active and slug is not null;
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.TURF_REDIRECTS_OUT || path.join(ROOT, "redirects", "turf-ids.csv");
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const FORCE = process.argv.includes("--force");
const PAGE = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Slugs are made by the database: lower-case letters, digits and hyphens.
const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;
export const HEADER = "source,destination,permanent,caseSensitive,preserveQueryParams";

/** The CSV for these rows: sorted by id, one permanent, case-insensitive redirect each, query string kept. */
export function toCsv(rows) {
  const lines = rows.map((r) => `/turf/${r.id},/turf/${r.slug},true,false,true`);
  return `${HEADER}\n${lines.join("\n")}\n`;
}

/** Only well-formed rows; a slug that looks like an id would loop. */
export function cleanRows(raw) {
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    const id = String(r?.id ?? "").toLowerCase();
    const slug = String(r?.slug ?? "");
    if (!UUID.test(id) || !SLUG.test(slug) || UUID.test(slug) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, slug });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

async function readAll() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const url = `${URL_BASE}/rest/v1/turfs?select=id,slug&is_active=eq.true&slug=not.is.null&order=id.asc`;
    const res = await fetch(url, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" },
    });
    if (!res.ok && res.status !== 206) throw new Error(`turfs read failed at ${from}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error(`turfs read at ${from} was not a list`);
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function main() {
  if (!URL_BASE || !KEY) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  const rows = cleanRows(await readAll());
  if (rows.length === 0) throw new Error("No active turfs read; nothing written.");
  const before = existsSync(OUT) ? readFileSync(OUT, "utf8").trim().split("\n").length - 1 : 0;
  if (!FORCE && rows.length < before * 0.9) {
    throw new Error(`Read ${rows.length} turfs, the file has ${before}: that looks like a short read. Nothing written (--force to write anyway).`);
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(`${OUT}.tmp`, toCsv(rows));
  renameSync(`${OUT}.tmp`, OUT);
  const md5 = createHash("md5").update(rows.map((r) => `${r.id},${r.slug}`).join("\n")).digest("hex");
  console.log(`Wrote ${rows.length} redirects to ${path.relative(ROOT, OUT)} (was ${before}), md5 ${md5}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
