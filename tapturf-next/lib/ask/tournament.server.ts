import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { getLive } from "../live/server";
import { verifyTournamentCode } from "../tournament/codes";
import { getTournament, liveOf, tournamentKey } from "../tournament/server";
import type { LiveNow, Tournament } from "../tournament/types";
import { CARD_VERSION, MAX_CARDS, MAX_IN_PLAY, matchCard, scorecardsOf, tournamentFacts, type MatchCard, type TournamentFacts } from "./tournament";

/**
 * Server side of Ask on a tournament's page: the facts for one question,
 * from the reads followers already share and nothing else (no database
 * function of its own, no table, nothing written).
 *
 * What one question reads, and why a long tournament is never a burst of
 * database reads:
 *  1. The tournament: its shared copy (lib/tournament/server.ts
 *     getTournament: the data cache, purged by every change). Not
 *     tournamentView, which reads every linked scorecard on each call.
 *  2. Scorecards in play (linked, no result yet: being scored, waiting,
 *     turned off, or a Live Scoreboard): the page's own liveOf and the
 *     keyed live read's shared 10 second copy (getLive), which followers'
 *     polls keep warm. At most MAX_IN_PLAY of them, the newest.
 *  3. Finished scorecards: none, once kept. Each one's compact card
 *     (lib/ask/tournament.ts matchCard) is kept in the data cache per
 *     scorecard and kept result for a day (CARD_KEPT_S), as "My live
 *     matches" keeps its lines (lib/matches/server.ts): a finished match
 *     costs one database read a day at most, however many questions are
 *     asked, and its result comes from the fixture itself. The first
 *     question about a tournament whose cards are not kept yet reads them
 *     READS_AT_ONCE at a time, and at most MAX_CARDS (the newest; older
 *     matches keep their result and say their scorecard was not read).
 *  4. The facts themselves, digest included, are remembered per instance
 *     for the tournament as it stands (its rev and each in-play
 *     scorecard's state): a second question rebuilds nothing.
 * So a tournament with 20 scored matches costs a question no scorecard
 * read at all once its cards are kept, and 20 reads once a day when they
 * are not. A finished scorecard corrected later without changing its
 * result (a renamed player) shows here within a day.
 * Relative imports only.
 */

/** A kept card's life: a finished match's scorecard does not change. */
const CARD_KEPT_S = 86_400;
/** Scorecards read at the same time when none is kept yet. */
const READS_AT_ONCE = 4;
/** Tournaments whose facts one instance remembers. */
const FACTS_KEPT = 24;

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

/**
 * One finished scorecard's card. A read inside the data cache's own scope
 * goes straight to the database (Next does not serve a cached copy to a
 * read nested in another), which is the one read this card ever costs
 * until it expires. Throws when the scorecard can't be read, so nothing
 * is kept for it.
 */
function keptCard(liveCode: string, stamp: string): Promise<MatchCard | null> {
  return unstable_cache(
    async () => {
      const row = await getLive(liveCode);
      return row ? matchCard(row.match) : null;
    },
    // Its kept result is part of the key: a finished match's does not change, so this is read once.
    ["ask-tournament-card", String(CARD_VERSION), liveCode, sha(stamp)],
    { revalidate: CARD_KEPT_S },
  )();
}

const remembered = new Map<string, TournamentFacts>();

/**
 * A tournament's facts as followers see it now. A code that isn't one of
 * ours is missing; a failed read is unknown, never a guess. A scorecard
 * that could not be read just now is left as not read (its match keeps its
 * result), and those facts are not remembered, so the next question tries
 * again.
 */
export async function tournamentFactsFor(code: string, now = Date.now()): Promise<TournamentFacts> {
  const key = tournamentKey();
  if (!key || !verifyTournamentCode(code, key)) return tournamentFacts({ status: "missing" });
  let t: Tournament | null;
  try {
    t = await getTournament(code);
  } catch (e) {
    console.warn("ask tournament: read failed", code, e);
    return tournamentFacts({ status: "unknown" });
  }
  if (!t) return tournamentFacts({ status: "missing" });
  if (t.status !== "on") return tournamentFacts({ status: "ok", view: { tournament: t, live: {}, at: now } });

  const all = scorecardsOf(t);
  const kept = all.kept.slice(-MAX_CARDS);
  const unread: number[] = all.kept.slice(0, Math.max(0, all.kept.length - MAX_CARDS)).map((w) => w.id);
  const cards: Record<string, MatchCard | null> = {};
  const live: Record<string, LiveNow> = {};
  let failed = false;

  // In play: where each stands for the page (liveOf, as its polls work it out) and its card, from one shared read.
  const byId = new Map(t.fixtures.map((f) => [f.id, f]));
  await Promise.all(
    all.inPlay.slice(-MAX_IN_PLAY).map(async (w) => {
      try {
        const l = await liveOf(t, byId.get(w.id)!, now);
        if (!l) {
          failed = true;
          return;
        }
        live[String(w.id)] = l;
        if (l.status === "waiting") return;
        const row = await getLive(w.code);
        cards[String(w.id)] = row ? matchCard(row.match) : null;
      } catch (e) {
        console.warn("ask tournament: scorecard read failed", code, w.code, e);
        failed = true;
      }
    }),
  );

  const memoKey = `${code}|${t.rev}|${sha(JSON.stringify([kept.map((w) => [w.id, w.stamp]), Object.entries(live).map(([id, l]) => [id, l.status, l.updatedAt, l.closed, l.headline])]))}`;
  const had = failed ? undefined : remembered.get(memoKey);
  if (had) return had;

  for (let i = 0; i < kept.length; i += READS_AT_ONCE) {
    await Promise.all(
      kept.slice(i, i + READS_AT_ONCE).map(async (w) => {
        try {
          cards[String(w.id)] = await keptCard(w.code, w.stamp);
        } catch (e) {
          console.warn("ask tournament: scorecard read failed", code, w.code, e);
          unread.push(w.id);
          failed = true;
        }
      }),
    );
  }
  const facts = tournamentFacts({ status: "ok", view: { tournament: t, live, at: now }, cards, unread });
  if (!failed) {
    if (remembered.size >= FACTS_KEPT) remembered.delete(remembered.keys().next().value as string);
    remembered.set(memoKey, facts);
  }
  return facts;
}
