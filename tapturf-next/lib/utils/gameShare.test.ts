import { test } from "node:test";
import assert from "node:assert/strict";
import { gameShareText, shareDetails, shareWhen, shareWhere, type ShareGame } from "./gameShare";

const game: ShareGame = {
  sport: "football",
  date: "2026-11-07",
  start_time: "19:00:00",
  end_time: "20:00:00",
  max_players: 12,
  current_players: 8,
  price_per_player: 150,
  skill_level: "intermediate",
  turf_booked: true,
  turfs: { name: "Dribble Den", area: "Begur", city: "bangalore" },
};

test("share: which game, where and when, one line each, the link last", () => {
  assert.equal(
    gameShareText(game, { host: true, url: "https://www.tapturf.in/game/abc" }),
    [
      "⚽ Join my football game on TapTurf!",
      "📍 Dribble Den, Begur, Bangalore",
      "🗓️ Sat 7 Nov, 7 – 8 PM",
      "👥 Intermediate · 4 of 12 spots left · ₹150 per player · Turf booked",
      "https://www.tapturf.in/game/abc",
    ].join("\n"),
  );
  // Someone other than the host shares it; the share sheet sends the link itself.
  const text = gameShareText(game, { host: false });
  assert.equal(text.split("\n")[0], "⚽ Football game on TapTurf, join in");
  assert.ok(!text.includes("http"));
});

test("share: the date is never relative, whenever it is sent", () => {
  assert.equal(shareWhen({ date: "2026-11-07", start_time: "06:30:00", end_time: "08:00:00" }), "Sat 7 Nov, 6:30 – 8 AM");
  assert.equal(shareWhen({ date: "2026-11-07", start_time: null, end_time: null }), "Sat 7 Nov");
  assert.equal(shareWhen({ date: null, start_time: null, end_time: null }), null);
  assert.ok(!/today|tomorrow/i.test(shareWhen({ date: new Date().toISOString().slice(0, 10), start_time: "19:00", end_time: "20:00" }) ?? ""));
});

test("share: where names the venue, area and city once each", () => {
  assert.equal(shareWhere({ name: "Pune Turf", area: "Pune", city: "pune" }), "Pune Turf, Pune");
  assert.equal(shareWhere({ name: "Arena Seven", area: null, city: "Dehradun" }), "Arena Seven, Dehradun");
  assert.equal(shareWhere({ name: "  ", area: "Baner", city: "pune" }), null);
  assert.equal(shareWhere(null), null);
});

test("share: details say what is known and nothing else", () => {
  assert.equal(shareDetails({ ...game, price_per_player: 0, turf_booked: false, skill_level: "all" }), "All levels · 4 of 12 spots left · Free to join");
  assert.equal(shareDetails({ ...game, current_players: 12 }), "Intermediate · Full (12 players) · ₹150 per player · Turf booked");
  assert.equal(shareDetails({ sport: "cricket", date: null, start_time: null, end_time: null }), null);
  // A game with nothing but its sport still reads as a line, with no empty ones.
  assert.equal(gameShareText({ sport: "box cricket", date: null, start_time: null, end_time: null }, { host: true }), "🏏 Join my box cricket game on TapTurf!");
});

test("share: a game that is over invites nobody and says nothing of spots", () => {
  assert.equal(
    gameShareText(game, { host: true, closed: "ended", url: "https://www.tapturf.in/game/abc" }),
    ["⚽ Football game on TapTurf (ended)", "📍 Dribble Den, Begur, Bangalore", "🗓️ Sat 7 Nov, 7 – 8 PM", "https://www.tapturf.in/game/abc"].join("\n"),
  );
  assert.equal(gameShareText(game, { host: false, closed: "cancelled" }).split("\n")[0], "⚽ Football game on TapTurf (cancelled)");
});

test("share: every sport the create flow offers has its own icon", () => {
  const lead = (sport: string) => gameShareText({ sport, date: null, start_time: null, end_time: null }, { host: true });
  for (const [sport, icon] of [["Cricket", "🏏"], ["Box Cricket", "🏏"], ["Football", "⚽"], ["5v5 Football", "⚽"], ["Basketball", "🏀"], ["Tennis", "🎾"], ["Pickleball", "🏓"], ["Badminton", "🏸"]]) {
    assert.ok(lead(sport).startsWith(`${icon} Join my `), `${sport}: ${lead(sport)}`);
  }
});

