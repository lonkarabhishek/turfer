import { test } from "node:test";
import assert from "node:assert/strict";
import { gameEventJsonLd, gamesJsonLd, gameCityLabel } from "./gameJsonLd";
import { gameDates } from "./gameDates";
import { jsonLdHtml } from "./jsonLd";
import { stateFor } from "../city";
import { gameVenue } from "../utils/game";
import { gamePath } from "../utils/gamePath";
import type { Game } from "../../types/game";

// 4 Nov 2026, 12:00 in India.
const NOW = Date.UTC(2026, 10, 4, 6, 30);
const HOST = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const TURF_GAME = "dddddddd-dddd-4ddd-8ddd-000000000002";
const VENUE_GAME = "dddddddd-dddd-4ddd-8ddd-000000000001";
const SITE = "https://www.tapturf.in";
// The readable URL (lib/utils/gamePath.ts): what @id, url, the offer and a host with no profile point at.
const TURF_PATH = "/game/box-cricket-kings-arena-baner-pune-sat-7-nov-7pm-dddddddd";

const base: Game = {
  id: TURF_GAME,
  creator_id: HOST,
  turf_id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001",
  title: "Box Cricket Game",
  sport: "Box Cricket",
  skill_level: "all",
  date: "2026-11-07",
  start_time: "19:00:00",
  end_time: "21:00:00",
  current_players: 8,
  max_players: 12,
  price_per_player: 150,
  turf_booked: false,
  status: "open",
  host_name: "Ravi Kumar",
  created_at: "2026-11-03T10:00:00Z",
  series_id: null,
  venue_name: null,
  venue_address: null,
  venue_area: null,
  venue_city: null,
  venue_maps_url: null,
  turfs: { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001", slug: "kings-arena-baner", name: "Kings Arena", address: "Survey 12, Baner, Pune", area: "Baner", city: "pune", lat: 18.559, lng: 73.786 },
};

const typed: Game = {
  ...base,
  id: VENUE_GAME,
  turf_id: null,
  sport: "Football",
  host_name: "Asha Rao",
  current_players: 5,
  max_players: 14,
  price_per_player: 100,
  turfs: undefined,
  venue_name: "Shivaji Maidan",
  venue_address: "Behind Ganesh Temple, Baner Road",
  venue_area: "Baner",
  venue_city: "pune",
  venue_maps_url: "https://maps.app.goo.gl/AbCd123",
};

// ── The builders as they were before organizer.url, image and performer (4 Nov 2026), verbatim but for `now` ──

function legacyPageJsonLd(game: Game, id: string, now: number) {
  const place = gameVenue(game);
  const gCityLabel = gameCityLabel(game, place);
  const venueName = place?.name ?? "a local turf";
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "@id": `${SITE}${gamePath(game)}`,
    name: `${game.sport} at ${venueName}`,
    description: `Join a ${game.sport} game at ${venueName} on TapTurf.`,
    ...gameDates(game),
    sport: game.sport,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: game.turfs
      ? {
          "@type": "Place",
          name: game.turfs.name,
          address: {
            "@type": "PostalAddress",
            streetAddress: game.turfs.address,
            ...(gCityLabel && { addressLocality: gCityLabel }),
            addressRegion: stateFor(game.turfs.city),
            addressCountry: "IN",
          },
        }
      : place
        ? {
            "@type": "Place",
            name: place.name,
            address: {
              "@type": "PostalAddress",
              streetAddress: place.address,
              ...(gCityLabel && { addressLocality: gCityLabel }),
              addressRegion: stateFor(place.city),
              addressCountry: "IN",
            },
          }
        : undefined,
    organizer: { "@type": "Person", name: game.host_name || "TapTurf host" },
    offers: {
      "@type": "Offer",
      url: `${SITE}${gamePath(game)}`,
      price: game.price_per_player ?? 0,
      priceCurrency: "INR",
      availability: game.current_players < game.max_players ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      validFrom: new Date(now).toISOString(),
    },
    maximumAttendeeCapacity: game.max_players,
    remainingAttendeeCapacity: Math.max(0, game.max_players - game.current_players),
  };
}

function legacyListItem(g: Game) {
  return {
    "@type": "SportsEvent",
    "@id": `${SITE}${gamePath(g)}`,
    name: `${g.sport} at ${g.turfs?.name || "a local turf"}`,
    ...gameDates(g),
    sport: g.sport,
    location: g.turfs ? { "@type": "Place", name: g.turfs.name, address: g.turfs.address } : undefined,
    offers: {
      "@type": "Offer",
      price: g.price_per_player ?? 0,
      priceCurrency: "INR",
      availability: g.current_players < g.max_players ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
    },
    maximumAttendeeCapacity: g.max_players,
    remainingAttendeeCapacity: Math.max(0, g.max_players - g.current_players),
  };
}

/** `o` without `keys`, and with organizer as it was (name only), as JSON (key order counts). */
function without(o: Record<string, unknown>, keys: string[]): string {
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (keys.includes(k)) continue;
    copy[k] = k === "organizer" ? { "@type": "Person", name: (v as { name: string }).name } : v;
  }
  return JSON.stringify(copy);
}

const isSiteUrl = (u: unknown) => typeof u === "string" && /^https:\/\/www\.tapturf\.in\/\S+$/.test(u);

// ── The game page ──

test("game page: organizer is the host with a url, performer the host, image the game's own www cards", () => {
  const ld = gameEventJsonLd(base, { id: TURF_GAME, now: NOW });
  assert.deepEqual(ld.organizer, { "@type": "Person", name: "Ravi Kumar", url: `${SITE}${TURF_PATH}` }, "no profile: the game page");
  assert.deepEqual(ld.performer, { "@type": "Person", name: "Ravi Kumar" });
  assert.equal(ld.image.length, 3);
  for (const u of ld.image) assert.ok(isSiteUrl(u) && u.startsWith(`${SITE}/api/og/game/${TURF_GAME}`), u);
  assert.match(ld.image[0], new RegExp(`^${SITE}/api/og/game/${TURF_GAME}\\?v=[0-9a-z]+$`));
  assert.match(ld.image[1], /\/4x3\?v=/);
  assert.match(ld.image[2], /\/1x1\?v=/);

  const withProfile = gameEventJsonLd(base, { id: TURF_GAME, hostUsername: "ravi_k", now: NOW });
  assert.deepEqual(withProfile.organizer, { "@type": "Person", name: "Ravi Kumar", url: `${SITE}/u/ravi_k` }, "a shown profile: /u/<username>");
  assert.deepEqual(withProfile.performer, { "@type": "Person", name: "Ravi Kumar" }, "performer carries no url");

  // Anything that is not a username (it never comes from the lookup, but the url must stay on the site) is the game page.
  for (const bad of ["Ravi K", "../admin", "x", "ravi@example.com", "9876543210"]) {
    assert.equal(gameEventJsonLd(base, { id: TURF_GAME, hostUsername: bad, now: NOW }).organizer.url, `${SITE}${TURF_PATH}`, bad);
  }
});

test("game page: a normal turf game's JSON-LD is unchanged but for organizer.url, image and performer (snapshot)", () => {
  const ld = gameEventJsonLd(base, { id: TURF_GAME, hostUsername: "ravi_k", now: NOW });
  assert.equal(without(ld, ["image", "performer"]), JSON.stringify(legacyPageJsonLd(base, TURF_GAME, NOW)));
  // The whole object, pinned (the card version is the hash of what the card says).
  const v = /\?v=([0-9a-z]+)$/.exec(ld.image[0])![1];
  assert.deepEqual(JSON.parse(JSON.stringify(ld)), {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "@id": `${SITE}${TURF_PATH}`,
    name: "Box Cricket at Kings Arena",
    description: "Join a Box Cricket game at Kings Arena on TapTurf.",
    image: [`${SITE}/api/og/game/${TURF_GAME}?v=${v}`, `${SITE}/api/og/game/${TURF_GAME}/4x3?v=${v}`, `${SITE}/api/og/game/${TURF_GAME}/1x1?v=${v}`],
    startDate: "2026-11-07T19:00:00+05:30",
    endDate: "2026-11-07T21:00:00+05:30",
    sport: "Box Cricket",
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: "Kings Arena",
      address: { "@type": "PostalAddress", streetAddress: "Survey 12, Baner, Pune", addressLocality: "Pune", addressRegion: "Maharashtra", addressCountry: "IN" },
    },
    organizer: { "@type": "Person", name: "Ravi Kumar", url: `${SITE}/u/ravi_k` },
    performer: { "@type": "Person", name: "Ravi Kumar" },
    offers: { "@type": "Offer", url: `${SITE}${TURF_PATH}`, price: 150, priceCurrency: "INR", availability: "https://schema.org/InStock", validFrom: "2026-11-04T06:30:00.000Z" },
    maximumAttendeeCapacity: 12,
    remainingAttendeeCapacity: 4,
  });
});

test("game page: a typed venue keeps its Place and PostalAddress; a full game still has organizer, image and performer", () => {
  const ld = gameEventJsonLd(typed, { id: VENUE_GAME, now: NOW });
  assert.equal(without(ld, ["image", "performer"]), JSON.stringify(legacyPageJsonLd(typed, VENUE_GAME, NOW)));
  assert.deepEqual(ld.location, {
    "@type": "Place",
    name: "Shivaji Maidan",
    address: { "@type": "PostalAddress", streetAddress: "Behind Ganesh Temple, Baner Road", addressLocality: "Pune", addressRegion: "Maharashtra", addressCountry: "IN" },
  });
  const full = gameEventJsonLd({ ...base, current_players: 12 }, { id: TURF_GAME, now: NOW });
  assert.equal(full.offers.availability, "https://schema.org/SoldOut");
  assert.ok(full.organizer.url && full.performer && full.image.every(isSiteUrl));
  assert.notEqual(full.image[0], gameEventJsonLd(base, { id: TURF_GAME, now: NOW }).image[0], "spots changed: the card URL changed");
});

test("game page: the host's name goes through jsonLdHtml like the rest; nothing but name and url about them", () => {
  const ld = gameEventJsonLd({ ...base, host_name: "</script><b>x", host_phone: "9876543210" }, { id: TURF_GAME, now: NOW });
  const html = jsonLdHtml(ld);
  assert.ok(!html.includes("</script>") && !html.includes("9876543210"));
  assert.deepEqual(Object.keys(ld.organizer), ["@type", "name", "url"]);
  assert.deepEqual(Object.keys(ld.performer), ["@type", "name"]);
  assert.equal(gameEventJsonLd({ ...base, host_name: "" }, { id: TURF_GAME, now: NOW }).performer.name, "TapTurf host", "as the organizer has always said");
});

// ── /games ──

test("/games: each item gets organizer (with url), performer, image, description, eventStatus and attendance mode", () => {
  const list = gamesJsonLd([base, typed], new Map([[HOST, "ravi_k"]]), NOW);
  const [turf, venue] = list.itemListElement.map((x) => x.item);
  assert.deepEqual(turf.organizer, { "@type": "Person", name: "Ravi Kumar", url: `${SITE}/u/ravi_k` });
  assert.deepEqual(turf.performer, { "@type": "Person", name: "Ravi Kumar" });
  assert.equal(turf.description, "Join a Box Cricket game at Kings Arena on TapTurf.");
  assert.equal(turf.eventStatus, "https://schema.org/EventScheduled");
  assert.equal(turf.eventAttendanceMode, "https://schema.org/OfflineEventAttendanceMode");
  assert.ok(turf.image.length === 3 && turf.image.every(isSiteUrl));
  assert.deepEqual(turf.image, gameEventJsonLd(base, { id: TURF_GAME, now: NOW }).image, "the same cards as the game page");
  assert.equal(venue.organizer.url, `${SITE}/u/ravi_k`, "keyed by the host's account, not the game");
  const other = gamesJsonLd([{ ...base, creator_id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000009" }], new Map([[HOST, "ravi_k"]]), NOW).itemListElement[0].item;
  assert.equal(other.organizer.url, `${SITE}${TURF_PATH}`, "a host with no profile: the game page");
});

test("/games: a typed venue's item has its Place with PostalAddress (it had none) and its own name", () => {
  const venue = gamesJsonLd([typed], new Map(), NOW).itemListElement[0].item;
  assert.deepEqual(venue.location, {
    "@type": "Place",
    name: "Shivaji Maidan",
    address: { "@type": "PostalAddress", streetAddress: "Behind Ganesh Temple, Baner Road", addressLocality: "Pune", addressRegion: "Maharashtra", addressCountry: "IN" },
  });
  assert.equal(venue.name, "Football at Shivaji Maidan", "was \"Football at a local turf\"");
  // A town TapTurf has no city for: the host's words as the locality, no state.
  const wai = gamesJsonLd([{ ...typed, venue_city: "Wai", venue_area: null }], new Map(), NOW).itemListElement[0].item;
  assert.deepEqual(wai.location?.address, { "@type": "PostalAddress", streetAddress: "Behind Ganesh Temple, Baner Road", addressLocality: "Wai", addressRegion: undefined, addressCountry: "IN" });
});

test("/games: a normal turf game's item is unchanged but for the added keys, the list keeps its shape and the first 20 (snapshot)", () => {
  const list = gamesJsonLd([base], new Map(), NOW);
  const added = ["description", "image", "eventStatus", "eventAttendanceMode", "organizer", "performer"];
  assert.equal(without(list.itemListElement[0].item, added), JSON.stringify(legacyListItem(base)));
  assert.deepEqual(Object.keys(list), ["@context", "@type", "itemListElement"]);
  assert.deepEqual(Object.keys(list.itemListElement[0]), ["@type", "position", "item"]);
  const many = Array.from({ length: 25 }, (_, i) => ({ ...base, id: `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}` }));
  const l25 = gamesJsonLd(many, new Map(), NOW).itemListElement;
  assert.equal(l25.length, 20);
  assert.deepEqual(l25.map((x) => x.position), Array.from({ length: 20 }, (_, i) => i + 1));
  const v = /\?v=([0-9a-z]+)$/.exec(list.itemListElement[0].item.image[0])![1];
  assert.deepEqual(JSON.parse(JSON.stringify(list.itemListElement[0].item)), {
    "@type": "SportsEvent",
    "@id": `${SITE}${TURF_PATH}`,
    name: "Box Cricket at Kings Arena",
    description: "Join a Box Cricket game at Kings Arena on TapTurf.",
    image: [`${SITE}/api/og/game/${TURF_GAME}?v=${v}`, `${SITE}/api/og/game/${TURF_GAME}/4x3?v=${v}`, `${SITE}/api/og/game/${TURF_GAME}/1x1?v=${v}`],
    startDate: "2026-11-07T19:00:00+05:30",
    endDate: "2026-11-07T21:00:00+05:30",
    sport: "Box Cricket",
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: "Kings Arena", address: "Survey 12, Baner, Pune" },
    organizer: { "@type": "Person", name: "Ravi Kumar", url: `${SITE}${TURF_PATH}` },
    performer: { "@type": "Person", name: "Ravi Kumar" },
    offers: { "@type": "Offer", price: 150, priceCurrency: "INR", availability: "https://schema.org/InStock" },
    maximumAttendeeCapacity: 12,
    remainingAttendeeCapacity: 4,
  });
});
