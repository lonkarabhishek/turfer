import { test } from "node:test";
import assert from "node:assert/strict";
import { istDate, istWhen, phone10, spacedPhone } from "./display";
import { googleFirst, oauthAgeS } from "./oauthAge";

test("numbers read the Indian way", () => {
  assert.equal(phone10("+919000000099"), "9000000099");
  assert.equal(phone10("09000000099"), "9000000099");
  assert.equal(phone10("123"), "");
  assert.equal(spacedPhone("+919000000099"), "+91 90000 00099");
  assert.equal(spacedPhone(null), "");
});

test("dates and times in India time", () => {
  assert.equal(istDate("2026-10-21"), "21 Oct 2026");
  assert.equal(istDate("2026-10-21T20:00:00Z"), "22 Oct 2026", "after 18:30 UTC it is the next day in India");
  assert.equal(istDate("nope"), "");
  const now = Date.parse("2026-10-26T06:00:00Z");
  assert.equal(istWhen("2026-10-26T11:00:00Z", now), "4:30 pm");
  assert.equal(istWhen("2026-10-27T03:30:00Z", now), "27 Oct, 9:00 am");
  assert.equal(istWhen("2026-10-26T18:45:00Z", now), "27 Oct, 12:15 am");
});

const jwt = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;

test("oauthAgeS reads the Google sign-in's own time from the token (a choice of screen only)", () => {
  const now = Date.parse("2026-10-26T06:00:00Z");
  const at = now / 1000 - 400;
  assert.equal(oauthAgeS(jwt({ amr: [{ method: "oauth", timestamp: at }] }), now), 400);
  assert.equal(oauthAgeS(jwt({ amr: [{ method: "password", timestamp: at }] }), now), null);
  assert.equal(oauthAgeS(jwt({ amr: [{ method: "oauth", timestamp: at - 100 }, { method: "oauth", timestamp: at }] }), now), 400, "the newest");
  assert.equal(oauthAgeS(jwt({}), now), null);
  assert.equal(oauthAgeS("not-a-token", now), null);
  assert.equal(oauthAgeS("a.%%%.b", now), null);
});

test("googleFirst: Google before the SMS only when this device's clock says it's over 5 minutes, never on the way back", () => {
  assert.equal(googleFirst("add", 120, false), false, "a fresh Google sign-in goes straight to the number");
  assert.equal(googleFirst("add", 301, false), true, "over 5 minutes: Google first");
  assert.equal(googleFirst("change", null, false), true, "no oauth time: Google first");
  assert.equal(googleFirst("confirm", 400, false), true);
  // A phone clock 6 minutes fast reads every fresh sign-in as over 5 minutes old: right after the
  // round trip the form asked for, the server decides (its 403 reauth still opens the Google step).
  const fastClock = 360 + 5;
  assert.equal(googleFirst("add", fastClock, true), false, "back from Google: no loop on a fast clock");
  assert.equal(googleFirst("change", null, true), false);
  assert.equal(googleFirst("remove", 9999, false), false, "a removal sends no SMS: the server decides");
});
