import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTurfNames } from "./names";
import type { Turf } from "../../types/turf";

// Real names from the turfs table (October 2026).
const rows: [string, string, number][] = [
  ["A One Sports Club Patancheru", "hyderabad", 300],
  ["A One Sports Pickle Zone & Cricket Arena", "hyderabad", 40],
  ["A-One Turf", "nashik", 120],
  ["A1 Turf", "jalgaon", 15],
  ["Arena One", "yavatmal", 30],
  ["Champions Zone Box Cricket", "hyderabad", 900],
  ["Champion's Turf", "nashik", 60],
  ["Champions Field Hadapsar", "pune", 200],
  ["The Royal MultiSports Turf", "nashik", 25],
  ["Vedant Sports Academy", "nashik", 80],
  ["Hindu Gymkhana Ground", "nashik", 500],
  ["CC Turf Pardi", "nashik", 30],
  ["CC Turf Gangapur", "nashik", 30],
];
const all = rows.map(([name, city, total_reviews], i) => ({ id: `t${i}`, name, city, total_reviews, area: null, address: "" }) as unknown as Turf);
const pick = (q: string, city: string | null = null) => resolveTurfNames(all, [q], city)[0].turf?.name ?? null;

test("typos in the generic word do not block a match", () => {
  assert.equal(pick("Royal multisports truf"), "The Royal MultiSports Turf");
  assert.equal(pick("royal multisport turff"), "The Royal MultiSports Turf");
});

test("A one / A-One / A1 match each other, the city decides", () => {
  assert.equal(pick("A one truf", "nashik"), "A-One Turf");
  assert.equal(pick("A1 turf", "jalgaon"), "A1 Turf");
  assert.equal(pick("a-one", "nashik"), "A-One Turf");
});

test("a word never matches inside another word", () => {
  // "one" must not find "Champions Zone".
  assert.notEqual(pick("one", "hyderabad"), "Champions Zone Box Cricket");
});

test("prefixes and possessives still match", () => {
  assert.equal(pick("Champion", "nashik"), "Champion's Turf");
  assert.equal(pick("champions hadapsar"), "Champions Field Hadapsar");
});

test("existing behaviour holds", () => {
  assert.equal(pick("Vedant"), "Vedant Sports Academy");
  assert.equal(pick("Hindu Gymkhana"), "Hindu Gymkhana Ground");
  assert.equal(pick("CC Turf Pardi"), "CC Turf Pardi");
  assert.equal(pick("zzz unknown place"), null);
});
