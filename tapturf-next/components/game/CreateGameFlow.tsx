"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Check, MapPin, Search, Share2, Copy,
  Trophy, CircleDot, Target, Circle, Feather,
  Grip, Dumbbell, Loader2, Users, Zap, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createGame } from "@/lib/queries/games";
import { searchTurfs } from "@/lib/queries/users";
import type { CreateGameData } from "@/types/game";

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

// Snap any "HH:MM" to the nearest :00 or :30. Nobody books a slot at 8:23.
function snapToHalfHour(value: string): string {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return "";
  // Round to nearest 30-minute boundary.
  const totalMin = h * 60 + m;
  const snapped = Math.round(totalMin / 30) * 30;
  const sh = Math.min(23, Math.floor(snapped / 60));
  const sm = snapped % 60;
  return tv(sh, sm);
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

export function CreateGameFlow() {
  const { user, login, loading: authLoading } = useAuth();
  const router = useRouter();
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
  const [turfId, setTurfId] = useState("");
  const [turfName, setTurfName] = useState("");
  const [turfSearch, setTurfSearch] = useState("");
  const [turfResults, setTurfResults] = useState<{ id: string; name: string; address: string }[]>([]);
  const [showTurfDropdown, setShowTurfDropdown] = useState(false);
  const [skillLevel, setSkillLevel] = useState<CreateGameData["skillLevel"]>("all");
  const [costPerPerson, setCostPerPerson] = useState(100);
  const [customCost, setCustomCost] = useState("");
  const [notes, setNotes] = useState("");
  const [turfBooked, setTurfBooked] = useState(false);

  const turfSearchRef = useRef<HTMLInputElement>(null);

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
    if (turfSearch.length < 2) { setTurfResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await searchTurfs(turfSearch);
      setTurfResults(data);
      setShowTurfDropdown(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [turfSearch]);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setDate(today);
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const handleSportSelect = (s: typeof SPORT_OPTIONS[0]) => {
    setSport(s.name);
    setSelectedSportObj(s);
    setMaxPlayers(s.defaultMax);
    setTimeout(() => setStep(2), 120);
  };

  const handleSubmit = async () => {
    if (!user) { login(); return; }
    if (!endTime) return;
    setSubmitError("");
    setSubmitting(true);

    const { data, error } = await createGame(
      { turfId, date, startTime, endTime, sport, format: sport, skillLevel, maxPlayers, costPerPerson, notes: notes || undefined, turfBooked },
      { id: user.id, name: user.name, phone: user.phone, profile_image_url: user.profile_image_url }
    );

    setSubmitting(false);
    if (data && !error) { setCreatedGameId(data.id); setStep(4); }
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
    const text = `Join my ${sport} game on TapTurf!\n${window.location.origin}/game/${createdGameId}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const step2Valid = date && startTime && endTime && turfId;

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-7 h-7 text-accent-500 animate-spin" />
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-16 h-16 bg-accent-500 rounded-2xl flex items-center justify-center mb-6 shadow-neon">
          <Zap className="w-8 h-8 text-white" strokeWidth={2.75} />
        </div>
        <h2 className="font-display uppercase text-4xl text-primary-800 mb-2 tracking-tight">Log in to host</h2>
        <p className="text-sm text-primary-500 mb-7 max-w-xs">
          Sign in to create games, invite your crew, and manage your squad.
        </p>
        <button
          onClick={login}
          className="bg-primary-800 hover:bg-primary-900 text-white px-8 py-3.5 min-h-[52px] rounded-full font-bold uppercase tracking-wide text-sm shadow-elevated transition-all focus-neon"
        >
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* ─── Step 4: Success ───────────────────────────────── */}
      {step === 4 ? (
        <div className="px-5 pt-12 pb-40 flex flex-col items-center text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 blur-2xl bg-accent-400/40 rounded-full" aria-hidden />
            <div className="relative w-20 h-20 bg-accent-500 rounded-full flex items-center justify-center shadow-neon">
              <Check className="w-10 h-10 text-white stroke-[3]" aria-hidden="true" />
            </div>
          </div>
          <h1 className="font-display uppercase text-5xl text-primary-800 mb-3 tracking-tight leading-none">
            Game<br /><span className="text-accent-500">on.</span>
          </h1>
          <p className="text-sm text-primary-600 mb-1">
            <span className="font-semibold text-primary-800">{sport}</span> · {turfName}
          </p>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-500 mb-8">
            Share the link — get your squad in
          </p>

          <div className="w-full space-y-3">
            <button
              onClick={handleWhatsAppShare}
              className="w-full flex items-center justify-center gap-2.5 bg-[#25D366] hover:bg-[#1fb855] text-white py-4 min-h-[56px] rounded-full font-bold text-base uppercase tracking-wide transition-colors focus-neon"
            >
              <Share2 className="w-5 h-5" aria-hidden="true" />
              WhatsApp
            </button>
            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-2.5 border-2 border-primary-200 bg-white hover:bg-primary-50 text-primary-800 py-4 min-h-[56px] rounded-full font-bold text-base uppercase tracking-wide transition-colors focus-neon"
            >
              <Copy className="w-5 h-5" aria-hidden="true" />
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            <button
              onClick={() => router.push(`/game/${createdGameId}`)}
              className="w-full flex items-center justify-center gap-2.5 bg-primary-800 hover:bg-primary-900 text-white py-4 min-h-[56px] rounded-full font-bold text-base uppercase tracking-wide transition-colors shadow-elevated focus-neon"
            >
              <Trophy className="w-5 h-5" aria-hidden="true" />
              View my game
            </button>
          </div>
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
                    <span className={`text-[10px] font-semibold uppercase tracking-widest transition-colors ${
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
                <h1 className="font-display uppercase text-[42px] leading-[0.9] text-primary-800 tracking-tight mb-1">
                  What are<br />
                  <span className="text-accent-500">you playing?</span>
                </h1>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary-500 mb-6">
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
                          <p className="font-display uppercase text-lg text-primary-800 leading-tight tracking-wide">{s.name}</p>
                          <p className="text-[11px] text-primary-500 font-semibold uppercase tracking-widest mt-0.5 flex items-center gap-1">
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
              </div>
            )}

            {/* ─── Step 2: When & Where (iOS grouped list) ───── */}
            {step === 2 && (
              <div className="space-y-2">
                <div className="mb-6">
                  <h1 className="font-display uppercase text-[42px] leading-[0.9] text-primary-800 tracking-tight mb-1">
                    When &<br />
                    <span className="text-accent-500">where?</span>
                  </h1>
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">
                    Date · time · venue
                  </p>
                </div>

                {/* SCHEDULE group */}
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary-500 px-1 pb-2 pt-2">
                  Schedule
                </p>
                <div className="bg-white border border-primary-200 rounded-2xl overflow-hidden">
                  {/* Date row — invisible native input overlays the row so
                      iOS Safari opens its rolling wheel on tap. */}
                  <label className="relative flex items-center justify-between px-4 py-3.5 min-h-[56px] active:bg-primary-50 transition-colors cursor-pointer">
                    <span className="text-[15px] font-medium text-primary-800">Date</span>
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
                      onChange={(e) => { setDate(e.target.value); setStartTime(""); setDuration(null); }}
                      aria-label="Date"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </label>

                  <div className="h-px bg-primary-200 ml-4" />

                  {/* Start time row — same invisible-native pattern */}
                  <label className="relative flex items-center justify-between px-4 py-3.5 min-h-[56px] active:bg-primary-50 transition-colors cursor-pointer">
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
                    <input
                      type="time"
                      value={startTime}
                      step={1800}
                      onChange={(e) => {
                        setStartTime(snapToHalfHour(e.target.value));
                        setDuration(null);
                      }}
                      aria-label="Start time"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </label>

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
                </div>

                {/* VENUE group — no overflow-hidden here, otherwise the
                    search dropdown gets clipped inside the card. */}
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary-500 px-1 pb-2 pt-6">
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
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400 pointer-events-none" aria-hidden="true" />
                      <input
                        type="text"
                        value={turfSearch}
                        onChange={(e) => setTurfSearch(e.target.value)}
                        placeholder="Search a turf by name…"
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
                        </div>
                      )}
                      {turfSearch.length >= 2 && turfResults.length === 0 && (
                        <p className="absolute z-[60] top-full mt-2 w-full bg-white border border-primary-200 rounded-xl px-4 py-3 text-[13px] text-primary-500 shadow-elevated">
                          No turfs found — try a different name
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── Step 3: Squad Details (iOS grouped list) ─── */}
            {step === 3 && (
              <div className="space-y-2">
                <div className="mb-6">
                  <h1 className="font-display uppercase text-[42px] leading-[0.9] text-primary-800 tracking-tight mb-1">
                    Squad<br />
                    <span className="text-accent-500">details</span>
                  </h1>
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary-500">
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
                    <p className="font-display uppercase text-lg text-primary-800 truncate tracking-wide leading-tight">
                      {sport} · {turfName}
                    </p>
                    <p className="text-[12px] font-mono text-primary-600 mt-0.5">
                      {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                      {startTime && endTime && (() => {
                        const [sh, sm] = startTime.split(":").map(Number);
                        const [eh, em] = endTime.split(":").map(Number);
                        return ` · ${fmt(sh, sm)} → ${fmt(eh, em)}`;
                      })()}
                    </p>
                  </div>
                </div>

                {/* GAME group */}
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary-500 px-1 pb-2 pt-2">
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
                      <p className="text-[15px] font-medium text-primary-800">Turf already booked</p>
                      <p className="text-[12px] text-primary-500 mt-0.5">Confirmed slot</p>
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
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary-500 px-1 pb-2 pt-6">
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
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary-500 px-1 pb-2 pt-6">
                  Notes <span className="normal-case font-normal text-primary-400">(optional)</span>
                </p>
                <div className="bg-white border border-primary-200 rounded-2xl overflow-hidden">
                  <input
                    id="notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Bring your own shoes, red jersey"
                    className="w-full px-4 py-3.5 min-h-[56px] text-[15px] text-primary-800 placeholder:text-primary-400 focus:outline-none bg-transparent"
                  />
                </div>

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
              className="fixed left-0 right-0 z-40 bg-white border-t border-primary-200 px-4 py-3 md:bottom-0"
              style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
            >
              <button
                onClick={() => setStep(3)}
                disabled={!step2Valid}
                className="w-full flex items-center justify-center gap-2 bg-primary-800 hover:bg-primary-900 text-white py-4 min-h-[56px] rounded-full font-bold text-base uppercase tracking-wide transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] shadow-elevated focus-neon"
              >
                Next
              </button>
            </div>
          )}
          {step === 3 && (
            <div
              className="fixed left-0 right-0 z-40 bg-white border-t border-primary-200 px-4 py-3 md:bottom-0"
              style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
            >
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white py-4 min-h-[56px] rounded-full font-bold text-base uppercase tracking-wide transition-all disabled:opacity-50 active:scale-[0.98] shadow-neon focus-neon"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> Creating…</>
                ) : (
                  <><Zap className="w-5 h-5" strokeWidth={2.75} aria-hidden="true" /> Post game</>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
