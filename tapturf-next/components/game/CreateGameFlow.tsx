"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Check, MapPin, Search, Share2, Copy,
  Trophy, CircleDot, Target, Circle, Feather,
  Grip, Dumbbell, Loader2, Users, Zap, ChevronRight, Repeat as RepeatIcon, Plus,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { quietToken } from "@/lib/account/client";
import { createGame, createSeries, getMySeries, otherVenueReady } from "@/lib/queries/games";
import { getTurfPlace, searchTurfs } from "@/lib/queries/users";
import { gameShareText } from "@/lib/utils/gameShare";
import { formatGameDay, gamePlace } from "@/lib/utils/game";
import { OtherVenueForm, venueDraft, type VenueDraft } from "./OtherVenueForm";
import { MAX_RUNNING, maxGames, nextDays, normalRepeat, repeatLabel, repeatParts, repeatProblem, ruleFor, type Repeat } from "@/lib/games/repeat";
import { TimeSlotSheet } from "./TimeSlotSheet";
import { RepeatSheet } from "./RepeatSheet";
import { GameDraftBox } from "./GameDraftBox";
import { LiveScorerPromo } from "@/components/tools/LiveScorerPromo";
import { liftCookieBanner } from "@/components/consent/liftCookieBanner";
import type { GamePrefill } from "@/lib/ai/gameDraft";
import type { CreateGameData, Game, TypedVenue } from "@/types/game";

const SPORT_OPTIONS = [
  { name: "Cricket",      icon: <Target className="w-6 h-6" />,    defaultMax: 22 },
  { name: "Box Cricket",  icon: <Target className="w-6 h-6" />,    defaultMax: 12 },
  { name: "Football",     icon: <CircleDot className="w-6 h-6" />, defaultMax: 14 },
  { name: "5v5 Football", icon: <CircleDot className="w-6 h-6" />, defaultMax: 10 },
  { name: "Basketball",   icon: <Circle className="w-6 h-6" />,    defaultMax: 10 },
  { name: "Tennis",       icon: <Grip className="w-6 h-6" />,      defaultMax: 4  },
  { name: "Pickleball",   icon: <Dumbbell className="w-6 h-6" />,  defaultMax: 4  },
  { name: "Badminton",    icon: <Feather className="w-6 h-6" />,   defaultMax: 4  },
];

const SKILL_LEVELS = [
  { value: "all" as const,          short: "Any" },
  { value: "beginner" as const,     short: "Beginner" },
  { value: "intermediate" as const, short: "Mid" },
  { value: "advanced" as const,     short: "Pro" },
];

const DURATION_OPTIONS = [
  { hours: 0.5, label: "30m" },
  { hours: 1,   label: "1h"  },
  { hours: 1.5, label: "1.5h" },
  { hours: 2,   label: "2h"  },
];

const COST_OPTIONS = [0, 50, 100, 150, 200, 300, 500];

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { n: 1, label: "Sport"  },
  { n: 2, label: "When"   },
  { n: 3, label: "Squad"  },
];

function fmt(hour: number, min: number) {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h}:${min.toString().padStart(2, "0")} ${ampm}`;
}

function tv(h: number, m: number) {
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function getEndTime(startTime: string, durationHours: number): string | null {
  if (!startTime) return null;
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + durationHours * 60;
  const endH = Math.floor(total / 60);
  const endM = total % 60;
  if (endH > 23) return null;
  return tv(endH, endM);
}

/**
 * Local IST date as YYYY-MM-DD. Using toISOString on the raw Date
 * returns UTC — which for the Indian audience means "today" flips at
 * 5:30am, cutting off legitimate late-night bookings. `en-CA` returns
 * YYYY-MM-DD ordering; `timeZone: 'Asia/Kolkata'` anchors it right.
 */
function istDateISO(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Current IST wall-clock as HH:MM (24-hour). */
function istTimeHM(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Round an HH:MM string up to the next 30-minute boundary. If the
 * input lands past 23:30 we return "23:30" — the picker's last slot;
 * callers that see an empty picker after that should nudge the user
 * onto tomorrow's date instead.
 */
function roundUpToNextSlot(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return "23:30";
  let hh = h;
  let mm = m <= 0 ? 0 : m <= 30 ? 30 : 60;
  if (mm === 60) { hh += 1; mm = 0; }
  if (hh > 23 || (hh === 23 && mm > 30)) return "23:30";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function humanDate(dateStr: string): string {
  if (!dateStr) return "Pick a date";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((dt.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return dt.toLocaleDateString("en-IN", { weekday: "long" });
  return dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/** The last WhatsApp number this device gave players, 10 digits. */
const HOST_PHONE_KEY = "tapturf_host_phone_v1";

/** A typed or pasted Indian mobile number as its 10 digits: "+91 98765 43210", "919876543210" and "09876543210" all work. */
function tenDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

/** A repeat for a new first day: its rule follows the day (lib/games/repeat.ts ruleFor), "after N" no more than that rule's year holds. */
function moveRepeat(r: Repeat, start: string, oldStart: string): Repeat {
  const rule = ruleFor(r.rule, start, oldStart);
  return { rule, ends: r.ends.type === "after" ? { ...r.ends, count: Math.min(r.ends.count, maxGames(rule, start)) } : r.ends };
}

/** The number to offer: the profile's Indian number, else the one given last time. */
function defaultHostPhone(profilePhone: string | undefined): string {
  const m = /^\+91([6-9]\d{9})$/.exec(profilePhone ?? "");
  if (m) return m[1];
  try {
    const last = typeof window !== "undefined" ? localStorage.getItem(HOST_PHONE_KEY) : null;
    return last && /^[6-9]\d{9}$/.test(last) ? last : "";
  } catch {
    return "";
  }
}

export function CreateGameFlow({ liveLinks = false }: { liveLinks?: boolean } = {}) {
  const { user, login, loading: authLoading, getToken, signedInWith } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Prefill turf when the visitor arrived via "Create a game here" on
  // a turf profile — query params carry the picked turf so they don't
  // have to search for it again inside the wizard.
  const preselectedTurfId = searchParams?.get("turf") ?? "";
  const preselectedTurfName = searchParams?.get("turfName") ?? "";
  // A sentence from the Ask chat ("host box cricket Saturday 7pm at X")
  // gets drafted into the form as soon as the page loads.
  const draftText = searchParams?.get("draft") ?? "";
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdGameId, setCreatedGameId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasTriggeredLogin, setHasTriggeredLogin] = useState(false);

  const [sport, setSport] = useState("");
  const [selectedSportObj, setSelectedSportObj] = useState<typeof SPORT_OPTIONS[0] | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [turfId, setTurfId] = useState(preselectedTurfId);
  const [turfName, setTurfName] = useState(preselectedTurfName);
  // The new game's area and city, read once it is made, for the WhatsApp message.
  const [turfPlace, setTurfPlace] = useState<{ area: string | null; city: string | null } | null>(null);
  const [turfSearch, setTurfSearch] = useState("");
  const [turfResults, setTurfResults] = useState<{ id: string; name: string; address: string }[]>([]);
  // The words the results are for: "No turfs found" only for the words in the box.
  const [searchedFor, setSearchedFor] = useState("");
  const [showTurfDropdown, setShowTurfDropdown] = useState(false);
  // A venue the host typed because the turf isn't on TapTurf (then turfId is empty), and its form.
  const [venue, setVenue] = useState<TypedVenue | null>(null);
  const [venueForm, setVenueForm] = useState<VenueDraft | null>(null);
  const [venueFormOpen, setVenueFormOpen] = useState(false);
  // Whether the database takes typed venues (null: can't tell, so the row shows and the server answers).
  const [venuesOn, setVenuesOn] = useState<boolean | null>(null);
  const [skillLevel, setSkillLevel] = useState<CreateGameData["skillLevel"]>("all");
  const [costPerPerson, setCostPerPerson] = useState(100);
  const [customCost, setCustomCost] = useState("");
  const [notes, setNotes] = useState("");
  const [turfBooked, setTurfBooked] = useState(false);
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  // How the game repeats (null: it doesn't). Offered once the database has repeats (GET /api/game-series ready).
  const [repeat, setRepeat] = useState<Repeat | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeats, setRepeats] = useState<{ for: string; running: number } | null>(null);
  // The games a new repeat put up, soonest first (the success step names them).
  const [seriesGames, setSeriesGames] = useState<Game[] | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  // The turf a draft named that TapTurf didn't find: the note then points to "Add the venue".
  const [draftNotListed, setDraftNotListed] = useState<string | null>(null);
  // null until typed: then the profile's number or the last game's.
  const [hostPhoneTyped, setHostPhoneTyped] = useState<string | null>(null);
  const hostPhone = hostPhoneTyped ?? defaultHostPhone(user?.phone);
  const hostPhoneOk = hostPhone === "" || /^[6-9]\d{9}$/.test(hostPhone);

  const turfSearchRef = useRef<HTMLInputElement>(null);
  // The search and its results: a tap anywhere else closes them.
  const turfBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showTurfDropdown) return;
    const away = (e: PointerEvent) => {
      if (turfBoxRef.current && !turfBoxRef.current.contains(e.target as Node)) setShowTurfDropdown(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [showTurfDropdown]);

  const endTime = useMemo(
    () => (duration ? getEndTime(startTime, duration) : null),
    [startTime, duration]
  );

  useEffect(() => {
    if (!authLoading && !user && !hasTriggeredLogin) {
      setHasTriggeredLogin(true);
      login();
    }
  }, [authLoading, user, login, hasTriggeredLogin]);

  useEffect(() => {
    if (turfSearch.length < 2) { setTurfResults([]); setSearchedFor(""); return; }
    const timer = setTimeout(async () => {
      const { data } = await searchTurfs(turfSearch);
      setTurfResults(data);
      setSearchedFor(turfSearch);
      setShowTurfDropdown(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [turfSearch]);

  // "Add the venue" only once the database takes typed venues (20261103_game_other_venue.sql).
  useEffect(() => {
    let alive = true;
    void otherVenueReady().then((on) => alive && setVenuesOn(on));
    return () => {
      alive = false;
    };
  }, []);

  /** The typed venue's form, its name from the search (or what was typed before). */
  const openVenueForm = (seed: string) => {
    setVenueForm((d) => (d && (!seed.trim() || d.name.trim() === seed.trim()) ? d : venueDraft(seed)));
    setVenueFormOpen(true);
    setShowTurfDropdown(false);
  };
  const pickTypedVenue = (v: TypedVenue) => {
    setVenue(v);
    setTurfId("");
    setTurfName("");
    setTurfSearch("");
    setVenueFormOpen(false);
  };

  useEffect(() => {
    // Default the date picker to today (IST).
    setDate(istDateISO(new Date()));
  }, []);

  // Whether repeats are on (the database has them), and how many this host runs (3 at most).
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void getMySeries(quietToken(signedInWith)).then(({ data, ready }) => {
      if (alive && ready) setRepeats({ for: userId, running: data.filter((s) => s.active).length });
    });
    return () => {
      alive = false;
    };
  }, [userId, signedInWith]);
  const repeatsOn = !!repeats && repeats.for === userId;
  const repeatsFull = repeatsOn && repeats.running >= MAX_RUNNING;
  const repeatBad = repeat ? repeatProblem(repeat, date) : null;

  /** A new date: a repeat's rule follows it. */
  const pickDate = (d: string) => {
    if (repeat && d) setRepeat(moveRepeat(repeat, d, date));
    setDate(d);
    setStartTime("");
    setDuration(null);
  };

  // IST-anchored so a 1am IST reload doesn't offer "today = yesterday
  // UTC" as a bookable date. Same helper drives minTime below.
  const todayStr = useMemo(() => istDateISO(new Date()), []);
  // Only enforce a future-time floor when the picked date IS today.
  // For any date after today, all 06:00→23:30 slots are valid.
  const minTime = useMemo(() => {
    if (!date || date !== todayStr) return undefined;
    return roundUpToNextSlot(istTimeHM(new Date()));
  }, [date, todayStr]);

  // If the current startTime falls before minTime (e.g. the visitor
  // picked 6:30 PM at 6:15 PM and stayed on the page till 6:45 PM
  // without submitting), clear it so they can't submit a past slot.
  useEffect(() => {
    if (!minTime || !startTime) return;
    if (startTime < minTime) {
      setStartTime("");
      setDuration(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minTime]);

  const handleSportSelect = (s: typeof SPORT_OPTIONS[0]) => {
    setSport(s.name);
    setSelectedSportObj(s);
    setMaxPlayers(s.defaultMax);
    setTimeout(() => setStep(2), 120);
  };

  // Fill the form from a drafted sentence. Only values the wizard
  // accepts arrive here; the player still confirms every step.
  const applyPrefill = (p: GamePrefill) => {
    if (p.sport) {
      const s = SPORT_OPTIONS.find((o) => o.name === p.sport) ?? null;
      setSport(p.sport);
      setSelectedSportObj(s);
      setMaxPlayers(p.maxPlayers ?? s?.defaultMax ?? 10);
    } else if (p.maxPlayers) {
      setMaxPlayers(p.maxPlayers);
    }
    if (p.date) {
      if (repeat) setRepeat(moveRepeat(repeat, p.date, date));
      setDate(p.date);
    }
    if (p.startTime) setStartTime(p.startTime);
    if (p.duration) setDuration(p.duration);
    if (p.turf) {
      setTurfId(p.turf.id);
      setTurfName(p.turf.name);
      setVenue(null);
    } else if (p.turfName) {
      // Not one TapTurf lists (or not found): the search has the words, and "Add the venue" takes them on.
      setTurfId("");
      setTurfName("");
      setVenue(null);
      setTurfSearch(p.turfName);
    }
    if (p.skill) setSkillLevel(p.skill);
    if (p.costPerPerson != null) {
      setCostPerPerson(p.costPerPerson);
      setCustomCost(COST_OPTIONS.includes(p.costPerPerson) ? "" : String(p.costPerPerson));
    }
    if (p.notes) setNotes(p.notes);
    const missing = [!p.sport && "the sport", !p.date && "the day", !p.startTime && "the time", !p.turf && "the venue"].filter(Boolean) as string[];
    setDraftNote(missing.length ? `${p.reply} Still to pick: ${missing.join(", ")}.` : `${p.reply} Check each step and you're set.`);
    // Said when the note shows, only while "Add the venue" is offered (venuesOn).
    setDraftNotListed(missing.length && !p.turf && p.turfName ? p.turfName : null);
    setStep(p.sport ? 2 : 1);
  };

  const handleSubmit = async () => {
    if (!user) { login(); return; }
    if (!endTime) return;
    if (!hostPhoneOk) {
      setSubmitError("Enter a 10-digit mobile number for players, or leave it empty.");
      return;
    }
    setSubmitError("");
    setSubmitting(true);
    if (hostPhone) {
      try { localStorage.setItem(HOST_PHONE_KEY, hostPhone); } catch { /* ignore */ }
    }
    // The server works out the host from this sign-in, and takes their name and photo from the account.
    const game: CreateGameData = {
      turfId: venue ? "" : turfId,
      venue,
      date, startTime, endTime, sport, format: sport, skillLevel, maxPlayers, costPerPerson, notes: notes || undefined, turfBooked,
    };
    const phone = hostPhone ? `+91${hostPhone}` : "";
    // Where it is, for the WhatsApp message: a typed venue says it itself; a turf's area and city are read once it is made.
    const readPlace = () => (venue ? setTurfPlace({ area: venue.area, city: venue.city }) : getTurfPlace(turfId).then(setTurfPlace, () => {}));
    if (repeat) {
      // A repeat: the server puts its first games up (the next 4 weeks), each a game of its own.
      const { data, error } = await createSeries(getToken, game, phone, normalRepeat(repeat));
      setSubmitting(false);
      if (data && data.games.length > 0) {
        setSeriesGames(data.games);
        setCreatedGameId(data.games[0].id);
        setStep(4);
        void readPlace();
      } else if (data) {
        // Saved, but nothing could go up just now (the turf was unlisted meanwhile): the daily top-up tries again.
        setSubmitError("Your repeat is saved, but its first game couldn't go up yet. It goes up within a day: see it on the Me tab.");
      } else setSubmitError(error || "Failed to create the repeating game. Please try again.");
      return;
    }
    const { data, error } = await createGame(getToken, game, phone);

    setSubmitting(false);
    if (data && !error) {
      setCreatedGameId(data.id);
      setStep(4);
      void readPlace();
    }
    else setSubmitError(error || "Failed to create game. Please try again.");
  };

  const handleCopyLink = async () => {
    if (!createdGameId) return;
    await navigator.clipboard.writeText(`${window.location.origin}/game/${createdGameId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppShare = () => {
    if (!createdGameId) return;
    // Which game, where and when (lib/utils/gameShare.ts), the link last. A repeat's first game, and how it repeats.
    const text = gameShareText(
      {
        sport,
        date: seriesGames?.[0]?.date ?? date,
        start_time: startTime,
        end_time: endTime,
        max_players: maxPlayers,
        current_players: 1,
        price_per_player: costPerPerson,
        skill_level: skillLevel,
        turf_booked: turfBooked,
        turfs: { name: placeName, ...turfPlace },
        listed: !venue,
      },
      { host: true, url: `${window.location.origin}/game/${createdGameId}`, repeat: seriesGames && repeat ? repeatLabel(repeat.rule) : null },
    );
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const step2Valid = date && startTime && endTime && (turfId || venue) && !repeatBad;
  // The game's place in words: the turf's name, or the typed venue's (with its area and city).
  const placeName = venue?.name ?? turfName;
  const venueWhere = venue ? gamePlace({ area: venue.area, city: venue.city, address: venue.address }) : "";
  const what = venue ? "venue" : "turf";
  const typedOn = venuesOn !== false;
  // The draft's note, pointing to "Add the venue" only while it is there.
  const draftLine = draftNote
    ? `${draftNote}${draftNotListed && typedOn ? ` If ${draftNotListed} isn't on TapTurf, tap "Add the venue" under the search.` : ""}`
    : null;
  const noTurfs = turfSearch.trim().length >= 2 && searchedFor === turfSearch && turfResults.length === 0;
  // A repeat's summary ("Every Tue and Thu", "7 – 8 PM", "until 20 Dec") and its next dates, as the confirm step shows them.
  const repeatLine = repeat && !repeatBad ? repeatParts(repeat, date, startTime || null, endTime) : null;
  // Four shown; a fifth only says there are more.
  const repeatNext = repeat && !repeatBad && startTime ? nextDays(repeat, date, startTime, 5) : [];

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-7 h-7 text-accent-500 animate-spin" />
        <p className="text-xs font-semibold text-primary-500">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-16 h-16 bg-accent-500 rounded-2xl flex items-center justify-center mb-6 shadow-neon">
          <Zap className="w-8 h-8 text-white" strokeWidth={2.75} />
        </div>
        <h2 className="font-display text-4xl text-primary-800 mb-2 tracking-tight">Log in to host</h2>
        <p className="text-sm text-primary-500 mb-7 max-w-xs">
          Sign in to create games, invite your crew, and manage your squad.
        </p>
        <button
          onClick={login}
          className="bg-primary-800 hover:bg-primary-900 text-white px-8 py-3.5 min-h-[52px] rounded-full font-bold text-sm shadow-elevated transition-all focus-neon"
        >
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Custom time picker — 30-min slots, no free-form iOS wheel.
          When the picked date is today, minTime hides slots before
          "now" so nobody can create a game for a slot that's already
          started. Future dates pass minTime={undefined} → all slots. */}
      <TimeSlotSheet
        open={timeSheetOpen}
        value={startTime}
        minTime={minTime}
        onClose={() => setTimeSheetOpen(false)}
        onSelect={(s) => { setStartTime(s); setDuration(null); }}
      />
      <RepeatSheet
        open={repeatOpen}
        start={date}
        startTime={startTime}
        endTime={endTime}
        value={repeat}
        onChange={setRepeat}
        onClose={() => setRepeatOpen(false)}
      />

      {/* ─── Step 4: Success ───────────────────────────────── */}
      {step === 4 ? (
        <div className="px-5 pt-12 pb-40 flex flex-col items-center text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 blur-2xl bg-accent-400/40 rounded-full" aria-hidden />
            <div className="relative w-20 h-20 bg-accent-500 rounded-full flex items-center justify-center shadow-neon">
              <Check className="w-10 h-10 text-white stroke-[3]" aria-hidden="true" />
            </div>
          </div>
          <h1 className="font-display text-5xl text-primary-800 mb-3 tracking-tight leading-none">
            Game<br /><span className="text-accent-500">on.</span>
          </h1>
          <p className="text-sm text-primary-600 mb-1">
            <span className="font-semibold text-primary-800">{sport}</span> · {placeName}
          </p>
          {venueWhere && <p className="text-[13px] text-primary-500 mb-1">{venueWhere}</p>}
          {seriesGames && repeat ? (
            <div className="w-full mb-8 mt-3 rounded-2xl bg-accent-50 border border-accent-500/30 px-4 py-3.5 text-left">
              <p className="flex items-center gap-2 text-[15px] font-bold text-primary-900">
                <RepeatIcon className="w-4 h-4 text-accent-600 shrink-0" aria-hidden />
                {repeatLabel(repeat.rule)}
              </p>
              <p className="text-[13px] text-primary-700 mt-1.5 leading-relaxed">
                {seriesGames.length === 1 ? "The first game is up: " : `${seriesGames.length} games are up: `}
                {seriesGames.slice(0, 4).map((g) => formatGameDay(g.date).plain).join(" · ")}
                {seriesGames.length > 4 && " …"}
              </p>
              <p className="text-[12px] text-primary-500 mt-1.5 leading-snug">
                More go up 4 weeks ahead. Share each game; players join each one. Book the {what} for each date yourself.
              </p>
            </div>
          ) : (
            <p className="text-xs font-semibold text-primary-500 mb-8">
              Share the link, get your squad in
            </p>
          )}

          <div className="w-full space-y-3">
            <button
              onClick={handleWhatsAppShare}
              className="w-full flex items-center justify-center gap-2.5 bg-[#25D366] hover:bg-[#1fb855] text-white py-4 min-h-[56px] rounded-full font-bold text-base transition-colors focus-neon"
            >
              <Share2 className="w-5 h-5" aria-hidden="true" />
              WhatsApp
            </button>
            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-2.5 border-2 border-primary-200 bg-white hover:bg-primary-50 text-primary-800 py-4 min-h-[56px] rounded-full font-bold text-base transition-colors focus-neon"
            >
              <Copy className="w-5 h-5" aria-hidden="true" />
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            <button
              onClick={() => router.push(`/game/${createdGameId}`)}
              className="w-full flex items-center justify-center gap-2.5 bg-primary-800 hover:bg-primary-900 text-white py-4 min-h-[56px] rounded-full font-bold text-base transition-colors shadow-elevated focus-neon"
            >
              <Trophy className="w-5 h-5" aria-hidden="true" />
              {seriesGames ? "View the first game" : "View my game"}
            </button>
            {seriesGames && (
              <Link href="/dashboard?tab=games" className="w-full flex items-center justify-center min-h-[48px] text-[15px] font-semibold text-accent-700 hover:text-accent-800 focus-neon rounded-full">
                See all of them on the Me tab
              </Link>
            )}
          </div>

          {/* Cricket or any sport the Live Scoreboard knows; renders nothing for the rest. */}
          <LiveScorerPromo sport={sport} variant="created" venue={placeName} liveLinks={liveLinks} />
        </div>
      ) : (
        <>
          {/* Sticky header — solid white, no blur (cheap on low-end) */}
          <div className="sticky top-0 z-20 bg-white border-b border-primary-200 px-4 py-3">
            <div className="flex items-center gap-3">
              {step > 1 ? (
                <button
                  onClick={() => setStep((step - 1) as Step)}
                  className="w-9 h-9 flex items-center justify-center rounded-full border border-primary-200 bg-white hover:bg-primary-50 transition-colors focus-neon shrink-0"
                  aria-label="Go back"
                >
                  <ArrowLeft className="w-4 h-4 text-primary-700" />
                </button>
              ) : (
                <div className="w-9 shrink-0" />
              )}
              <div className="flex-1 flex items-center gap-1.5">
                {STEPS.map((s) => (
                  <div key={s.n} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className={`w-full h-1 rounded-full transition-all duration-300 ${
                      step >= s.n ? "bg-accent-500" : "bg-primary-200"
                    }`} />
                    <span className={`text-[10px] font-semibold transition-colors ${
                      step >= s.n ? "text-accent-600" : "text-primary-400"
                    }`}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="w-9 text-right shrink-0">
                <span className="text-xs font-mono tabular text-primary-500">{step}/3</span>
              </div>
            </div>
          </div>

          {/* Content — extra bottom padding for sticky CTA + floating pill nav */}
          <div className="px-4 pt-6 pb-44">

            {/* ─── Step 1: Sport ───────────────────────────── */}
            {step === 1 && (
              <div>
                <h1 className="font-display text-[42px] leading-[0.9] text-primary-800 tracking-tight mb-1">
                  What are<br />
                  <span className="text-accent-500">you playing?</span>
                </h1>
                <p className="text-xs font-semibold text-primary-500 mb-6">
                  Pick your sport
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {SPORT_OPTIONS.map((s) => {
                    const active = sport === s.name;
                    return (
                      <button
                        key={s.name}
                        onClick={() => handleSportSelect(s)}
                        className={`relative flex flex-col items-start gap-3 p-4 min-h-[112px] rounded-2xl text-left transition-all active:scale-[0.97] focus-neon ${
                          active
                            ? "bg-accent-50 border-2 border-accent-500 shadow-neon"
                            : "bg-white border-2 border-primary-200 hover:border-accent-400"
                        }`}
                      >
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                          active ? "bg-accent-500 text-white" : "bg-primary-100 text-accent-500"
                        }`}>
                          {s.icon}
                        </div>
                        <div>
                          <p className="font-display text-lg text-primary-800 leading-tight">{s.name}</p>
                          <p className="text-[11px] text-primary-500 font-semibold mt-0.5 flex items-center gap-1">
                            <Users className="w-3 h-3" aria-hidden="true" />
                            {s.defaultMax} slots
                          </p>
                        </div>
                        {active && (
                          <span className="absolute top-3 right-3 w-6 h-6 bg-accent-500 rounded-full flex items-center justify-center shadow-neon">
                            <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <GameDraftBox userId={user.id} initial={draftText || null} onPrefill={applyPrefill} />
                {draftLine && step === 1 && <p className="mt-3 text-[13px] text-primary-700">{draftLine}</p>}
              </div>
            )}

            {/* ─── Step 2: When & Where (iOS grouped list) ───── */}
            {step === 2 && (
              <div className="space-y-2">
                {draftLine && (
                  <div className="mb-4 rounded-2xl bg-accent-50 border border-accent-200 px-4 py-3 text-[13px] text-primary-800">
                    {draftLine}
                  </div>
                )}
                <div className="mb-6">
                  <h1 className="font-display text-[42px] leading-[0.9] text-primary-800 tracking-tight mb-1">
                    When &<br />
                    <span className="text-accent-500">where?</span>
                  </h1>
                  <p className="text-xs font-semibold text-primary-500">
                    Date · time · venue
                  </p>
                </div>

                {/* SCHEDULE group */}
                <p className="text-[11px] font-semibold text-primary-500 px-1 pb-2 pt-2">
                  Schedule
                </p>
                <div className="bg-white border border-primary-200 rounded-2xl overflow-hidden">
                  {/* Date row — invisible native input overlays the row so
                      iOS Safari opens its rolling wheel on tap. */}
                  <label className="relative flex items-center justify-between px-4 py-3.5 min-h-[56px] active:bg-primary-50 transition-colors cursor-pointer">
                    <span className="text-[15px] font-medium text-primary-800">{repeat ? "Starts" : "Date"}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-[15px] font-semibold text-accent-600">
                        {humanDate(date)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-primary-400" />
                    </span>
                    <input
                      type="date"
                      value={date}
                      min={todayStr}
                      onChange={(e) => pickDate(e.target.value)}
                      aria-label="Date"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </label>

                  <div className="h-px bg-primary-200 ml-4" />

                  {/* Start time row — custom sheet so iOS can't pick 8:23 */}
                  <button
                    type="button"
                    onClick={() => setTimeSheetOpen(true)}
                    className="w-full flex items-center justify-between px-4 py-3.5 min-h-[56px] active:bg-primary-50 transition-colors focus-neon"
                  >
                    <span className="text-[15px] font-medium text-primary-800">Start time</span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-[15px] font-semibold text-accent-600 font-mono tabular">
                        {startTime ? (() => {
                          const [h, m] = startTime.split(":").map(Number);
                          return fmt(h, m);
                        })() : "Pick a time"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-primary-400" />
                    </span>
                  </button>

                  {/* Duration row — segmented control */}
                  {startTime && (
                    <>
                      <div className="h-px bg-primary-200 ml-4" />
                      <div className="px-4 py-3.5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[15px] font-medium text-primary-800">Duration</span>
                          {endTime && (
                            <span className="text-[13px] text-primary-500 font-mono tabular">
                              → {(() => {
                                const [h, m] = endTime.split(":").map(Number);
                                return fmt(h, m);
                              })()}
                            </span>
                          )}
                        </div>
                        <div className="flex bg-primary-100 rounded-xl p-1 gap-0.5">
                          {DURATION_OPTIONS.map(({ hours, label }) => {
                            const selected = duration === hours;
                            const end = getEndTime(startTime, hours);
                            if (!end) return null;
                            return (
                              <button
                                key={hours}
                                onClick={() => setDuration(hours)}
                                className={`flex-1 py-2.5 rounded-lg text-[14px] font-bold transition-all focus-neon min-h-[40px] ${
                                  selected
                                    ? "bg-white text-accent-600 shadow-sm"
                                    : "text-primary-600 hover:text-primary-800"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Repeat row — once the database has repeats; the sheet asks how, like a calendar */}
                  {repeatsOn && (
                    <>
                      <div className="h-px bg-primary-200 ml-4" />
                      <button
                        type="button"
                        onClick={() => setRepeatOpen(true)}
                        disabled={repeatsFull && !repeat}
                        aria-describedby={repeatsFull && !repeat ? "repeat-full" : undefined}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 min-h-[56px] text-left active:bg-primary-50 transition-colors focus-neon disabled:cursor-not-allowed"
                      >
                        <span className="flex items-center gap-2 text-[15px] font-medium text-primary-800 shrink-0">
                          <RepeatIcon className="w-4 h-4 text-primary-500" aria-hidden="true" />
                          Repeat
                        </span>
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[15px] font-semibold truncate ${repeatBad ? "text-hot-600" : repeatsFull && !repeat ? "text-primary-400" : "text-accent-600"}`}>
                            {repeat ? repeatLabel(repeat.rule) : "Does not repeat"}
                          </span>
                          <ChevronRight className="w-4 h-4 text-primary-400 shrink-0" />
                        </span>
                      </button>
                      {repeatsFull && !repeat && (
                        <p id="repeat-full" className="px-4 pb-3.5 -mt-1.5 text-[12px] text-primary-500">
                          You have {MAX_RUNNING} repeating games running. Stop one on the Me tab to start another.
                        </p>
                      )}
                      {repeatBad && (
                        <p className="px-4 pb-3.5 -mt-1.5 text-[12px] font-semibold text-hot-600">
                          {repeatBad === "ends" ? "That repeat ends before a second game." : "Check how it repeats."} Tap Repeat to change it.
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* VENUE group — no overflow-hidden here, otherwise the
                    search dropdown gets clipped inside the card. */}
                <p className="text-[11px] font-semibold text-primary-500 px-1 pb-2 pt-6">
                  Venue
                </p>
                <div className="relative bg-white border border-primary-200 rounded-2xl">
                  {turfId ? (
                    <div className="flex items-center justify-between px-4 py-3.5 min-h-[56px]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MapPin className="w-4 h-4 text-accent-600 shrink-0" aria-hidden="true" />
                        <span className="text-[15px] font-semibold text-primary-800 truncate">{turfName}</span>
                      </div>
                      <button
                        onClick={() => { setTurfId(""); setTurfName(""); setTurfSearch(""); }}
                        className="text-[13px] font-semibold text-accent-600 hover:text-accent-700 shrink-0 ml-3 focus-neon rounded-md px-2 py-1"
                      >
                        Change
                      </button>
                    </div>
                  ) : venue ? (
                    // A typed venue, shown as a chosen turf is: its name, address and place, and Change.
                    <div className="flex items-start justify-between px-4 py-3.5 min-h-[56px]">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <MapPin className="w-4 h-4 mt-1 text-accent-600 shrink-0" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold text-primary-800 leading-snug [overflow-wrap:anywhere]">{venue.name}</p>
                          <p className="text-[13px] text-primary-600 leading-snug mt-0.5 [overflow-wrap:anywhere]">{venue.address}</p>
                          <p className="text-[12px] text-primary-500 leading-snug mt-0.5">
                            {venueWhere ? `${venueWhere} · ` : ""}Not on TapTurf
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setVenue(null)}
                        className="text-[13px] font-semibold text-accent-600 hover:text-accent-700 shrink-0 ml-3 focus-neon rounded-md px-2 py-1"
                      >
                        Change
                      </button>
                    </div>
                  ) : venueFormOpen && venueForm ? (
                    <OtherVenueForm draft={venueForm} onDraft={setVenueForm} onUse={pickTypedVenue} onCancel={() => setVenueFormOpen(false)} />
                  ) : (
                    <>
                      <div className="relative" ref={turfBoxRef}>
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400 pointer-events-none" aria-hidden="true" />
                        <input
                          type="text"
                          value={turfSearch}
                          onChange={(e) => setTurfSearch(e.target.value)}
                          onFocus={() => turfResults.length > 0 && setShowTurfDropdown(true)}
                          onClick={() => turfResults.length > 0 && setShowTurfDropdown(true)}
                          onKeyDown={(e) => e.key === "Escape" && setShowTurfDropdown(false)}
                          placeholder="Search a turf by name…"
                          aria-label="Search a turf by name"
                          className="w-full pl-11 pr-4 py-3.5 min-h-[56px] text-[15px] font-medium text-primary-800 placeholder:text-primary-400 focus:outline-none bg-transparent"
                        />
                        {showTurfDropdown && turfResults.length > 0 && (
                          <div className="absolute z-[60] top-full mt-2 w-full max-h-[280px] overflow-y-auto bg-white border border-primary-200 rounded-2xl shadow-elevated">
                            {turfResults.map((turf) => (
                              <button
                                key={turf.id}
                                onClick={() => { setTurfId(turf.id); setTurfName(turf.name); setShowTurfDropdown(false); setTurfSearch(""); }}
                                className="w-full text-left px-4 py-3.5 hover:bg-accent-50 border-b border-primary-100 last:border-0 transition-colors"
                              >
                                <p className="text-[15px] font-semibold text-primary-800">{turf.name}</p>
                                <p className="text-[13px] text-primary-500 flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3" aria-hidden="true" />
                                  {turf.address}
                                </p>
                              </button>
                            ))}
                            {/* The results cover the "Not on TapTurf?" row below, so the way to add one is here too, always in view. */}
                            {typedOn && (
                              <button
                                type="button"
                                onClick={() => openVenueForm(turfSearch)}
                                className="sticky bottom-0 w-full flex items-center gap-2 text-left px-4 py-3 min-h-12 bg-white border-t border-primary-200 text-[14px] font-semibold text-accent-700 hover:bg-accent-50 focus-neon [overflow-wrap:anywhere]"
                              >
                                <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
                                <span>Not listed? Add &ldquo;{turfSearch.trim()}&rdquo; as the venue</span>
                              </button>
                            )}
                          </div>
                        )}
                        {noTurfs && (
                          <div className="absolute z-[60] top-full mt-2 w-full bg-white border border-primary-200 rounded-2xl px-4 py-3 shadow-elevated" role="status">
                            <p className="text-[13px] text-primary-500 [overflow-wrap:anywhere]">
                              No turfs found for &ldquo;{turfSearch.trim()}&rdquo;. Try a different name{typedOn ? ", or add it yourself." : "."}
                            </p>
                            {typedOn && (
                              <button
                                type="button"
                                onClick={() => openVenueForm(turfSearch)}
                                className="mt-2 w-full min-h-11 inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-accent-500 text-[14px] font-bold text-accent-700 hover:bg-accent-50 focus-neon px-3 [overflow-wrap:anywhere]"
                              >
                                <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
                                Add &ldquo;{turfSearch.trim()}&rdquo; as the venue
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {typedOn && (
                        <>
                          <div className="h-px bg-primary-200 ml-4" />
                          <button
                            type="button"
                            onClick={() => openVenueForm(turfSearch)}
                            className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] text-left rounded-b-2xl active:bg-primary-50 hover:bg-primary-50 transition-colors focus-neon"
                          >
                            <span className="w-8 h-8 rounded-full bg-accent-50 border border-accent-200 flex items-center justify-center shrink-0">
                              <Plus className="w-4 h-4 text-accent-700" aria-hidden="true" />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-[15px] font-semibold text-primary-800">Not on TapTurf? Add the venue</span>
                              <span className="block text-[12px] text-primary-500">Type its name and address</span>
                            </span>
                            <ChevronRight className="w-4 h-4 text-primary-400 shrink-0" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ─── Step 3: Squad Details (iOS grouped list) ─── */}
            {step === 3 && (
              <div className="space-y-2">
                <div className="mb-6">
                  <h1 className="font-display text-[42px] leading-[0.9] text-primary-800 tracking-tight mb-1">
                    Squad<br />
                    <span className="text-accent-500">details</span>
                  </h1>
                  <p className="text-xs font-semibold text-primary-500">
                    Almost on the pitch
                  </p>
                </div>

                {/* Summary card */}
                <div className="flex items-center gap-3 bg-accent-50 border border-accent-500/30 rounded-2xl px-4 py-3.5 mb-4">
                  {selectedSportObj && (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-accent-500 text-white shrink-0">
                      {selectedSportObj.icon}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-display text-lg text-primary-800 truncate leading-tight">
                      {sport} · {placeName}
                    </p>
                    {venueWhere && <p className="text-[12px] text-primary-600 truncate">{venueWhere}</p>}
                    {repeatLine ? (
                      <p className="text-[13px] font-semibold text-primary-700 mt-0.5 flex items-start gap-1.5">
                        <RepeatIcon className="w-3.5 h-3.5 text-accent-600 shrink-0 mt-[3px]" aria-hidden="true" />
                        <span>
                          {repeatLine.map((p, i) => (
                            <span key={i} className={i === 1 ? "whitespace-nowrap" : undefined}>
                              {i > 0 && ", "}
                              {p}
                            </span>
                          ))}
                        </span>
                      </p>
                    ) : (
                      <p className="text-[12px] font-mono text-primary-600 mt-0.5">
                        {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                        {startTime && endTime && (() => {
                          const [sh, sm] = startTime.split(":").map(Number);
                          const [eh, em] = endTime.split(":").map(Number);
                          return ` · ${fmt(sh, sm)} → ${fmt(eh, em)}`;
                        })()}
                      </p>
                    )}
                  </div>
                </div>

                {/* A repeat's next dates, before the host confirms */}
                {repeatLine && repeatNext.length > 0 && (
                  <div className="-mt-2 mb-4 bg-white border border-primary-200 rounded-2xl px-4 py-3.5">
                    <p className="text-[11px] font-semibold text-primary-500 mb-2">Next games</p>
                    <ul className="flex flex-wrap gap-1.5" aria-label="Next games">
                      {repeatNext.slice(0, 4).map((d) => (
                        <li key={d} className="inline-flex items-center h-8 px-3 rounded-full bg-primary-50 border border-primary-200 text-[13px] font-semibold text-primary-800 whitespace-nowrap">
                          {formatGameDay(d).plain}
                        </li>
                      ))}
                      {repeatNext.length > 4 && <li className="inline-flex items-center h-8 px-1 text-[13px] text-primary-500">and more</li>}
                    </ul>
                    <p className="text-[12px] text-primary-500 mt-2.5 leading-snug">
                      Each goes up 4 weeks ahead as its own game. For bookings, contact the {what} directly for each date.
                    </p>
                  </div>
                )}

                {/* GAME group */}
                <p className="text-[11px] font-semibold text-primary-500 px-1 pb-2 pt-2">
                  Game
                </p>
                <div className="bg-white border border-primary-200 rounded-2xl overflow-hidden">
                  {/* Skill level — iOS segmented control */}
                  <div className="px-4 py-3.5">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[15px] font-medium text-primary-800">Skill level</span>
                    </div>
                    <div className="flex bg-primary-100 rounded-xl p-1 gap-0.5">
                      {SKILL_LEVELS.map((level) => {
                        const selected = skillLevel === level.value;
                        return (
                          <button
                            key={level.value}
                            onClick={() => setSkillLevel(level.value)}
                            className={`flex-1 py-2.5 rounded-lg text-[13px] font-bold transition-all focus-neon min-h-[40px] ${
                              selected
                                ? "bg-white text-accent-600 shadow-sm"
                                : "text-primary-600 hover:text-primary-800"
                            }`}
                          >
                            {level.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="h-px bg-primary-200 ml-4" />

                  {/* Max players — iOS stepper */}
                  <div className="flex items-center justify-between px-4 py-3.5 min-h-[56px]">
                    <span className="text-[15px] font-medium text-primary-800">Max players</span>
                    <div className="flex items-center gap-3 bg-primary-100 rounded-xl p-1">
                      <button
                        onClick={() => setMaxPlayers(Math.max(2, maxPlayers - 1))}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-primary-800 font-bold text-lg active:scale-95 transition-all shadow-sm focus-neon"
                        aria-label="Decrease"
                      >
                        −
                      </button>
                      <span className="font-mono text-[16px] font-bold text-primary-800 tabular w-6 text-center">
                        {maxPlayers}
                      </span>
                      <button
                        onClick={() => setMaxPlayers(Math.min(50, maxPlayers + 1))}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-primary-800 font-bold text-lg active:scale-95 transition-all shadow-sm focus-neon"
                        aria-label="Increase"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="h-px bg-primary-200 ml-4" />

                  {/* Turf booked toggle — iOS switch */}
                  <div className="flex items-center justify-between px-4 py-3.5 min-h-[56px]">
                    <div>
                      <p className="text-[15px] font-medium text-primary-800">{repeat ? `First game's ${what} booked` : venue ? "Venue already booked" : "Turf already booked"}</p>
                      <p className="text-[12px] text-primary-500 mt-0.5">{repeat ? "Mark the others from each game's page" : "Confirmed slot"}</p>
                    </div>
                    <button
                      onClick={() => setTurfBooked(!turfBooked)}
                      className={`relative w-[51px] h-[31px] rounded-full transition-colors focus-neon shrink-0 ${
                        turfBooked ? "bg-accent-500" : "bg-primary-300"
                      }`}
                      role="switch"
                      aria-checked={turfBooked}
                    >
                      <span
                        className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] bg-white rounded-full shadow-sm transition-transform duration-200 ${
                          turfBooked ? "translate-x-[20px]" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* COST group */}
                <p className="text-[11px] font-semibold text-primary-500 px-1 pb-2 pt-6">
                  Cost per person
                </p>
                <div className="bg-white border border-primary-200 rounded-2xl overflow-hidden">
                  <div className="px-3 py-3">
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                      {COST_OPTIONS.map((price) => {
                        const selected = costPerPerson === price && !customCost;
                        return (
                          <button
                            key={price}
                            onClick={() => { setCostPerPerson(price); setCustomCost(""); }}
                            className={`flex-shrink-0 min-w-[68px] px-4 py-2.5 rounded-full font-bold text-[14px] transition-all active:scale-[0.97] focus-neon border-2 ${
                              selected
                                ? "bg-accent-500 text-white border-accent-500 shadow-neon"
                                : "bg-white text-primary-800 border-primary-200 hover:border-accent-400"
                            }`}
                          >
                            {price === 0 ? "Free" : `₹${price}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="h-px bg-primary-200 ml-4" />
                  <div className="flex items-center px-4 py-3 min-h-[52px]">
                    <span className="text-[15px] font-medium text-primary-800 mr-3">Custom</span>
                    <span className="text-primary-500 mr-1">₹</span>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={customCost}
                      onChange={(e) => { setCustomCost(e.target.value); setCostPerPerson(parseInt(e.target.value) || 0); }}
                      placeholder="0"
                      className="flex-1 bg-transparent text-right font-mono tabular text-[15px] text-primary-800 placeholder:text-primary-300 focus:outline-none"
                    />
                  </div>
                </div>

                {/* NOTES group */}
                <p className="text-[11px] font-semibold text-primary-500 px-1 pb-2 pt-6">
                  Notes <span className="normal-case font-normal text-primary-400">(optional)</span>
                </p>
                <div className="bg-white border border-primary-200 rounded-2xl overflow-hidden">
                  <input
                    id="notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={500}
                    placeholder="e.g. Bring your own shoes, red jersey"
                    className="w-full px-4 py-3.5 min-h-[56px] text-[15px] text-primary-800 placeholder:text-primary-400 focus:outline-none bg-transparent"
                  />
                </div>

                {/* WHATSAPP group */}
                <p className="text-[11px] font-semibold text-primary-500 px-1 pb-2 pt-6">
                  <label htmlFor="host-phone">WhatsApp number for players</label> <span className="normal-case font-normal text-primary-400">(optional)</span>
                </p>
                <div className={`bg-white border rounded-2xl overflow-hidden flex items-center ${hostPhoneOk ? "border-primary-200" : "border-hot-500"}`}>
                  <span className="pl-4 pr-2 text-[15px] font-mono text-primary-500">+91</span>
                  <input
                    id="host-phone"
                    type="tel"
                    inputMode="numeric"
                    value={hostPhone}
                    onChange={(e) => setHostPhoneTyped(tenDigits(e.target.value))}
                    placeholder="10-digit number"
                    aria-describedby="host-phone-note"
                    className="flex-1 pr-4 py-3.5 min-h-[56px] text-[15px] text-primary-800 placeholder:text-primary-400 focus:outline-none bg-transparent"
                  />
                </div>
                <p id="host-phone-note" className="text-[12px] text-primary-500 px-1 pt-1.5">Players see it on this game&apos;s page. Leave it empty to keep your number to yourself.</p>

                {submitError && (
                  <div className="mt-4 p-3.5 bg-hot-500/10 border border-hot-500/40 rounded-2xl">
                    <p className="text-[14px] text-hot-600 font-medium">{submitError}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sticky bottom CTA — floats above the floating pill mobile nav (~90px) */}
          {step === 2 && (
            <div
              ref={liftCookieBanner}
              className="fixed left-0 right-0 z-40 bg-white border-t border-primary-200 px-4 py-3 md:bottom-0"
              style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
            >
              <button
                onClick={() => setStep(3)}
                disabled={!step2Valid}
                className="w-full flex items-center justify-center gap-2 bg-primary-800 hover:bg-primary-900 text-white py-4 min-h-[56px] rounded-full font-bold text-base transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] shadow-elevated focus-neon"
              >
                Next
              </button>
            </div>
          )}
          {step === 3 && (
            <div
              ref={liftCookieBanner}
              className="fixed left-0 right-0 z-40 bg-white border-t border-primary-200 px-4 py-3 md:bottom-0"
              style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
            >
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white py-4 min-h-[56px] rounded-full font-bold text-base transition-all disabled:opacity-50 active:scale-[0.98] shadow-neon focus-neon"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> Creating…</>
                ) : (
                  <><Zap className="w-5 h-5" strokeWidth={2.75} aria-hidden="true" /> {repeat ? "Post repeating game" : "Post game"}</>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
