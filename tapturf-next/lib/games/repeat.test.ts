import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  endsLabel,
  matches,
  maxGames,
  monthlyChoices,
  nextDays,
  normalRepeat,
  ordinal,
  repeatLabel,
  repeatProblem,
  repeatSummary,
  ruleFor,
  seriesDays,
  startRule,
  type Repeat,
} from "./repeat";

// The cases the database's maths is checked against too (scripts/sql-tests/game_series.check.mjs).
type Cases = {
  days: { what: string; start: string; repeat: Repeat; days: string[] }[];
  problems: { what: string; start: string; repeat: unknown; problem: string | null }[];
};
const CASES = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/games/repeat.cases.json"), "utf8")) as Cases;
const plain = (s: string) => s.replace(/ /g, " ");

test("repeat: every shared case makes the days the database makes", () => {
  assert.ok(CASES.days.length >= 10);
  for (const c of CASES.days) assert.deepEqual(seriesDays(c.repeat, c.start), c.days, c.what);
});

test("repeat: every shared case is refused (or not) as the database refuses it", () => {
  for (const c of CASES.problems) assert.equal(repeatProblem(c.repeat, c.start), c.problem, c.what);
  assert.equal(repeatProblem({ rule: { freq: "weekly", interval: 1, days: [2] }, ends: { type: "never" } }, "2026-02-30"), "repeat", "no such first day");
});

test("repeat: a day before the first is never one", () => {
  const r: Repeat = { rule: { freq: "weekly", interval: 1, days: [2] }, ends: { type: "after", count: 2 } };
  assert.deepEqual(seriesDays(r, "2026-11-04"), ["2026-11-10", "2026-11-17"]);
  // Every N weeks: the first game is the first picked day on or after the first day, whatever N.
  for (let start = 0; start < 7; start++) {
    const from = `2026-11-0${2 + start}`;
    for (const interval of [2, 3, 4]) {
      for (const day of [0, 1, 2, 3, 4, 5, 6]) {
        const first = seriesDays({ rule: { freq: "weekly", interval, days: [day] }, ends: { type: "after", count: 2 } }, from)[0];
        const gap = (Date.parse(first) - Date.parse(from)) / 86_400_000;
        assert.ok(gap >= 0 && gap <= 6 && new Date(first).getUTCDay() === day, `${from} every ${interval} weeks on ${day}: ${first}`);
      }
    }
  }
  assert.equal(matches({ freq: "monthly", by: "date", day: 31 }, "2027-01-31", "2027-02-28"), true);
  assert.equal(matches({ freq: "monthly", by: "date", day: 31 }, "2027-01-31", "2027-02-27"), false);
});

test("repeat: the next dates go by India's clock", () => {
  const r: Repeat = { rule: { freq: "weekly", interval: 1, days: [2, 4] }, ends: { type: "never" } };
  // 00:15 on Tue 3 Nov in India is still Monday in UTC: Tuesday's 7 PM game is ahead.
  assert.deepEqual(nextDays(r, "2026-11-03", "19:00", 3, Date.UTC(2026, 10, 2, 18, 45)), ["2026-11-03", "2026-11-05", "2026-11-10"]);
  assert.deepEqual(nextDays(r, "2026-11-03", "19:00:00", 1, Date.UTC(2026, 10, 3, 13, 29)), ["2026-11-03"], "6:59 PM in India: not started");
  assert.deepEqual(nextDays(r, "2026-11-03", "19:00", 1, Date.UTC(2026, 10, 3, 13, 31)), ["2026-11-05"], "7:01 PM: started, so the next is Thursday");
});

test("repeat: monthly choices, as a calendar offers them", () => {
  const words = (d: string) => monthlyChoices(d).map(repeatLabel);
  assert.deepEqual(words("2026-11-01"), ["Monthly on the 1st", "Monthly on the first Sunday"]);
  assert.deepEqual(words("2026-11-22"), ["Monthly on the 22nd", "Monthly on the fourth Sunday"]);
  assert.deepEqual(words("2026-11-28"), ["Monthly on the 28th", "Monthly on the fourth Saturday", "Monthly on the last Saturday"]);
  assert.deepEqual(words("2026-11-29"), ["Monthly on the 29th (or the month's last day)", "Monthly on the last Sunday"], "a fifth Sunday is only the last");
  for (const d of ["2026-11-01", "2026-11-28", "2026-11-29", "2027-02-28"]) {
    for (const rule of monthlyChoices(d)) assert.equal(repeatProblem({ rule, ends: { type: "never" } }, d), null, `${d} ${repeatLabel(rule)}`);
  }
});

test("repeat: a new first day keeps the kind of rule", () => {
  assert.deepEqual(startRule("weekly", "2026-11-03"), { freq: "weekly", interval: 1, days: [2] });
  assert.deepEqual(ruleFor({ freq: "weekly", interval: 2, days: [2] }, "2026-11-05", "2026-11-03"), { freq: "weekly", interval: 2, days: [4] }, "a lone weekday follows the day");
  assert.deepEqual(ruleFor({ freq: "weekly", interval: 1, days: [2, 4] }, "2026-11-06", "2026-11-03"), { freq: "weekly", interval: 1, days: [2, 4] }, "chosen ones stay");
  assert.deepEqual(ruleFor({ freq: "monthly", by: "weekday", nth: -1, weekday: 6 }, "2026-11-29", "2026-11-28"), { freq: "monthly", by: "weekday", nth: -1, weekday: 0 });
  assert.deepEqual(ruleFor({ freq: "monthly", by: "weekday", nth: 1, weekday: 0 }, "2026-11-10"), { freq: "monthly", by: "weekday", nth: 2, weekday: 2 });
  assert.deepEqual(ruleFor({ freq: "monthly", by: "date", day: 1 }, "2026-11-10"), { freq: "monthly", by: "date", day: 10 });
});

test("repeat: how it reads", () => {
  assert.equal(repeatLabel({ freq: "weekly", interval: 1, days: [4, 2] }), "Every Tue and Thu");
  assert.equal(repeatLabel({ freq: "weekly", interval: 1, days: [0, 6] }), "Every Sat and Sun", "Monday first");
  assert.equal(repeatLabel({ freq: "weekly", interval: 1, days: [5, 1, 3] }), "Every Mon, Wed and Fri");
  assert.equal(repeatLabel({ freq: "weekly", interval: 2, days: [6] }), "Every 2 weeks on Sat");
  assert.equal(repeatLabel({ freq: "weekly", interval: 1, days: [0, 1, 2, 3, 4, 5, 6] }), "Every day");
  assert.equal(repeatLabel({ freq: "weekly", interval: 1, days: [1, 2, 3, 4, 5] }), "Every weekday");
  assert.equal(repeatLabel({ freq: "weekly", interval: 3, days: [1, 2, 3, 4, 5] }), "Every 3 weeks on weekdays");
  assert.equal(repeatLabel({ freq: "monthly", by: "date", day: 31 }), "Monthly on the 31st (or the month's last day)");
  assert.equal(repeatLabel({ freq: "monthly", by: "weekday", nth: 3, weekday: 3 }), "Monthly on the third Wednesday");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st"]);
  const tueThu: Repeat = { rule: { freq: "weekly", interval: 1, days: [2, 4] }, ends: { type: "on", date: "2026-12-20" } };
  assert.equal(plain(repeatSummary(tueThu, "2026-11-03", "19:00", "20:00")), "Every Tue and Thu, 7 – 8 PM, until 20 Dec");
  assert.equal(plain(repeatSummary({ ...tueThu, ends: { type: "never" } }, "2026-11-03", "18:30:00", "20:00:00")), "Every Tue and Thu, 6:30 – 8 PM");
  assert.equal(endsLabel({ type: "on", date: "2027-01-05" }, "2026-11-03"), "until 5 Jan 2027", "the year when it is another");
  assert.equal(endsLabel({ type: "after", count: 8 }, "2026-11-03"), "8 games");
  assert.equal(endsLabel({ type: "never" }, "2026-11-03"), null);
});

test("repeat: after N is at most what the year holds", () => {
  assert.equal(maxGames({ freq: "monthly", by: "date", day: 15 }, "2026-11-15"), 13);
  assert.equal(maxGames({ freq: "weekly", interval: 1, days: [2, 4] }, "2026-11-03"), 52);
  assert.equal(maxGames({ freq: "weekly", interval: 4, days: [1] }, "2026-11-02"), 14);
  assert.deepEqual(normalRepeat({ rule: { freq: "weekly", interval: 1, days: [4, 2, 4] }, ends: { type: "never" } }).rule, { freq: "weekly", interval: 1, days: [2, 4] });
});
