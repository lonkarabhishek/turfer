import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP_DESCRIPTION, MAP_TITLE, mapMetadata } from "./mapMeta";
import { bannedCopy, ROBOTS_NOINDEX_FOLLOW } from "./defaults";
import { DESCRIPTION_MAX_CHARS, titleFits } from "./width";

test("/map: a title and description that fit, honest, not indexed, its own canonical", () => {
  // The layout's template adds the brand.
  assert.ok(titleFits(`${MAP_TITLE} | TapTurf`), MAP_TITLE);
  assert.ok(MAP_DESCRIPTION.length <= DESCRIPTION_MAX_CHARS, `${MAP_DESCRIPTION.length}c`);
  assert.equal(bannedCopy(MAP_TITLE), null);
  assert.equal(bannedCopy(MAP_DESCRIPTION), null);
  const m = mapMetadata();
  assert.equal(m.title, MAP_TITLE);
  assert.deepEqual(m.robots, ROBOTS_NOINDEX_FOLLOW);
  assert.equal(m.alternates?.canonical, "https://www.tapturf.in/map");
  assert.equal((m.openGraph as { url?: string }).url, "https://www.tapturf.in/map");
  assert.ok(Array.isArray(m.openGraph?.images) && m.openGraph.images.length === 1, "the default share card");
});
