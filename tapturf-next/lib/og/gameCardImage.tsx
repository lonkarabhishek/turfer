import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getGameByIdServer } from "@/lib/queries/games.server";
import {
  GAME_CARD_PADDING,
  GAME_CARD_SHAPES,
  cardTitleSize,
  gameCardFacts,
  gameCardPath,
  gameCardVersion,
  isGameCardShape,
  isGameId,
  type GameCardFacts,
  type GameCardShape,
} from "./gameCard";

/**
 * GET /api/og/game/<id>[/4x3|/1x1]?v=<version>: a game's share card as a
 * PNG (what it says: lib/og/gameCard.ts), in the style of the blog cards
 * (app/api/og/blog/[slug]): TapTurf teal, the app icon, Noto Sans.
 *
 * - Nothing third-party: text only in the font next/og bundles (every
 *   line is made drawable by ogText first, so it never fetches a font or
 *   an emoji), the icon read from public/ (next.config.ts traces it).
 * - Caching: a URL whose version is the game's current one gets its
 *   picture, kept a day by the CDN (that URL never shows anything else).
 *   Any other URL of a real game (an older version, none, another query)
 *   is a 307 to the current one, kept a minute, so a share preview or
 *   Google following an old page reaches today's card. Unknown game: 404,
 *   a minute; not a game id or shape: 404, a day.
 * - Under /api, so proxy.ts never runs for it; robots.txt allows it.
 */

let mark: Promise<string> | null = null;

/** The home-screen icon (the logo's stadium and ball on white), read once per process. */
function appMark(): Promise<string> {
  mark ??= readFile(join(process.cwd(), "public", "apple-icon.png")).then(
    (b) => `data:image/png;base64,${b.toString("base64")}`,
    (e) => {
      mark = null;
      throw e;
    },
  );
  return mark;
}

const TEAL = "#00A699";
const TEAL_DARK = "#00756C";

/** The card itself: brand and sport on top, the venue and its place, then the day and time and the spots. */
function Card({ f, shape, icon }: { f: GameCardFacts; shape: GameCardShape; icon: string }) {
  const k = shape === "1x1" ? 1.2 : shape === "4x3" ? 1.1 : 1;
  const px = (n: number) => Math.round(n * k);
  const open = f.spots.kind === "open";
  const pad = `${GAME_CARD_PADDING[shape][0]}px ${GAME_CARD_PADDING[shape][1]}px`;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: pad,
        background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DARK} 100%)`,
        color: "#FFFFFF",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" width={px(64)} height={px(64)} style={{ borderRadius: px(14) }} />
        <div style={{ marginLeft: px(20), fontSize: px(38), letterSpacing: -0.5 }}>TapTurf</div>
        <div
          style={{
            marginLeft: "auto",
            fontSize: px(24),
            letterSpacing: 3,
            padding: `${px(10)}px ${px(22)}px`,
            borderRadius: 999,
            border: "2px solid rgba(255,255,255,0.55)",
          }}
        >
          {/* Already uppercase and drawable (gameCardFacts): no textTransform, whose capitals could be ones the font lacks. */}
          {f.pill}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: cardTitleSize(f.title, shape), lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 1056, wordBreak: "break-word" }}>
          {f.title}
        </div>
        {f.place && <div style={{ display: "flex", marginTop: px(16), fontSize: px(36), opacity: 0.92, wordBreak: "break-word" }}>{f.place}</div>}
      </div>

      <div style={{ display: "flex", flexDirection: shape === "og" ? "row" : "column", alignItems: shape === "og" ? "center" : "flex-start" }}>
        <div style={{ display: "flex", fontSize: px(38) }}>{f.when}</div>
        <div
          style={{
            display: "flex",
            marginLeft: shape === "og" ? "auto" : 0,
            marginTop: shape === "og" ? 0 : px(22),
            fontSize: px(32),
            padding: `${px(12)}px ${px(28)}px`,
            borderRadius: 999,
            background: open ? "#FFFFFF" : "rgba(0,0,0,0.18)",
            color: open ? TEAL_DARK : "#FFFFFF",
            border: open ? "2px solid #FFFFFF" : "2px solid rgba(255,255,255,0.55)",
          }}
        >
          {f.spots.text}
        </div>
      </div>
    </div>
  );
}

/** The PNG for these facts (also used by the scratch renders). */
export async function gameCardPng(f: GameCardFacts, shape: GameCardShape, headers?: HeadersInit): Promise<Response> {
  return new ImageResponse(<Card f={f} shape={shape} icon={await appMark()} />, { ...GAME_CARD_SHAPES[shape], headers });
}

const notFound = (cache: string) =>
  new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": cache } });

/** The route handlers' answer for /api/og/game/<id>[/<shape>]. */
export async function gameCardResponse(req: Request, id: string, shape: string): Promise<Response> {
  if (!isGameId(id) || !isGameCardShape(shape)) return notFound("public, max-age=86400, s-maxage=86400");
  const game = await getGameByIdServer(id);
  if (!game) return notFound("public, max-age=60, s-maxage=60");
  const now = Date.now();
  const facts = gameCardFacts(game, now);
  const path = gameCardPath(id, shape, gameCardVersion(facts));
  const { pathname, search } = new URL(req.url);
  if (`${pathname}${search}` !== path) {
    return new Response(null, { status: 307, headers: { Location: path, "Cache-Control": "public, max-age=60, s-maxage=60" } });
  }
  return gameCardPng(facts, shape, { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600" });
}
