import { scoredLiveCount } from "../tournament/about";
import type { Resolution } from "../tournament/standings";
import type { Format } from "../tournament/types";
import type { TournamentHas } from "./tournamentKind";

/**
 * What a tournament has, as far as Ask's chips care, from the page's own
 * resolve() (lib/tournament/standings.ts): the tournament page works it
 * out from what it already shows, the server from the same read, so the
 * chips on the page and under an answer are the same. scored is the
 * page's own "N scored live" count (lib/tournament/about.ts). A file of
 * its own so the chat, which every page loads, does not carry the
 * tournament page's words.
 */
export function tournamentHasOf(res: Pick<Resolution, "fixtures" | "played" | "total" | "champion">, format: Format): TournamentHas {
  return { series: format === "bilateral", played: res.played, total: res.total, live: res.fixtures.filter((r) => r.state === "live").length, scored: scoredLiveCount(res.fixtures), champion: !!res.champion };
}
