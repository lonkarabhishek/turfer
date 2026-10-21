import type { PickleballRules, RulePreset, SportEngine } from "./types";
import { bool, clampInt, isObj, oneOf, other } from "./common";
import { makeEngine, wouldWin, type Kit } from "./rally";

/**
 * Pickleball, on the shared game fold in lib/board/rally.ts. The scorer
 * taps who won the rally; the engine decides what that means.
 *
 * Side-out scoring (USA Pickleball rules, Section 4):
 *  - Only the serving side scores. A serving side that loses the rally
 *    passes the serve: in doubles to the partner (server 2), then to the
 *    other side (side out, server 1 there).
 *  - Every game of doubles starts 0-0-2: the first serving side gets one
 *    server only, so its first lost rally is a side out.
 *  - The call is server's score, receiver's score and, in doubles, the
 *    server number: "4-2-1". Singles: "4-2".
 * Rally scoring (USA Pickleball provisional rule): every rally scores and
 * the winner serves, except that a point that would win the game counts
 * only for the serving side; a receiving side that wins that rally just
 * gets the serve (gamePointOnServe).
 * Both: games to 11 (15, 21), 2 clear. After each game the sides change
 * ends and the first serve (5.B.1), and in the deciding game they change
 * ends when the leader reaches 6 (8, 11).
 */

const DEFAULTS: PickleballRules = { scoring: "sideout", points: 11, winBy: 2, bestOf: 1, gamePointOnServe: true, doubles: true };

function normalizeRules(raw: unknown): PickleballRules {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULTS;
  return {
    scoring: oneOf(r.scoring, ["sideout", "rally"] as const, d.scoring),
    points: clampInt(r.points, 3, 99, d.points),
    winBy: clampInt(r.winBy, 1, 2, d.winBy),
    bestOf: oneOf(r.bestOf, [1, 3, 5], d.bestOf),
    gamePointOnServe: bool(r.gamePointOnServe, d.gamePointOnServe),
    doubles: bool(r.doubles, d.doubles),
  };
}

const PRESETS: RulePreset<PickleballRules>[] = [
  {
    key: "format",
    label: "Format",
    options: [
      { label: "Doubles to 11", rules: { scoring: "sideout", points: 11, doubles: true } },
      { label: "Singles to 11", rules: { scoring: "sideout", points: 11, doubles: false } },
      // Rally games run faster, so they go longer: 21 (or 15).
      { label: "Rally to 21", rules: { scoring: "rally", points: 21 } },
    ],
  },
  {
    key: "match",
    label: "Match",
    options: [
      { label: "1 game", rules: { bestOf: 1 } },
      { label: "Best of 3", rules: { bestOf: 3 } },
    ],
  },
];

/** Side-out doubles is the only game with server numbers. */
const numbered = (r: PickleballRules) => r.scoring === "sideout" && r.doubles;

const kit: Kit<PickleballRules> = {
  sport: "pickleball",
  label: "Pickleball",
  icon: "🏓",
  unit: "Game",
  defaults: DEFAULTS,
  normalizeRules,
  presets: PRESETS,
  pointChoices: [11, 15, 21],
  shape: (r) => ({ points: r.points, winBy: r.winBy, cap: null, bestOf: r.bestOf, decidingPoints: null }),
  rally: (f, g, won) => {
    const sv = f.serving;
    if (!sv || won === sv.side) return { point: won, note: null };
    if (f.rules.scoring === "sideout") return { point: null, note: f.rules.doubles && sv.num === 1 ? "Second server" : "Side out" };
    // Rally scoring: the receiving side cannot win the game on this rally, it only gets the serve.
    if (f.rules.gamePointOnServe && wouldWin(kit, f, g, won)) return { point: null, note: "Side out, no point: a game is won on serve" };
    return { point: won, note: "Side out" };
  },
  serveAfter: (f, _g, won) => {
    const sv = f.serving;
    if (sv && won === sv.side) return sv;
    if (sv && numbered(f.rules) && sv.num === 1) return { side: sv.side, num: 2 };
    return { side: won, num: 1 };
  },
  // The 0-0-2 start: the first serving side of every game has one server, who is called server 2.
  firstServe: (f, e) => ({ side: e.side, num: numbered(f.rules) ? (e.server ?? 2) : 1 }),
  correctServe: (f, _g, e) => ({ side: e.side, num: numbered(f.rules) ? (e.server ?? 1) : 1 }),
  resync: (f) => f.serving,
  nextGame: (f, prev) => {
    // 5.B.1: sides change the first serve after each game, so the side that received first serves first.
    const side = prev.first ? other(prev.first.side) : other(prev.winner ?? "b");
    return { side, num: numbered(f.rules) ? 2 : 1 };
  },
  numbered,
  serveNote: (f, g) => {
    const sv = f.serving;
    if (!sv) return null;
    const call = `${g.pts[sv.side]}-${g.pts[other(sv.side)]}`;
    return numbered(f.rules) ? `${call}-${sv.num}` : call;
  },
  endsAt: (t) => Math.ceil(t / 2),
  endsBefore: () => true,
  pointNotes: () => [],
  stateNotes: () => [],
  // Section 10.A: two timeouts a game to 11 or 15, three to 21.
  timeouts: (r) => ({ max: r.points >= 21 ? 3 : 2, per: "game" }),
  sideOut: (r) => r.scoring === "sideout",
  describe: (r) => `${r.scoring === "rally" ? "rally" : "side-out"} scoring, ${r.doubles ? "doubles" : "singles"}, ${r.bestOf === 1 ? "1 game" : `best of ${r.bestOf}`} to ${r.points}`,
};

export const pickleballEngine: SportEngine<PickleballRules> = makeEngine(kit);
