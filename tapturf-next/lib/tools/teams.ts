/**
 * Splitting players into teams: the Cricket Team Generator's maths
 * (components/tools/TeamGenerator.tsx), also used by the Turf Session
 * Scorer to deal a game's players into two sides. rng is Math.random
 * unless a test passes a seeded one. Pure, relative imports only, tested
 * in teams.test.ts (npm run test:session).
 */

export type SplitMode = "random" | "balanced";

/** A shuffled copy (Fisher-Yates); the list passed in is left as it was. */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Random: shuffle and deal round-robin. Balanced: strongest first, snake order. */
export function splitTeams<P extends { name: string; rating: number }>(players: readonly P[], count: number, mode: SplitMode, rng: () => number = Math.random): P[][] {
  const teams: P[][] = Array.from({ length: count }, () => []);
  if (mode === "random") {
    shuffle(players, rng).forEach((p, i) => teams[i % count].push(p));
    return teams;
  }
  const ordered = shuffle(players, rng).sort((a, b) => b.rating - a.rating);
  ordered.forEach((p, i) => {
    const round = Math.floor(i / count);
    const pos = i % count;
    const idx = round % 2 === 0 ? pos : count - 1 - pos;
    teams[idx].push(p);
  });
  return teams;
}
