"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Check, MapPin, Search, Share2, Copy,
  Trophy, Clock, Calendar, CircleDot, Target, Circle, Feather,
  Grip, Dumbbell, Minus, Plus, Loader2, Users, Zap,
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
  { value: "all" as const,          label: "Anyone",       desc: "All welcome" },
  { value: "beginner" as const,     label: "Beginner",     desc: "Just starting" },
  { value: "intermediate" as const, label: "Intermediate", desc: "Solid basics" },
  { value: "advanced" as const,     label: "Advanced",     desc: "Competitive" },
];

const DURATION_OPTIONS = [
  { hours: 0.5, label: "30m" },
  { hours: 1,   label: "1h"  },
  { hours: 1.5, label: "1.5h" },
  { hours: 2,   label: "2h"  },
];

const COST_OPTIONS = [0, 50, 100, 150, 200, 300];

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

  const dateOptions = useMemo(() => {
    const options: { label: string; sublabel: string; value: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      options.push({
        label: i === 0 ? "Today" : i === 1 ? "Tmrw" : d.toLocaleDateString("en-IN", { weekday: "short" }),
        sublabel: `${d.getDate()} ${d.toLocaleDateString("en-IN", { month: "short" })}`,
        value: d.toISOString().split("T")[0],
      });
    }
    return options;
  }, []);

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
        <Loader2 className="w-7 h-7 text-accent-400 animate-spin" />
        <p className="text-xs font-mono uppercase tracking-widest text-white/50">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-16 h-16 bg-accent-400 rounded-2xl flex items-center justify-center mb-6 shadow-neon">
          <Zap className="w-8 h-8 text-primary-950" strokeWidth={2.75} />
        </div>
        <h2 className="font-display uppercase text-4xl text-white mb-2 tracking-tight">Log in to host</h2>
        <p className="text-sm text-white/50 mb-7 max-w-xs">
          Sign in to create games, invite your crew, and manage your squad.
        </p>
        <button
          onClick={login}
          className="bg-accent-400 hover:bg-accent-300 text-primary-950 px-8 py-3.5 min-h-[52px] rounded-full font-bold uppercase tracking-wide text-sm shadow-neon transition-all focus-neon"
        >
          Log in
        </button>
      </div>
    );
  }

  // Common input style
  const inputBase =
    "w-full bg-cream-200 border border-white/10 rounded-xl px-4 py-3.5 min-h-[52px] text-base font-medium text-white placeholder:text-white/30 focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-400/30 transition-all";

  return (
    <div className="max-w-lg mx-auto">
      {/* Step 4: success */}
      {step === 4 ? (
        <div className="px-5 pt-12 pb-32 flex flex-col items-center text-center">
          <div className="relative">
            <div
              className="absolute inset-0 blur-3xl bg-accent-400/40 rounded-full"
              aria-hidden
            />
            <div className="relative w-20 h-20 bg-accent-400 rounded-full flex items-center justify-center shadow-neon mb-6">
              <Check className="w-10 h-10 text-primary-950 stroke-[3]" aria-hidden="true" />
            </div>
          </div>
          <h1 className="font-display uppercase text-5xl text-white mb-3 tracking-tight leading-none">
            Game<br /><span className="text-accent-400">on.</span>
          </h1>
          <p className="text-sm text-white/60 mb-2">
            <span className="font-semibold text-white">{sport}</span> · {turfName}
          </p>
          <p className="text-xs font-mono uppercase tracking-widest text-white/40 mb-10">
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
              className="w-full flex items-center justify-center gap-2.5 border border-white/15 bg-cream-200 hover:bg-cream-300 text-white py-4 min-h-[56px] rounded-full font-bold text-base uppercase tracking-wide transition-colors focus-neon"
            >
              <Copy className="w-5 h-5" aria-hidden="true" />
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            <button
              onClick={() => router.push(`/game/${createdGameId}`)}
              className="w-full flex items-center justify-center gap-2.5 bg-accent-400 hover:bg-accent-300 text-primary-950 py-4 min-h-[56px] rounded-full font-bold text-base uppercase tracking-wide transition-colors shadow-neon focus-neon"
            >
              <Trophy className="w-5 h-5" aria-hidden="true" />
              View my game
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Sticky header */}
          <div className="sticky top-0 z-20 bg-primary-950/90 backdrop-blur-xl border-b border-white/5 px-5 py-4">
            <div className="flex items-center gap-3">
              {step > 1 ? (
                <button
                  onClick={() => setStep((step - 1) as Step)}
                  className="w-9 h-9 flex items-center justify-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors focus-neon"
                  aria-label="Go back"
                >
                  <ArrowLeft className="w-4 h-4 text-white/80" />
                </button>
              ) : (
                <div className="w-9" />
              )}
              <div className="flex-1 flex items-center gap-1.5">
                {STEPS.map((s) => (
                  <div key={s.n} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className={`w-full h-1 rounded-full transition-all duration-300 ${
                      step >= s.n ? "bg-accent-400 shadow-neon" : "bg-white/10"
                    }`} />
                    <span className={`text-[10px] font-mono uppercase tracking-widest transition-colors ${
                      step >= s.n ? "text-accent-400" : "text-white/30"
                    }`}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="w-9 text-right">
                <span className="text-xs font-mono tabular text-white/50">{step}/3</span>
              </div>
            </div>
          </div>

          {/* Step content */}
          <div className="px-5 pt-8 pb-40">

            {/* Step 1: Sport */}
            {step === 1 && (
              <div>
                <h1 className="font-display uppercase text-5xl text-white leading-[0.9] tracking-tight mb-2">
                  What are<br />
                  <span className="text-accent-400">you playing?</span>
                </h1>
                <p className="text-sm text-white/50 mb-8 font-mono uppercase tracking-widest text-xs">
                  Pick your sport
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {SPORT_OPTIONS.map((s) => {
                    const active = sport === s.name;
                    return (
                      <button
                        key={s.name}
                        onClick={() => handleSportSelect(s)}
                        className={`relative flex flex-col items-start gap-3 p-4 min-h-[110px] rounded-2xl text-left transition-all active:scale-[0.97] focus-neon ${
                          active
                            ? "bg-accent-400/15 border-2 border-accent-400 shadow-neon"
                            : "bg-cream-200 border-2 border-white/5 hover:border-white/20"
                        }`}
                      >
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                          active ? "bg-accent-400 text-primary-950" : "bg-white/5 text-accent-400"
                        }`}>
                          {s.icon}
                        </div>
                        <div>
                          <p className="font-display uppercase text-lg text-white leading-tight tracking-wide">{s.name}</p>
                          <p className="text-[11px] text-white/40 font-mono uppercase tracking-widest mt-0.5 flex items-center gap-1">
                            <Users className="w-3 h-3" aria-hidden="true" />
                            {s.defaultMax} slots
                          </p>
                        </div>
                        {active && (
                          <span className="absolute top-3 right-3 w-6 h-6 bg-accent-400 rounded-full flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 text-primary-950 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: When & Where */}
            {step === 2 && (
              <div className="space-y-8">
                <div>
                  <h1 className="font-display uppercase text-5xl text-white leading-[0.9] tracking-tight mb-2">
                    When &<br />
                    <span className="text-accent-400">where?</span>
                  </h1>
                  <p className="text-xs font-mono uppercase tracking-widest text-white/50">
                    Date · Time · Venue
                  </p>
                </div>

                {/* Date strip */}
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-white/50 mb-3">
                    <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                    Date
                  </label>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
                    {dateOptions.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => { setDate(d.value); setStartTime(""); setDuration(null); }}
                        className={`flex-shrink-0 w-[76px] py-3 rounded-xl border-2 text-center transition-all active:scale-[0.97] focus-neon min-h-[68px] ${
                          date === d.value
                            ? "bg-accent-400 text-primary-950 border-accent-400 shadow-neon"
                            : "bg-cream-200 border-white/10 hover:border-white/25"
                        }`}
                      >
                        <p className={`font-display uppercase text-sm tracking-wide ${
                          date === d.value ? "text-primary-950" : "text-white"
                        }`}>
                          {d.label}
                        </p>
                        <p className={`text-[10px] font-mono mt-0.5 ${
                          date === d.value ? "text-primary-950/70" : "text-white/40"
                        }`}>
                          {d.sublabel}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start time */}
                <div>
                  <label
                    htmlFor="start-time"
                    className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-white/50 mb-3"
                  >
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    Start time
                  </label>
                  <input
                    id="start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => { setStartTime(e.target.value); setDuration(null); }}
                    className={inputBase + " font-mono tabular text-lg"}
                    style={{ colorScheme: "dark" }}
                  />
                </div>

                {/* Duration */}
                {startTime && (
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-widest text-white/50 mb-3 block">
                      Duration
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {DURATION_OPTIONS.map(({ hours, label }) => {
                        const end = getEndTime(startTime, hours);
                        if (!end) return null;
                        const [endH, endM] = end.split(":").map(Number);
                        const selected = duration === hours;
                        return (
                          <button
                            key={hours}
                            onClick={() => setDuration(hours)}
                            className={`flex flex-col items-center py-3 rounded-xl border-2 transition-all active:scale-[0.97] focus-neon min-h-[60px] ${
                              selected
                                ? "bg-accent-400 border-accent-400 shadow-neon"
                                : "bg-cream-200 border-white/10 hover:border-white/25"
                            }`}
                          >
                            <span className={`font-display uppercase text-base tracking-wide ${
                              selected ? "text-primary-950" : "text-white"
                            }`}>
                              {label}
                            </span>
                            <span className={`text-[10px] font-mono mt-0.5 ${
                              selected ? "text-primary-950/70" : "text-white/40"
                            }`}>
                              → {fmt(endH, endM)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Venue */}
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-white/50 mb-3">
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    Venue
                  </label>

                  {turfId ? (
                    <div className="flex items-center justify-between border-2 border-accent-400 rounded-xl px-4 py-3.5 bg-accent-400/10 shadow-neon">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MapPin className="w-4 h-4 text-accent-400 shrink-0" aria-hidden="true" />
                        <span className="text-sm font-semibold text-white truncate">{turfName}</span>
                      </div>
                      <button
                        onClick={() => { setTurfId(""); setTurfName(""); setTurfSearch(""); }}
                        className="text-[10px] font-mono uppercase tracking-widest text-accent-400 hover:text-accent-300 shrink-0 ml-3"
                      >
                        change
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" aria-hidden="true" />
                      <input
                        ref={turfSearchRef}
                        type="text"
                        value={turfSearch}
                        onChange={(e) => setTurfSearch(e.target.value)}
                        placeholder="Search a turf…"
                        className={inputBase + " pl-11"}
                      />
                      {showTurfDropdown && turfResults.length > 0 && (
                        <div className="absolute z-20 top-full mt-1.5 w-full bg-cream-200 border border-white/10 rounded-2xl shadow-elevated overflow-hidden">
                          {turfResults.map((turf) => (
                            <button
                              key={turf.id}
                              onClick={() => { setTurfId(turf.id); setTurfName(turf.name); setShowTurfDropdown(false); setTurfSearch(""); }}
                              className="w-full text-left px-4 py-3.5 hover:bg-accent-400/10 border-b border-white/5 last:border-0 transition-colors"
                            >
                              <p className="text-sm font-semibold text-white">{turf.name}</p>
                              <p className="text-xs text-white/50 flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" aria-hidden="true" />
                                {turf.address}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                      {turfSearch.length >= 2 && turfResults.length === 0 && (
                        <p className="absolute z-20 top-full mt-1.5 w-full bg-cream-200 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/50">
                          No turfs found — try a different name
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Details */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h1 className="font-display uppercase text-5xl text-white leading-[0.9] tracking-tight mb-2">
                    Squad<br />
                    <span className="text-accent-400">details</span>
                  </h1>
                  <p className="text-xs font-mono uppercase tracking-widest text-white/50">
                    Almost on the pitch
                  </p>
                </div>

                {/* Summary card */}
                <div className="flex items-center gap-3 bg-cream-200 border border-white/10 rounded-2xl px-4 py-3.5">
                  {selectedSportObj && (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-accent-400 text-primary-950 shrink-0">
                      {selectedSportObj.icon}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-display uppercase text-lg text-white truncate tracking-wide leading-tight">
                      {sport} · {turfName}
                    </p>
                    <p className="text-[11px] font-mono text-white/50 mt-0.5">
                      {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                      {startTime && endTime && (() => {
                        const [sh, sm] = startTime.split(":").map(Number);
                        const [eh, em] = endTime.split(":").map(Number);
                        return ` · ${fmt(sh, sm)} → ${fmt(eh, em)}`;
                      })()}
                    </p>
                  </div>
                </div>

                {/* Skill level */}
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-white/50 mb-3">Skill level</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SKILL_LEVELS.map((level) => (
                      <button
                        key={level.value}
                        onClick={() => setSkillLevel(level.value)}
                        className={`flex flex-col items-start px-4 py-3 min-h-[64px] rounded-xl border-2 transition-all active:scale-[0.97] focus-neon ${
                          skillLevel === level.value
                            ? "bg-accent-400 border-accent-400 shadow-neon"
                            : "bg-cream-200 border-white/10 hover:border-white/25"
                        }`}
                      >
                        <span className={`font-display uppercase text-base tracking-wide ${
                          skillLevel === level.value ? "text-primary-950" : "text-white"
                        }`}>
                          {level.label}
                        </span>
                        <span className={`text-[10px] font-mono uppercase tracking-widest mt-0.5 ${
                          skillLevel === level.value ? "text-primary-950/70" : "text-white/40"
                        }`}>
                          {level.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Max players */}
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-white/50 mb-3">Max players</label>
                  <div className="flex items-center gap-4 bg-cream-200 border border-white/10 rounded-xl px-4 py-3">
                    <button
                      onClick={() => setMaxPlayers(Math.max(2, maxPlayers - 1))}
                      className="w-10 h-10 flex items-center justify-center border border-white/10 rounded-lg hover:border-accent-400 hover:bg-accent-400/10 active:scale-95 transition-all focus-neon"
                      aria-label="Decrease"
                    >
                      <Minus className="w-4 h-4 text-white" />
                    </button>
                    <div className="flex-1 text-center">
                      <span className="font-display text-4xl text-accent-400 tabular tracking-tight">{maxPlayers}</span>
                      <span className="text-xs font-mono uppercase tracking-widest text-white/50 ml-2">players</span>
                    </div>
                    <button
                      onClick={() => setMaxPlayers(Math.min(50, maxPlayers + 1))}
                      className="w-10 h-10 flex items-center justify-center border border-white/10 rounded-lg hover:border-accent-400 hover:bg-accent-400/10 active:scale-95 transition-all focus-neon"
                      aria-label="Increase"
                    >
                      <Plus className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>

                {/* Cost per person */}
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-white/50 mb-3">Cost per person</label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {COST_OPTIONS.slice(0, 4).map((price) => (
                      <button
                        key={price}
                        onClick={() => { setCostPerPerson(price); setCustomCost(""); }}
                        className={`py-3 min-h-[48px] rounded-xl border-2 font-display text-lg tracking-tight transition-all active:scale-[0.97] focus-neon ${
                          costPerPerson === price && !customCost
                            ? "bg-accent-400 text-primary-950 border-accent-400 shadow-neon"
                            : "bg-cream-200 text-white border-white/10 hover:border-white/25"
                        }`}
                      >
                        {price === 0 ? "FREE" : `₹${price}`}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {COST_OPTIONS.slice(4).map((price) => (
                      <button
                        key={price}
                        onClick={() => { setCostPerPerson(price); setCustomCost(""); }}
                        className={`py-3 min-h-[48px] rounded-xl border-2 font-display text-lg tracking-tight transition-all active:scale-[0.97] focus-neon ${
                          costPerPerson === price && !customCost
                            ? "bg-accent-400 text-primary-950 border-accent-400 shadow-neon"
                            : "bg-cream-200 text-white border-white/10 hover:border-white/25"
                        }`}
                      >
                        ₹{price}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={customCost}
                      onChange={(e) => { setCustomCost(e.target.value); setCostPerPerson(parseInt(e.target.value) || 0); }}
                      className="col-span-3 border-2 border-white/10 rounded-xl px-3 py-2 text-sm text-center font-mono tabular focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-400/30 bg-cream-200 text-white placeholder:text-white/30 min-h-[48px]"
                      placeholder="₹ custom"
                    />
                  </div>
                </div>

                {/* Turf booked toggle */}
                <div className="flex items-center justify-between bg-cream-200 border border-white/10 rounded-xl px-4 py-3.5">
                  <div>
                    <p className="text-sm font-semibold text-white">Turf already booked?</p>
                    <p className="text-[11px] font-mono uppercase tracking-widest text-white/40 mt-0.5">
                      Confirmed slot flag
                    </p>
                  </div>
                  <button
                    onClick={() => setTurfBooked(!turfBooked)}
                    className={`relative w-12 h-7 rounded-full transition-colors focus-neon ${
                      turfBooked ? "bg-accent-400 shadow-neon" : "bg-white/10"
                    }`}
                    role="switch"
                    aria-checked={turfBooked}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full transition-transform duration-200 ${
                      turfBooked ? "translate-x-5 bg-primary-950" : "bg-white/80"
                    }`} />
                  </button>
                </div>

                {/* Notes */}
                <div>
                  <label
                    htmlFor="notes"
                    className="block text-[10px] font-mono uppercase tracking-widest text-white/50 mb-3"
                  >
                    Notes <span className="text-white/30 lowercase">(optional)</span>
                  </label>
                  <input
                    id="notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Bring your own shoes, red jersey"
                    className={inputBase}
                  />
                </div>

                {submitError && (
                  <div className="p-3.5 bg-hot-500/10 border border-hot-500/40 rounded-xl">
                    <p className="text-sm text-hot-400 font-medium">{submitError}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sticky bottom CTA — sits above the mobile bottom nav (h-16) */}
          {step === 2 && (
            <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 bg-primary-950/95 backdrop-blur-xl border-t border-white/5 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                onClick={() => setStep(3)}
                disabled={!step2Valid}
                className="w-full flex items-center justify-center gap-2 bg-accent-400 hover:bg-accent-300 text-primary-950 py-4 min-h-[56px] rounded-full font-bold text-base uppercase tracking-wide transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] shadow-neon focus-neon"
              >
                Next
              </button>
            </div>
          )}
          {step === 3 && (
            <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 bg-primary-950/95 backdrop-blur-xl border-t border-white/5 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-accent-400 hover:bg-accent-300 text-primary-950 py-4 min-h-[56px] rounded-full font-bold text-base uppercase tracking-wide transition-all disabled:opacity-50 active:scale-[0.98] shadow-neon focus-neon"
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
