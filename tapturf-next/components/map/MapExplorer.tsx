"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Flame, Loader2, LocateFixed, Map as MapIcon, RotateCw, TrendingUp, X } from "lucide-react";
import { TurfCard } from "@/components/turf/TurfCard";
import { GameCard } from "@/components/game/GameCard";
import { PickCard, asGame } from "./PickCard";
import type { Engine, Padding, Pin } from "./engine";
import { fromMapTurf, gamePin, pickedGames, turfHourly, turfPin, type MapGame, type MapTurfWire } from "@/lib/map/data";
import { heatFeatures, parseHeat, type HeatWire } from "@/lib/map/heat";
import { enoughTrending, parseTrending, trendFirst, trendWords, type TrendWire } from "@/lib/map/trending";
import { MAP_COLORS } from "@/lib/map/clusters";
import {
  INDIA_BOUNDS,
  boundsParam,
  chipsFor,
  cityBounds,
  countLine,
  inBounds,
  inView,
  mapSearch,
  matchesChip,
  padBounds,
  parseMapQuery,
  parseSnapshot,
  type Bounds,
  type MapQuery,
  type MapShow,
  type MapSnapshot,
} from "@/lib/map/view";
import { SPORT_CHIPS } from "@/lib/turfList/query";
import { isCity, labelFor } from "@/lib/city";
import { getUserLocation, haversineKm, type Coords } from "@/lib/utils/location";
import { filterNonExpiredGames } from "@/lib/utils/game";
import { sportLabel } from "@/lib/utils/sport";
import type { CardSport } from "@/lib/utils/cardSport";
import type { Turf } from "@/types/turf";

/** The phone sheet's closed height: its handle and "N turfs in this area". */
const PEEK = 76;
/** The sheet's top (and the bar's) below the frame's top. */
const TOP_GAP = 12;
/** Room between the bar and the sheet pulled all the way up. */
const BAR_GAP = 8;
/** Cards the list shows at first, and adds per "Show more". */
const PAGE = 12;
const DESKTOP = "(min-width: 768px)";
/** The key of this page's snapshot in history.state (MapSnapshot). */
const SNAP = "ttMap";
/** Games older than this when the tab comes back (or the clock ticks) are fetched again. */
const GAMES_STALE_MS = 5 * 60_000;
/** Trending older than this when it is turned on again is fetched again (the route's answer lives 10 minutes). */
const TREND_STALE_MS = 15 * 60_000;

type Sheet = MapSnapshot["sheet"];

async function getJson<T>(url: string, signal: AbortSignal, pickOut: (j: unknown) => T): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return pickOut(await r.json());
}

/** history.state without this page's snapshot. */
function withoutSnap(st: Record<string, unknown>): Record<string, unknown> {
  const out = { ...st };
  delete out[SNAP];
  return out;
}

function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * /map: every turf (or open game) on a street map of India, Airbnb style.
 * Pins cluster into count bubbles that split as the map zooms in (a turf
 * bubble also says the average hourly price of its turfs that list one),
 * and become price pills (cardPrice: a sport chip shows only that sport's
 * price) or, for games, green "when" pills; a tap opens the place's card.
 * "Popular" lays a heatmap of turf page views under the pins (GET
 * /api/map/heat, fetched only when it is first turned on; off on every visit).
 * "Trending" marks the turfs most viewed in the last 24 hours, by rank, on
 * their pins, their bubbles and their cards, and leads the list with them
 * (GET /api/map/trending, fetched only when it is turned on; off on every
 * visit; when too few turfs trend it says there are not enough views yet).
 * The list beside the map (desktop) or in the sheet over it (phones) is
 * what is in view, top rated first, or nearest first once the viewer taps
 * "Near me" (GPS only on that tap; the point stays on the device). The
 * view, the toggle and the chip live in the URL (?b=, ?show=games,
 * ?sport=; ?city= and the turf list's Map button open on a city), written
 * with replaceState, so a reload or a shared link opens the same map and
 * Back leaves the page; except a view found with "Near me", which is
 * centred on the viewer and never goes into the URL. Opening a card keeps
 * the rest (sheet, list length and scroll, picked card, that view, Popular
 * and Trending) in this page's history entry, so Back finds the list as it
 * was.
 *
 * Data: GET /api/map/turfs and /api/map/games (lib/map/data.ts), each one
 * CDN-cached JSON. The map library and the street map load only here, after
 * the page is up (engine.ts): the server HTML is the frame, the bars and
 * an empty list.
 */
export function MapExplorer() {
  const frameRef = useRef<HTMLDivElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  /** The Popular and Trending legends under the phone bar, for the camera to keep clear of too. */
  const legendRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const query = useRef<MapQuery | null>(null);
  /** This history entry's snapshot (Back from a card's page), read once. */
  const snap = useRef<MapSnapshot | null>(null);
  /** The page's own path, so a write after the viewer left never lands on another page's URL. */
  const mapPath = useRef("/map");
  /** The viewer moved the map (or tapped a bubble): from then on the URL follows the view. */
  const touched = useRef(false);
  /** The view came from "Near me" on this entry: from then on it stays out of the URL. */
  const gps = useRef(false);
  const fitted = useRef(false);
  const desktopRef = useRef(false);
  /** The marker a card was opened from, for focus when it closes; and whether focus goes into the card. */
  const opener = useRef<HTMLElement | null>(null);
  const focusCard = useRef(false);
  /** The list's scroll to restore after Back, once its cards are in. */
  const restoreTop = useRef<number | null>(null);
  /** When the games last arrived. */
  const gamesAt = useRef(0);

  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);
  const [parsed, setParsed] = useState(false);
  const [ready, setReady] = useState(false);
  const [styleError, setStyleError] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [show, setShow] = useState<MapShow>("turfs");
  const [sport, setSport] = useState<string | null>(null);
  const [view, setView] = useState<Bounds>(INDIA_BOUNDS);
  const [turfs, setTurfs] = useState<Turf[] | null>(null);
  const [games, setGames] = useState<MapGame[] | null>(null);
  const [failed, setFailed] = useState({ turfs: false, games: false });
  const [attempt, setAttempt] = useState(0);
  const [gamesRev, setGamesRev] = useState(0);
  /** The clock games expire by (30 minutes after kickoff, as on /games), ticking each minute. */
  const [now, setNow] = useState(() => Date.now());
  const [me, setMe] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const [pick, setPick] = useState<string[] | null>(null);
  const [sheet, setSheet] = useState<Sheet>("peek");
  const [frameH, setFrameH] = useState(0);
  const [barH, setBarH] = useState(0);
  /** The map credit's height (it folds to an "i" once the map is dragged), for the Ask pill's lift. */
  const [creditH, setCreditH] = useState(0);
  const [more, setMore] = useState<{ key: string; n: number }>({ key: "", n: PAGE });
  /** The list's length from a snapshot, until the viewer moves the map or changes a filter. */
  const [restoreN, setRestoreN] = useState<number | null>(null);
  /** The "Popular" layer: on (turfs only), its points once fetched (only after the first tap), and whether that failed. */
  const [heatOn, setHeatOn] = useState(false);
  const [heat, setHeat] = useState<HeatWire[] | null>(null);
  const [heatFailed, setHeatFailed] = useState(false);
  const [heatTry, setHeatTry] = useState(0);
  /** "Trending" (turfs only): on, its ranks once fetched (empty when too few turfs trend), whether that failed, and when they came. */
  const [trendOn, setTrendOn] = useState(false);
  const [trend, setTrend] = useState<TrendWire[] | null>(null);
  const [trendFailed, setTrendFailed] = useState(false);
  const [trendTry, setTrendTry] = useState(0);
  const trendAt = useRef(0);

  useEffect(() => {
    desktopRef.current = desktop;
  }, [desktop]);

  // The URL's view (or this entry's snapshot), once, before the first paint after hydration; and the page stops scrolling under the map.
  useLayoutEffect(() => {
    const start = () => {
      const q = parseMapQuery(location.search);
      const s = parseSnapshot((window.history.state as Record<string, unknown> | null)?.[SNAP]);
      query.current = q;
      snap.current = s;
      mapPath.current = location.pathname;
      setShow(q.show);
      setSport(q.sport);
      setView(s?.b ?? q.b ?? (q.city ? cityBounds(q.city, []) : null) ?? INDIA_BOUNDS);
      if (s) {
        gps.current = s.gps;
        setSheet(s.sheet);
        setPick(s.pick);
        setRestoreN(s.n > PAGE ? s.n : null);
        restoreTop.current = s.top || null;
        setHeatOn(s.heat);
        setTrendOn(s.trend);
      }
      setParsed(true);
    };
    start();
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = was;
    };
  }, []);

  // The data: every turf and every open game, each one cached JSON.
  useEffect(() => {
    const ctrl = new AbortController();
    getJson("/api/map/turfs", ctrl.signal, (j) => ((j as { turfs?: MapTurfWire[] }).turfs ?? []).map(fromMapTurf))
      .then((t) => {
        setTurfs(t);
        setFailed((f) => ({ ...f, turfs: false }));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed((f) => ({ ...f, turfs: true }));
      });
    return () => ctrl.abort();
  }, [attempt]);
  // Games again when they are a few minutes old (the ones on screen stay until the new ones are in).
  useEffect(() => {
    const ctrl = new AbortController();
    getJson("/api/map/games", ctrl.signal, (j) => (j as { games?: MapGame[] }).games ?? [])
      .then((g) => {
        gamesAt.current = Date.now();
        setGames(g);
        setFailed((f) => ({ ...f, games: false }));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed((f) => ({ ...f, games: true }));
      });
    return () => ctrl.abort();
  }, [attempt, gamesRev]);

  // The clock: each minute, and when the tab comes back; a game that started half an hour ago leaves the map.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const t = Date.now();
      setNow(t);
      if (gamesAt.current && t - gamesAt.current > GAMES_STALE_MS) {
        gamesAt.current = t;
        setGamesRev((r) => r + 1);
      }
    };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // The frame's height and the phone bar's, for the phone sheet's stops.
  useEffect(() => {
    const el = frameRef.current;
    const bar = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setFrameH(el.clientHeight);
      setBarH(bar?.offsetHeight ?? 0);
    });
    ro.observe(el);
    if (bar) ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const writeUrl = useCallback((patch: Partial<MapQuery>) => {
    const q = query.current;
    if (!q) return;
    const next = { ...q, ...patch };
    query.current = next;
    // Never once the viewer has left: a tap on a card navigates first, and the
    // map's last moveend (it resizes as the page goes) would put ?b= on the turf page.
    if (location.pathname !== mapPath.current) return;
    const s = mapSearch(next, location.search);
    // A move or a filter after Back spends the snapshot: from here the URL says where the map is.
    const st = window.history.state as Record<string, unknown> | null;
    const spent = !!st && SNAP in st;
    if (s !== location.search || spent) window.history.replaceState(st && withoutSnap(st), "", location.pathname + s + location.hash);
  }, []);

  /** Keep where the viewer is in this history entry, for Back from the page a link opens. */
  const keepSnapshot = (n: number) => {
    if (location.pathname !== mapPath.current) return;
    const st = (window.history.state ?? {}) as Record<string, unknown>;
    const s: MapSnapshot = { b: engine.current?.view().bounds ?? view, gps: gps.current, sheet, n, top: scrollerRef.current?.scrollTop ?? 0, pick, heat: heatOn, trend: trendOn };
    window.history.replaceState({ ...st, [SNAP]: s }, "", location.href);
  };

  const padding = useCallback((): Padding => {
    if (desktopRef.current) return { top: 48, bottom: 48, left: 48, right: 48 };
    const bar = barRef.current?.offsetHeight ?? 96;
    const legend = legendRef.current?.offsetHeight ?? 0;
    // The map's credit rides on the sheet once the map is up (it folds to an "i" after a drag).
    const credit = mapEl.current?.querySelector<HTMLElement>(".maplibregl-ctrl-bottom-left")?.offsetHeight ?? 0;
    return { top: bar + 20 + (legend ? legend + 10 : 0), bottom: PEEK + 20 + credit, left: 24, right: 24 };
  }, []);

  // The map, once the URL is read: MapLibre and the street map load now, never before.
  useEffect(() => {
    if (!parsed) return;
    let dead = false;
    const q = query.current;
    const s = snap.current;
    const first = s?.b ?? q?.b ?? (q?.city ? cityBounds(q.city, []) : null) ?? INDIA_BOUNDS;
    import("./engine")
      .then(({ createEngine }) => {
        if (dead || !mapEl.current) return;
        try {
          engine.current = createEngine(mapEl.current, {
            bounds: first,
            exact: !!s || (!!q?.b && !q.city),
            padding,
            zoomButtons: window.matchMedia(DESKTOP).matches,
            onView: (b, _zoom, byUser) => {
              setView(b);
              if (byUser) {
                touched.current = true;
                setRestoreN(null);
              }
              // A view found with "Near me" is centred on the viewer: it never goes into the URL (or a shared link, or analytics).
              if (touched.current) writeUrl(gps.current ? { b: null, city: null } : { b, city: null });
            },
            onPick: (keys, from, keyboard) => {
              const some = keys && keys.length ? keys : null;
              setPick(some);
              opener.current = some ? (from ?? null) : null;
              focusCard.current = !!some && !!keyboard;
              if (some) setSheet("peek");
            },
            onStyleError: () => setStyleError(true),
          });
          setView(engine.current.view().bounds);
          setReady(true);
        } catch (e) {
          console.warn("map: could not start", e);
          setMapError(true);
        }
      })
      .catch((e) => {
        console.warn("map: could not load", e);
        if (!dead) setMapError(true);
      });
    return () => {
      dead = true;
      engine.current?.destroy();
      engine.current = null;
      setReady(false);
    };
  }, [parsed, padding, writeUrl]);

  // The map credit's height, as it folds and unfolds.
  useEffect(() => {
    const credit = ready ? mapEl.current?.querySelector<HTMLElement>(".maplibregl-ctrl-bottom-left") : null;
    if (!credit || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setCreditH(credit.offsetHeight));
    ro.observe(credit);
    return () => ro.disconnect();
  }, [ready]);

  // A ?city= link without a view: around that city's turfs, once they are here.
  useEffect(() => {
    if (!ready || !turfs || fitted.current) return;
    fitted.current = true;
    const q = query.current;
    if (!q?.city || q.b || touched.current || snap.current) return;
    const b = cityBounds(q.city, turfs);
    if (b) engine.current?.fitTo(b, false);
  }, [ready, turfs]);

  const chip = useMemo<CardSport | null>(() => (sport ? { chip: sport } : null), [sport]);
  const shownTurfs = useMemo(() => (turfs ?? []).filter((t) => matchesChip(t.sports, sport)), [turfs, sport]);
  const liveGames = useMemo(() => filterNonExpiredGames(games ?? [], now), [games, now]);
  const shownGames = useMemo(() => liveGames.filter((g) => matchesChip([sportLabel(g.sport)], sport)), [liveGames, sport]);
  const byKey = useMemo(() => new Map(shownTurfs.map((t) => [t.id, t])), [shownTurfs]);

  // The "Trending" ranks: fetched when it is turned on (a cached JSON, 10 minutes old at most), none when too few turfs trend.
  useEffect(() => {
    if (!trendOn || trend) return;
    const ctrl = new AbortController();
    getJson("/api/map/trending", ctrl.signal, (j) => enoughTrending(parseTrending(j)))
      .then((t) => {
        trendAt.current = Date.now();
        setTrend(t);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setTrendFailed(true);
      });
    return () => ctrl.abort();
  }, [trendOn, trend, trendTry]);
  const trendShown = trendOn && show === "turfs";
  /** Each trending turf's rank by its key, while Trending shows and there are some. */
  const rankByKey = useMemo(() => (trendShown && trend?.length ? new Map(trend.map((t) => [t.k, t.r])) : null), [trendShown, trend]);
  /** The trending turfs the sport chip shows, most viewed first. */
  const trendHere = useMemo(() => (rankByKey && trend ? trend.filter((t) => byKey.has(t.k)) : []), [rankByKey, trend, byKey]);

  const pins = useMemo<Pin[]>(
    () =>
      show === "games"
        ? shownGames.map((g) => ({ key: g.id, lat: g.turfs.lat, lng: g.turfs.lng, place: g.turfs.name, ...gamePin(g, now) }))
        : shownTurfs.map((t) => {
            const pin = turfPin(t, chip);
            const r = rankByKey?.get(t.id) ?? null;
            return { key: t.id, lat: t.lat as number, lng: t.lng as number, place: t.name, hourly: turfHourly(t, chip), text: pin.text, label: r ? `${pin.label}, ${trendWords(r)}` : pin.label, trend: r };
          }),
    [show, shownTurfs, shownGames, chip, now, rankByKey],
  );
  useEffect(() => {
    if (ready) engine.current?.setPins(show === "games" ? "game" : "turf", pins);
  }, [ready, show, pins]);

  // The "Popular" layer's points: fetched the first time it is turned on (a cached JSON, about an hour old at most).
  useEffect(() => {
    if (!heatOn || heat) return;
    const ctrl = new AbortController();
    getJson("/api/map/heat", ctrl.signal, parseHeat)
      .then(setHeat)
      .catch(() => {
        if (!ctrl.signal.aborted) setHeatFailed(true);
      });
    return () => ctrl.abort();
  }, [heatOn, heat, heatTry]);
  const heatShown = heatOn && show === "turfs";
  // With a sport chip, only the turfs it shows glow.
  const heatPoints = useMemo(() => (heatShown && heat ? heatFeatures(heat, sport ? (k) => byKey.has(k) : undefined) : null), [heatShown, heat, sport, byKey]);
  useEffect(() => {
    if (ready) engine.current?.setHeat(heatPoints);
  }, [ready, heatPoints]);

  const picked = useMemo(() => {
    if (!pick) return null;
    if (show === "games") {
      const list = pickedGames(pick, shownGames);
      return list.length ? { turfs: [], games: list } : null;
    }
    const list = pick.map((k) => byKey.get(k)).filter((t): t is Turf => !!t);
    return list.length ? { turfs: list, games: [] } : null;
  }, [pick, show, shownGames, byKey]);
  const one = picked && (picked.games.length === 1 ? picked.games[0] : picked.turfs.length === 1 ? picked.turfs[0] : null);
  const activeKey = one ? one.id : null;
  /** What a screen reader hears as a card opens. */
  const pickSay = !picked
    ? ""
    : picked.games.length > 1
      ? `${picked.games.length} games listed, soonest first`
      : picked.turfs.length > 1
        ? `${picked.turfs.length} turfs listed`
        : picked.games.length
          ? `Opened the game at ${picked.games[0].turfs.name}`
          : `Opened ${picked.turfs[0].name}`;
  useEffect(() => {
    if (ready) engine.current?.setActive(activeKey);
  }, [ready, activeKey, pins]);
  // Picked from the keyboard: focus goes to the card's first link.
  useEffect(() => {
    if (!picked || !focusCard.current) return;
    focusCard.current = false;
    pickRef.current?.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });
  }, [picked]);

  useEffect(() => {
    if (ready) engine.current?.setMe(me);
  }, [ready, me]);

  /** The card goes away; focus that was in it goes back to its marker (or the map). */
  const closePick = useCallback(() => {
    setPick(null);
    const el = opener.current;
    opener.current = null;
    const at = document.activeElement;
    if (at && at !== document.body && !pickRef.current?.contains(at)) return;
    if (el?.isConnected) el.focus({ preventScroll: true });
    else engine.current?.focusMap();
  }, []);

  // Escape puts the picked card away.
  useEffect(() => {
    if (!pick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePick();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pick, closePick]);

  // With Trending on, the trending turfs in view lead the list, most viewed first.
  const turfList = useMemo(() => {
    const list = inView(shownTurfs, view, (t) => ({ lat: t.lat as number, lng: t.lng as number }), me);
    return rankByKey ? trendFirst(list, (x) => rankByKey.get(x.item.id)) : list;
  }, [shownTurfs, view, me, rankByKey]);
  const gameList = useMemo(() => inView(shownGames, view, (g) => g.turfs, me), [shownGames, view, me]);
  const count = show === "games" ? gameList.length : turfList.length;
  const loading = show === "games" ? games == null && !failed.games : turfs == null && !failed.turfs;
  const loadFailed = show === "games" ? games == null && failed.games : turfs == null && failed.turfs;
  const listKey = `${show}|${sport ?? ""}|${boundsParam(view)}|${me ? "me" : ""}|${rankByKey ? "trend" : ""}`;
  const limit = more.key === listKey ? more.n : (restoreN ?? PAGE);
  /** Trending is on and its ranks are still on the way: the list is about to reorder. */
  const trendPending = trendShown && trend == null && !trendFailed;

  // Back from a card's page: the list scrolled where it was, once its cards are in (and in Trending's order, when it was on).
  useEffect(() => {
    const top = restoreTop.current;
    const el = scrollerRef.current;
    if (top == null || !el || loading || trendPending || !(ready || mapError)) return;
    restoreTop.current = null;
    if (window.matchMedia(DESKTOP).matches || sheet !== "peek") el.scrollTop = top;
  }, [loading, trendPending, ready, mapError, sheet, count]);

  const chips = useMemo(() => {
    const all = show === "games" ? chipsFor(SPORT_CHIPS, liveGames.map((g) => [sportLabel(g.sport)])) : chipsFor(SPORT_CHIPS, (turfs ?? []).map((t) => t.sports));
    return sport && !all.includes(sport) ? [sport, ...all] : all;
  }, [show, sport, liveGames, turfs]);

  const setMode = (next: MapShow) => {
    if (next === show) return;
    setShow(next);
    setPick(null);
    setRestoreN(null);
    writeUrl({ show: next });
  };
  const setChip = (next: string | null) => {
    setSport(next);
    setRestoreN(null);
    writeUrl({ sport: next });
  };

  const locate = async () => {
    setLocating(true);
    setLocError("");
    try {
      const at = await getUserLocation();
      if (!Number.isFinite(at.lat) || !Number.isFinite(at.lng)) throw new Error("bad location");
      setMe(at);
      setRestoreN(null);
      // The map is about to centre on the viewer: from here its view stays out of the URL.
      gps.current = true;
      writeUrl({ b: null, city: null });
      engine.current?.flyTo(at, 12.5);
    } catch (err) {
      const code = (err as { code?: number })?.code;
      setLocError(
        code === 1
          ? "Location is blocked. Allow it in your browser's site settings, then try again."
          : code === 3
            ? "Finding your location took too long. Try again."
            : "Couldn't find your location. Try again outdoors or with GPS on.",
      );
    } finally {
      setLocating(false);
    }
  };

  // ── phone sheet ──
  const sheetH = Math.max(0, frameH - TOP_GAP);
  const half = Math.round(sheetH * 0.45);
  // Pulled all the way up it stops under the bar, so the toggle, the chips and Near me stay in reach.
  const stops = { peek: Math.max(0, sheetH - PEEK), half, full: Math.min(half, barH ? barH + BAR_GAP : 0) };
  const sheetY = frameH ? `${stops[sheet]}px` : `calc(100% - ${PEEK}px)`;
  const drag = useRef<{ y0: number; t0: number; from: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const onSheetDown = (e: React.PointerEvent) => {
    if (desktop || !frameH) return;
    drag.current = { y0: e.clientY, t0: performance.now(), from: stops[sheet], y: stops[sheet], moved: false };
    dragged.current = false;
  };
  const onSheetMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) < 6) return;
    if (!d.moved) {
      d.moved = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      el.dataset.drag = "1";
    }
    d.y = Math.min(stops.peek, Math.max(stops.full, d.from + dy));
    el.style.setProperty("--sheet-y", `${d.y}px`);
  };
  const onSheetUp = () => {
    const d = drag.current;
    const el = sheetRef.current;
    drag.current = null;
    if (!d || !d.moved || !el) return;
    dragged.current = true;
    delete el.dataset.drag;
    // Where it would come to rest, a fling carrying it on.
    const v = (d.y - d.from) / Math.max(1, performance.now() - d.t0);
    const rest = d.y + v * 180;
    const next = (Object.keys(stops) as Sheet[]).reduce((a, b) => (Math.abs(stops[b] - rest) < Math.abs(stops[a] - rest) ? b : a));
    el.style.setProperty("--sheet-y", `${stops[next]}px`);
    setSheet(next);
  };
  const onSheetTap = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setSheet((s) => (s === "peek" ? "half" : "peek"));
  };

  // What sits over the map's bottom edge on a phone: the sheet's handle, and the picked card above it.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const frame = frameRef.current;
    if (desktop) {
      root.style.removeProperty("--ask-lift");
      frame?.style.setProperty("--tt-inset", "0px");
      return;
    }
    const card = pickRef.current?.offsetHeight ?? 0;
    const edge = sheet === "peek" ? PEEK + (card ? card + 12 : 0) : sheetH - stops[sheet];
    // The map's credit rides on top of that; with the list pulled all the way up the map is covered, and its credit with it.
    frame?.style.setProperty("--tt-inset", `${sheet === "full" ? 0 : edge}px`);
    // The Ask pill sits 4.75rem up; lift it clear of the handle, the card and the credit (over the list it may float).
    if (sheet === "peek") root.style.setProperty("--ask-lift", `${Math.max(0, edge + creditH + 8 - 20)}px`);
    else root.style.removeProperty("--ask-lift");
    return () => {
      root.style.removeProperty("--ask-lift");
    };
  });

  const cityOf = (t: { city?: string | null }) => (t.city && isCity(t.city) ? labelFor(t.city) : undefined);
  const zoomOut = () => {
    touched.current = true;
    setRestoreN(null);
    engine.current?.fitTo(INDIA_BOUNDS);
  };

  const toggleTrend = () => {
    // Turned on again after a while: the ranks are fetched afresh.
    if (!trendOn && trend && Date.now() - trendAt.current > TREND_STALE_MS) setTrend(null);
    setTrendOn(!trendOn);
    setTrendFailed(false);
    setRestoreN(null);
  };
  /** No trending turf in view: the map moves to show them all, with room for their bubbles' tags at the edges. */
  const trendInView = trendHere.some((t) => inBounds({ lat: t.y, lng: t.x }, view));
  const showTrending = () => {
    if (!trendHere.length) return;
    const xs = trendHere.map((t) => t.x);
    const ys = trendHere.map((t) => t.y);
    touched.current = true;
    setRestoreN(null);
    engine.current?.fitTo(padBounds([Math.min(...xs) - 0.02, Math.min(...ys) - 0.02, Math.max(...xs) + 0.02, Math.max(...ys) + 0.02], 0.18));
  };

  const bar = (
    <>
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Show on the map" className="flex p-1 rounded-full bg-white shadow-soft border border-primary-200/80 md:shadow-none md:bg-primary-100 md:border-0">
          {(["turfs", "games"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={show === m}
              onClick={() => setMode(m)}
              className={`h-9 px-4 rounded-full text-[14px] font-semibold transition-colors cursor-pointer focus-neon ${
                show === m ? "bg-primary-900 text-white" : "text-primary-700 hover:text-primary-900"
              }`}
            >
              {m === "turfs" ? "Turfs" : "Games"}
              {m === "games" && liveGames.length > 0 && (
                <span className={`ml-1.5 tabular-nums ${show === m ? "text-white/80" : "text-accent-700"}`}>{liveGames.length}</span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          aria-label={me ? "Near me (location on)" : "Near me"}
          className={`ml-auto h-11 px-3.5 inline-flex items-center gap-1.5 rounded-full text-[14px] font-semibold cursor-pointer disabled:opacity-70 focus-neon bg-white shadow-soft border border-primary-200/80 md:shadow-none ${
            me ? "text-[#2563eb]" : "text-primary-900"
          }`}
        >
          {locating ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <LocateFixed className="w-4 h-4" aria-hidden />}
          <span>Near me</span>
        </button>
      </div>
      {chips.length > 0 && (
        <div className="-mx-3 px-3 md:mx-0 md:px-0 mt-2 flex gap-2 overflow-x-auto scrollbar-hide pointer-events-auto">
          {/* The "Popular" layer and "Trending" (turfs only), ahead of the sport chips. */}
          {show === "turfs" && (
            <>
              <button
                type="button"
                aria-pressed={heatOn}
                onClick={() => {
                  setHeatOn((on) => !on);
                  setHeatFailed(false);
                }}
                title="Where turfs get the most views"
                style={heatOn ? { backgroundColor: MAP_COLORS.deep } : undefined}
                className={`shrink-0 h-9 pl-3 pr-4 inline-flex items-center gap-1.5 rounded-full text-[14px] font-medium transition-colors cursor-pointer focus-neon ${
                  heatOn ? "text-white" : "bg-white text-primary-900 shadow-soft border border-primary-200/80 md:shadow-none md:border-0 md:bg-primary-100 hover:bg-primary-100 md:hover:bg-primary-200"
                }`}
              >
                <Flame className="w-4 h-4" style={{ color: heatOn ? "#FFC266" : MAP_COLORS.hot }} strokeWidth={2.25} aria-hidden />
                Popular
              </button>
              <button
                type="button"
                aria-pressed={trendOn}
                onClick={toggleTrend}
                title="The turfs most viewed in the last 24 hours"
                style={trendOn ? { backgroundColor: MAP_COLORS.trend } : undefined}
                className={`shrink-0 h-9 pl-3 pr-4 inline-flex items-center gap-1.5 rounded-full text-[14px] font-medium transition-colors cursor-pointer focus-neon ${
                  trendOn ? "text-white" : "bg-white text-primary-900 shadow-soft border border-primary-200/80 md:shadow-none md:border-0 md:bg-primary-100 hover:bg-primary-100 md:hover:bg-primary-200"
                }`}
              >
                <TrendingUp className="w-4 h-4" style={{ color: trendOn ? "#FFFFFF" : MAP_COLORS.trend }} strokeWidth={2.5} aria-hidden />
                Trending
              </button>
              <span className="shrink-0 w-px my-1.5 bg-primary-200" aria-hidden />
            </>
          )}
          <div className="shrink-0 flex gap-2" role="group" aria-label="Sport">
            {[null, ...chips].map((c) => {
              const on = sport === c;
              return (
                <button
                  key={c ?? "all"}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChip(c && sport === c ? null : c)}
                  className={`shrink-0 h-9 px-4 rounded-full text-[14px] font-medium transition-colors cursor-pointer focus-neon ${
                    on ? "bg-primary-900 text-white" : "bg-white text-primary-900 shadow-soft border border-primary-200/80 md:shadow-none md:border-0 md:bg-primary-100 hover:bg-primary-100 md:hover:bg-primary-200"
                  }`}
                >
                  {c ?? "All sports"}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {locError && (
        <p role="alert" className="mt-2 flex items-start gap-2 rounded-xl bg-white md:bg-primary-100 shadow-soft md:shadow-none px-3 py-2 text-[13px] text-primary-900 pointer-events-auto">
          <span className="flex-1">{locError}</span>
          <button type="button" onClick={() => setLocError("")} aria-label="Dismiss" className="text-primary-400 hover:text-primary-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </p>
      )}
    </>
  );

  const countText = loading ? `Loading ${show}` : loadFailed ? `Couldn't load ${show}` : countLine(count, show);

  const list = (
    <div>
      {loadFailed ? (
        <div className="py-10 text-center">
          <p className="text-[15px] text-primary-700">Couldn&apos;t load the {show}. Check your connection.</p>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-3 h-11 px-5 inline-flex items-center gap-2 rounded-full bg-primary-900 text-white text-[15px] font-semibold cursor-pointer press-tight"
          >
            <RotateCw className="w-4 h-4" aria-hidden />
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-5 gap-y-7" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="animate-pulse">
              <div className="w-full aspect-[4/3] rounded-2xl bg-primary-100" />
              <div className="pt-3 space-y-2">
                <div className="h-4 w-3/4 rounded bg-primary-100" />
                <div className="h-3.5 w-1/2 rounded bg-primary-100" />
              </div>
            </div>
          ))}
        </div>
      ) : count === 0 ? (
        <div className="py-10 text-center">
          <p className="text-[15px] text-primary-700">
            {show === "games" ? "No open games here right now." : "No turfs here."} Zoom out or move the map.
          </p>
          <button type="button" onClick={zoomOut} className="mt-3 h-11 px-5 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white text-[15px] font-semibold text-primary-900 hover:border-primary-900 cursor-pointer press-tight focus-neon">
            Show all of India
          </button>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 xl:grid-cols-2 gap-x-5 gap-y-7">
            {show === "games"
              ? gameList.slice(0, limit).map(({ item: g }) => (
                  <li key={g.id} onMouseEnter={() => engine.current?.setHot(g.id)} onMouseLeave={() => engine.current?.setHot(null)}>
                    <GameCard game={asGame(g)} cityLabel={cityOf(g.turfs)} />
                  </li>
                ))
              : turfList.slice(0, limit).map(({ item: t, km }) => (
                  <li key={t.id} onMouseEnter={() => engine.current?.setHot(t.id)} onMouseLeave={() => engine.current?.setHot(null)}>
                    <TurfCard turf={t} distanceKm={km} cityLabel={cityOf(t)} sport={chip} trendRank={rankByKey?.get(t.id) ?? null} />
                  </li>
                ))}
          </ul>
          {count > limit && (
            <div className="mt-8 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setMore({ key: listKey, n: limit + PAGE })}
                className="press-tight h-12 min-w-[200px] px-6 inline-flex items-center justify-center rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[15px] font-semibold cursor-pointer"
              >
                Show {Math.min(PAGE, count - limit)} more
              </button>
              <p className="text-[13px] text-primary-500 tabular-nums">
                Showing {limit.toLocaleString("en-IN")} of {count.toLocaleString("en-IN")}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div
      ref={frameRef}
      onClickCapture={(e) => {
        // A link out (a card, a picked card): Back should find the map as it is now.
        if ((e.target as Element).closest?.("a[href]")) keepSnapshot(limit);
      }}
      className="tt-map fixed inset-x-0 top-[calc(3.5rem+1px)] md:top-[calc(4rem+1px)] bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 z-20 flex bg-[#f2f3f0] overflow-hidden"
    >
      <h1 className="sr-only">Map of turfs and open games</h1>

      {/* Phones: the bar floats over the map (first in the page, so the keyboard reaches it first). */}
      <div ref={barRef} className="md:hidden absolute top-3 inset-x-3 z-10 pointer-events-none [&>*]:pointer-events-auto">
        {bar}
      </div>

      {/* The list: a side panel on desktop, a sheet over the map on phones. */}
      <section
        ref={sheetRef}
        aria-label={show === "games" ? "Games in this area" : "Turfs in this area"}
        style={{ "--sheet-y": sheetY, "--list-pad": frameH ? `${stops[sheet]}px` : "0px" } as React.CSSProperties}
        className="max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:top-3 max-md:z-30 max-md:rounded-t-3xl max-md:shadow-[0_-4px_24px_rgba(15,23,42,0.14)] max-md:[translate:0_var(--sheet-y)] max-md:transition-[translate] max-md:duration-300 max-md:ease-out max-md:data-[drag]:transition-none md:relative md:w-[380px] lg:w-[440px] xl:w-[640px] md:shrink-0 md:border-r md:border-primary-200 bg-white flex flex-col min-h-0"
      >
        {/* Phones: the handle. Drag it, or tap it to open or close the list. Its touch-action is inline: the
            global button rule (manipulation, unlayered) beats a layered utility, and would turn a drag into a pan. */}
        <button
          type="button"
          onClick={onSheetTap}
          onPointerDown={onSheetDown}
          onPointerMove={onSheetMove}
          onPointerUp={onSheetUp}
          onPointerCancel={onSheetUp}
          aria-expanded={sheet !== "peek"}
          style={{ touchAction: "none" }}
          className="md:hidden shrink-0 w-full h-[76px] flex flex-col items-center pt-2.5 cursor-grab select-none focus-neon rounded-t-3xl"
        >
          <span className="w-10 h-1.5 rounded-full bg-primary-300" aria-hidden />
          <span className="mt-3.5 text-[16px] font-semibold text-primary-900 tabular-nums" aria-live="polite">
            {countText}
          </span>
        </button>

        <div className="hidden md:block shrink-0 px-6 pt-5 pb-3 border-b border-primary-100">
          {bar}
          <p className="mt-4 text-[15px] font-semibold text-primary-900 tabular-nums" aria-live="polite">
            {countText}
          </p>
        </div>

        {/* A closed phone sheet shows only its count: its cards (and their photos) wait until it opens. */}
        <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 md:px-6 pt-1 md:pt-5 pb-8 max-md:pb-[calc(var(--list-pad)+2rem)]">
          {(desktop || sheet !== "peek") && list}
        </div>

        {/* Phones, list pulled all the way up: back to the map. */}
        {sheet === "full" && (
          <button
            type="button"
            onClick={() => setSheet("peek")}
            className="md:hidden absolute bottom-[calc(var(--list-pad)+1.25rem)] left-1/2 -translate-x-1/2 h-12 px-5 inline-flex items-center gap-2 rounded-full bg-primary-900 text-white text-[15px] font-semibold shadow-elevated cursor-pointer press-tight"
          >
            <MapIcon className="w-4 h-4" aria-hidden />
            Map
          </button>
        )}
      </section>

      {/* The map's credit (OpenFreeMap, OpenStreetMap) rides above the phone sheet and the card: important,
          as maplibre-gl.css's own bottom: 0 is unlayered and would beat a layered utility. */}
      <div
        className="relative flex-1 min-w-0 [&_.maplibregl-ctrl-bottom-left]:bottom-[var(--tt-inset,0px)]! [&_.maplibregl-ctrl-bottom-left]:transition-[bottom] [&_.maplibregl-ctrl-bottom-left]:duration-300"
      >
        {/* MapLibre makes its container position: relative, so the box that fills the frame is this wrapper. */}
        <div className="absolute inset-0">
          <div ref={mapEl} className="w-full h-full" />
        </div>

        {/* Phones: a soft white fade under the floating bar, so a bubble that slides under it fades out
            instead of peeking between the chips. Over the markers, under the bar; taps go through. */}
        <div
          aria-hidden
          className="md:hidden absolute inset-x-0 top-0 z-[5] pointer-events-none bg-[linear-gradient(to_bottom,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.88)_62%,rgba(255,255,255,0)_100%)]"
          style={{ height: barH ? barH + TOP_GAP + 18 : 120 }}
        />

        {(heatShown || trendShown) && (
          <div
            ref={legendRef}
            className="absolute z-10 left-3 right-3 md:right-auto md:left-1/2 md:-translate-x-1/2 md:top-4 flex flex-col items-start md:items-center gap-1.5 pointer-events-none [&>*]:pointer-events-auto"
            style={desktop ? undefined : { top: (barH || 96) + TOP_GAP + 10 }}
          >
            {heatShown && (heatFailed && !heat ? (
              <p role="status" className="h-8 pl-3 pr-1.5 inline-flex items-center gap-1 rounded-full bg-white/95 shadow-soft text-[12px] text-primary-700">
                Couldn&apos;t load popular turfs.
                <button
                  type="button"
                  onClick={() => {
                    setHeatFailed(false);
                    setHeatTry((n) => n + 1);
                  }}
                  className="h-6 px-2 rounded-full font-semibold text-primary-900 hover:bg-primary-100 cursor-pointer"
                >
                  Try again
                </button>
              </p>
            ) : !heatPoints ? (
              <p role="status" className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 shadow-soft text-[12px] text-primary-700">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                Finding popular turfs
              </p>
            ) : heatPoints.features.length === 0 ? (
              <p role="status" className="h-8 px-3 inline-flex items-center rounded-full bg-white/95 shadow-soft text-[12px] text-primary-700">
                Not enough views yet to show popular turfs{sport ? ` for ${sport}` : ""}.
              </p>
            ) : (
              <p role="status" className="h-8 px-3 inline-flex items-center gap-2 rounded-full bg-white/95 shadow-soft text-[12px] font-medium text-primary-700 whitespace-nowrap">
                <span className="sr-only">Popular turfs: turf page views over the last 30 days, from</span>
                <span aria-hidden>Fewer views</span>
                <span
                  aria-hidden
                  className="w-14 h-2 rounded-full"
                  style={{ background: `linear-gradient(90deg, ${MAP_COLORS.teal}66, ${MAP_COLORS.teal}, #FFBE50, #FF7848, ${MAP_COLORS.hot})` }}
                />
                <span aria-hidden>More</span>
                <span className="sr-only">to more.</span>
                <span className="text-primary-500" aria-hidden>
                  · 30 days
                </span>
              </p>
            ))}
            {trendShown &&
              (trendFailed && !trend ? (
                <p role="status" className="h-8 pl-3 pr-1.5 inline-flex items-center gap-1 rounded-full bg-white/95 shadow-soft text-[12px] text-primary-700">
                  Couldn&apos;t load trending turfs.
                  <button
                    type="button"
                    onClick={() => {
                      setTrendFailed(false);
                      setTrendTry((n) => n + 1);
                    }}
                    className="h-6 px-2 rounded-full font-semibold text-primary-900 hover:bg-primary-100 cursor-pointer"
                  >
                    Try again
                  </button>
                </p>
              ) : !trend ? (
                <p role="status" className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 shadow-soft text-[12px] text-primary-700">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                  Finding trending turfs
                </p>
              ) : trend.length === 0 ? (
                <p role="status" className="h-8 px-3 inline-flex items-center rounded-full bg-white/95 shadow-soft text-[12px] text-primary-700">
                  Not enough views yet to show trending turfs.
                </p>
              ) : trendHere.length === 0 ? (
                <p role="status" className="h-8 px-3 inline-flex items-center rounded-full bg-white/95 shadow-soft text-[12px] text-primary-700">
                  No {sport ? `${sport} ` : ""}turfs are trending right now.
                </p>
              ) : (
                <p role="status" className="h-8 pl-2.5 pr-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 shadow-soft text-[12px] font-medium text-primary-700 whitespace-nowrap">
                  <span className="w-5 h-5 inline-flex items-center justify-center rounded-full text-white" style={{ backgroundColor: MAP_COLORS.trend }} aria-hidden>
                    <TrendingUp className="w-3 h-3" strokeWidth={3} />
                  </span>
                  <span className="sr-only">
                    Trending: the {sport ? `${sport} ` : ""}turfs most viewed in the last 24 hours, marked on the map and first in the list.
                  </span>
                  <span aria-hidden>Most viewed · last 24 h</span>
                  {!trendInView && (
                    <button type="button" onClick={showTrending} className="-mr-1.5 h-6 px-2 rounded-full font-semibold text-primary-900 hover:bg-primary-100 cursor-pointer">
                      Show them
                    </button>
                  )}
                </p>
              ))}
          </div>
        )}

        {(styleError || mapError) && (
          <p role="status" className="absolute left-3 right-3 md:left-auto md:right-3 md:w-80 top-[7.5rem] md:top-3 z-10 rounded-xl bg-white/95 shadow-soft px-3 py-2 text-[13px] text-primary-700">
            {mapError ? "This browser can't show the map. The list still works." : "The street map couldn't load. The pins and the list still work."}
          </p>
        )}

        {picked && (
          <div ref={pickRef} className="absolute z-20 inset-x-3 bottom-[88px] md:inset-x-auto md:bottom-auto md:left-4 md:top-4 md:w-[380px]">
            <PickCard
              turfs={picked.turfs.map((t) => ({ turf: t, km: me ? haversineKm(me, { lat: t.lat as number, lng: t.lng as number }) : null, trend: rankByKey?.get(t.id) ?? null }))}
              games={picked.games.map((g) => ({ game: g, km: me ? haversineKm(me, g.turfs) : null }))}
              sport={chip}
              onClose={closePick}
            />
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {pickSay}
        </p>
      </div>
    </div>
  );
}
