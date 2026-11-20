import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The home-screen icon (the logo's stadium and ball on white) as a data
 * URL, read once per process from public/: the one picture a share image
 * carries (the game's card, the medals' story), so nothing is fetched to
 * draw it. public/ is served by the CDN and is not in a function's files
 * unless next.config.ts names it (outputFileTracingIncludes) for the
 * route that draws.
 */

let mark: Promise<string> | null = null;

export function appMark(): Promise<string> {
  mark ??= readFile(join(process.cwd(), "public", "apple-icon.png")).then(
    (b) => `data:image/png;base64,${b.toString("base64")}`,
    (e) => {
      mark = null;
      throw e;
    },
  );
  return mark;
}
