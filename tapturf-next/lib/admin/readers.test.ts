import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// The admin pages' reads all go through lib/admin/db.ts (one client per
// request, a limiter, a time budget, settled into Sections), and the admin
// home has no read of its own that could throw it away: these check the
// sources say so, so a new reader can't quietly bring back the 27 Oct
// failure (one throwing read in the page's Promise.all).
// Run from the package root (npm run test:trend).

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const READERS = fs
  .readdirSync(path.join(root, "lib/queries"))
  .filter((f) => /^admin.*\.ts$/.test(f))
  .map((f) => `lib/queries/${f}`);

test("every admin reader reads through lib/admin/db.ts", () => {
  assert.ok(READERS.length >= 9, `found ${READERS.join(", ")}`);
  for (const f of READERS) {
    const src = code(f);
    for (const banned of ["createServerClient(", "createReadOnlyClient(", "fetchAllRows", "cookies()", "from \"next/headers\""]) {
      assert.ok(!src.includes(banned), `${f} uses ${banned}: read through ownerRead/anonRead (lib/admin/db.ts) instead`);
    }
  }
});

test("every Supabase read in the admin readers is aborted at its timeout", () => {
  for (const f of READERS) {
    const src = code(f);
    const reads = (src.match(/(?<!Array)\.(rpc|from)\(/g) ?? []).length;
    const aborted = (src.match(/\.abortSignal\(signal\)/g) ?? []).length;
    assert.ok(aborted >= reads, `${f}: ${reads} reads but ${aborted} .abortSignal(signal)`);
  }
});

test("the admin pages and routes use the request's one client", () => {
  const files = [
    "lib/admin/auth.ts",
    "lib/admin/db.ts",
    "app/admin/page.tsx",
    "app/admin/[view]/page.tsx",
    "app/admin/tools/page.tsx",
    ...fs
      .readdirSync(path.join(root, "app/api/admin"), { recursive: true })
      .map(String)
      .filter((f) => f.endsWith("route.ts"))
      .map((f) => `app/api/admin/${f}`),
  ];
  assert.ok(files.length >= 12);
  for (const f of files) assert.ok(!code(f).includes("createServerClient("), `${f} makes its own Supabase client`);
  assert.match(code("lib/admin/auth.ts"), /requestServerClient\(\)/);
});

test("the admin home only checks the owner; every section reads on its own inside a boundary", () => {
  const page = code("app/admin/page.tsx");
  assert.ok(!/Promise\.all/.test(page), "no Promise.all of reads in the page");
  assert.ok(!/from "@\/lib\/queries\//.test(page), "the page imports no reader");
  const sections = [...read("components/admin/HomeSections.tsx").matchAll(/export async function (\w+Section)\b/g)].map((m) => m[1]);
  assert.ok(sections.length >= 12, `found ${sections.join(", ")}`);
  for (const s of sections) {
    assert.match(page, new RegExp(`<AdminSection[^>]*>\\s*<${s}\\b`), `${s} is inside an <AdminSection> (Suspense and its own error boundary)`);
  }
  assert.match(page, /<AdminSection[^>]*>\s*<LinkRefusals\b/);
});

test("each admin page has its own error.tsx (never the site's 'taking a break' page)", () => {
  for (const f of ["app/admin/error.tsx", "app/admin/[view]/error.tsx", "app/admin/tools/error.tsx"]) {
    const src = read(f);
    assert.match(src, /^"use client";/);
    assert.match(src, /AdminError/);
  }
});
