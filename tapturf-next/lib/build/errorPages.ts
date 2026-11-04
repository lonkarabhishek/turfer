// The pages router's error pages in every app router function on Vercel.
//
// When an app router page fails to render, Next (minimal mode, as Vercel
// runs it) first renders pages/_error (its getInitialProps answers 503 for
// Unavailable, pages/_error.tsx) and then loads pages/500.js and sends that
// page with status 500. Vercel packs each function from Next's trace files
// (.next/server/app/**/*.js.nft.json) and adds _app, _error and _document to
// every function itself, but not the 500 page: it serves 500.html from its
// CDN and leaves pages/500.js out. The function then failed with "Cannot find
// module .../.next/server/pages/500.js" (3 times on 4 Nov) and sent nothing,
// leaving the answer to the platform.
//
// So `npm run build` (scripts/build.ts), after `next build`, adds the error
// pages' modules and the files their own traces list (pages/500.js, its
// chunk, its loadable manifest; _error, _app and _document, which Vercel adds
// anyway) to every app trace. outputFileTracingIncludes in next.config cannot:
// with Turbopack (Next 16.1.6) it adds a project file to every trace, but a
// path under .next/ matches nothing (both measured on 4 Nov), and the 500
// page's chunk has a hashed name no config could list. Only files that exist
// are added (Vercel stats each one, and a missing one fails its build).
//
// No "@/" imports so the build script and the unit tests compile it on their own.

import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** The pages Next loads when a page fails: the 500 page, and _error with _app and _document, which it renders first. */
export const ERROR_PAGES = ["/500", "/_error", "/_app", "/_document"] as const;

export type ErrorPagesIncluded = {
  /** App trace files (one per app page or route handler) that now list the error pages' files. */
  traces: number;
  /** Files the error pages need: their modules (or static .html) and what their traces list. */
  files: number;
  /** Their size: at most what a function grows by (Vercel already adds _error, _app and _document). */
  bytes: number;
  /** Entries added over all traces (0 when the build had already been through this). */
  added: number;
};

type Trace = { version?: number; files: string[] };

const toPosix = (p: string) => p.split(sep).join("/");

const readTrace = (file: string): Trace => {
  const trace = JSON.parse(readFileSync(file, "utf8")) as Trace;
  if (!trace || !Array.isArray(trace.files)) throw new Error(`build: ${file} is not a trace file (no files list)`);
  return trace;
};

/**
 * Absolute paths of every file the error pages need, from the pages manifest
 * of `distDir` (.next): each page's module and the files its .nft.json lists,
 * or a static page's .html. Empty without a pages manifest. Throws when the
 * manifest names a module that is not there, or one without a trace.
 */
export function errorPageFiles(distDir: string): string[] {
  const server = join(distDir, "server");
  const manifestFile = join(server, "pages-manifest.json");
  if (!existsSync(manifestFile)) return [];
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as Record<string, string>;
  const files = new Set<string>();
  for (const page of ERROR_PAGES) {
    const entry = manifest[page];
    if (typeof entry !== "string") continue;
    const modulePath = join(server, entry);
    if (!existsSync(modulePath)) throw new Error(`build: the pages manifest names ${entry} for ${page}, and it is not in ${server}`);
    files.add(modulePath);
    if (entry.endsWith(".html")) continue;
    const traceFile = `${modulePath}.nft.json`;
    if (!existsSync(traceFile)) throw new Error(`build: ${entry} (${page}) has no trace file ${traceFile}`);
    for (const f of readTrace(traceFile).files) {
      const abs = resolve(dirname(modulePath), f);
      if (existsSync(abs)) files.add(abs);
    }
  }
  return [...files].sort();
}

/** Every trace file Vercel reads for the app router (its glob: **\/*.js.nft.json under .next/server/app). */
export function appTraceFiles(distDir: string): string[] {
  const app = join(distDir, "server", "app");
  if (!existsSync(app)) return [];
  return (readdirSync(app, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".js.nft.json"))
    .map((f) => join(app, f))
    .sort();
}

/**
 * Adds every error page file to every app trace in `distDir` (.next), as a
 * path relative to that trace's folder, after what it already lists. Running
 * it again adds nothing.
 */
export function includeErrorPages(distDir: string): ErrorPagesIncluded {
  const files = errorPageFiles(distDir);
  const traces = files.length ? appTraceFiles(distDir) : [];
  let added = 0;
  for (const traceFile of traces) {
    const trace = readTrace(traceFile);
    const listed = new Set(trace.files);
    const more = files.map((f) => toPosix(relative(dirname(traceFile), f))).filter((f) => !listed.has(f));
    if (!more.length) continue;
    added += more.length;
    writeFileSync(`${traceFile}.tmp`, JSON.stringify({ ...trace, files: [...trace.files, ...more] }));
    renameSync(`${traceFile}.tmp`, traceFile);
  }
  return { traces: traces.length, files: files.length, bytes: files.reduce((n, f) => n + statSync(f).size, 0), added };
}
