// Run with: npm run test:session
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardLines, summaryText, whereWhen } from "./share";
import { aSession, withFinal, withScored } from "./testkit";

test("the summary text: day, venue, the result, every match, the stars and the link", () => {
  let s = withFinal(withFinal(aSession({ playersPerSide: 6 }), 64, 58), 40, 41, { battedFirst: "b", wb: 2 });
  ({ session: s } = withScored(s, [4, 6, 1, 0, 2, -1], [1, 1, 1, 1, 1, 1]));
  assert.equal(
    summaryText(s, "https://www.tapturf.in/tournament/abcdefgh1234"),
    [
      "*Turf session · Sun 8 Nov* · Sai Sports Arena",
      "*Titans 2 - 1 Strikers*",
      "1. Titans won by 6 runs",
      "2. Strikers won by 1 run",
      "3. Titans won by 7 runs",
      "Top runs: Rohan 11 (3)",
      "Top wickets: Vikas 1",
      "Every match: https://www.tapturf.in/tournament/abcdefgh1234",
    ].join("\n"),
  );
  const plain = summaryText({ ...withFinal(aSession({ venue: "" }), 30, 30) });
  assert.equal(plain, ["*Turf session · Sun 8 Nov*", "*Titans 0 - 0 Strikers* (1 tied)", "1. Match tied", "Scored on TapTurf.in"].join("\n"));
});

test("the card's lines: eyebrow, score, verdict, 8 matches then 'and N more', stars only with names", () => {
  let s = aSession();
  for (let i = 0; i < 10; i++) s = withFinal(s, 60, 50 + (i % 3) * 10);
  const c = cardLines(s);
  assert.equal(c.eyebrow, "FINAL · SUN 8 NOV · SAI SPORTS ARENA");
  assert.equal(c.scoreA, 4);
  assert.equal(c.scoreB, 3);
  assert.equal(c.extras, "3 tied");
  assert.equal(c.verdict, "Titans won the session");
  assert.equal(c.matches.length, 9);
  assert.equal(c.matches[0], "1 · Titans won by 10 runs");
  assert.equal(c.matches[8], "and 2 more");
  assert.deepEqual(c.stars, [], "typed scores have no players");
  assert.equal(c.footer, "tapturf.in");
  assert.equal(cardLines(s, false).eyebrow.startsWith("TURF SESSION · "), true);
  assert.equal(cardLines(s, false).verdict, "Titans lead");
  const long = cardLines({ ...s, sides: { a: { name: "x".repeat(30), players: [] }, b: s.sides.b } });
  assert.ok(long.matches.every((l) => l.length <= 64));
  const chase = { ...s.matches[0], result: { ...s.matches[0].result!, text: "Strikers won by 5 wickets with 21 balls left" } };
  assert.equal(cardLines({ ...s, matches: [chase] }).matches[0], "1 · Strikers won by 5 wickets with 21 balls left", "a chase's margin is kept whole");
  assert.equal(whereWhen({ day: "2026-11-08", venue: "" }), "Sun 8 Nov");
});
