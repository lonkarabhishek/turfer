import { test } from "node:test";
import assert from "node:assert/strict";
import { courtKind, sportFamily, sportLabel } from "./sport";

test("sport names read the same however they were stored", () => {
  assert.equal(sportLabel("cricket"), "Cricket");
  assert.equal(sportLabel("Cricket"), "Cricket");
  assert.equal(sportLabel(" box  cricket "), "Box Cricket");
  assert.equal(sportLabel("BOX CRICKET"), "Box Cricket");
  assert.equal(sportLabel("football"), "Football");
  assert.equal(sportLabel("futsal"), "Futsal");
  assert.equal(sportLabel("5V5 football"), "5v5 Football");
  assert.equal(sportLabel("5v5 Football"), "5v5 Football");
  assert.equal(sportLabel("7-a-side football"), "7-a-side Football");
  assert.equal(sportLabel("BADMINTON"), "Badminton");
  assert.equal(sportLabel("table tennis"), "Table Tennis");
  assert.equal(sportLabel("ultimate frisbee"), "Ultimate Frisbee");
  assert.equal(sportLabel(""), "Game");
  assert.equal(sportLabel("   "), "Game");
  assert.equal(sportLabel(null), "Game");
});

test("sport families pick the drawing and the glyph", () => {
  assert.equal(sportFamily("Cricket"), "cricket");
  assert.equal(sportFamily("box cricket"), "cricket");
  assert.equal(sportFamily("Football"), "football");
  assert.equal(sportFamily("5v5 Football"), "football");
  assert.equal(sportFamily("5v5"), "football");
  assert.equal(sportFamily("7-a-side"), "football");
  assert.equal(sportFamily("Futsal"), "football");
  assert.equal(sportFamily("Badminton"), "court");
  assert.equal(sportFamily("Pickleball"), "court");
  assert.equal(sportFamily("Tennis"), "court");
  assert.equal(sportFamily("Padel"), "court");
  assert.equal(sportFamily("Volleyball"), "court");
  assert.equal(sportFamily("Basketball"), "basketball");
  assert.equal(sportFamily("Ultimate Frisbee"), "other");
  assert.equal(sportFamily(""), "other");
  assert.equal(courtKind("Volleyball"), "volleyball");
  assert.equal(courtKind("badminton"), "badminton");
  assert.equal(courtKind("Tennis"), null);
});
