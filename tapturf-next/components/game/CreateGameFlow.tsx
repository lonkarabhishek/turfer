"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Check, MapPin, Search, Share2, Copy,
  Trophy, Clock, Calendar, CircleDot, Target, Circle, Feather,
  Grip, Dumbbell, Minus, Plus, Loader2, Users, Sparkles,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createGame } from "@/lib/queries/games";
import { searchTurfs } from "@/lib/queries/users";
import type { CreateGameData } from "@/types/game";

const SPORT_OPTIONS = [
  { name: "Football",     icon: <CircleDot className="w-6 h-6" />, defaultMax: 14, color: "from-emerald-500 to-primary-600" },
  { name: "5v5 Football", icon: <CircleDot className="w-6 h-6" />, defaultMax: 10, color: "from-emerald-400 to-primary-500" },
  { name: "Cricket",      icon: <Target className="w-6 h-6" />,    defaultMax: 22, color: "from-primary-500 to-primary-700" },
  { name: "Box Cricket",  icon: <Target className="w-6 h-6" />,    defaultMax: 12, color: "from-primary-400 to-primary-600" },
  { name: "Basketball",   icon: <Circle className="w-6 h-6" />,    defaultMax: 10, color: "from-orange-400 to-orange-600"   },
  { name: "Tennis",       icon: <Grip className="w-6 h-6" />,      defaultMax: 4,  color: "from-accent-400 to-accent-600"   },
  { name: "Pickleball",   icon: <Dumbbell className="w-6 h-6" />,  defaultMax: 4,  color: "from-accent-500 to-primary-500"  },
  { name: "Badminton",    icon: <Feather className="w-6 h-6" />,   defaultMax: 4,  color: "from-primary-400 to-accent-500"  },
];

const SKILL_LEVELS = [
  { value: "all" as const,          label: "All levels",   desc: "Everyone welcome" },
  { value: "beginner" as const,     label: "Beginner",     desc: "Just starting out" },
  { value: "intermediate" as const, label: "Intermediate", desc: "Some experience" },
  { value: "advanced" as const,     label: "Advanced",     desc: "Competitive play" },
];

const DURATION_OPTIONS = [
  { hours: 0.5, label: "30 min" },
  { hours: 1,   label: "1 hr"   },
  { hours: 1.5, label: "1.5 hr" },
  { hours: 2,   label: "2 hr"   },
];

const COST_OPTIONS = [0, 50, 100, 150, 200, 300];

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { n: 1, label: "Sport"   },
  { n: 2, label: "When"    },
  { n: 3, label: "Details" },
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
        <Loader2 className="w-7 h-7 text-primary-500 animate-spin" />
        <p className="text-sm text-primary-400">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-20 h-20 bg-primary-50 border border-primary-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Trophy className="w-9 h-9 text-primary-400" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-primary-800 font-serif mb-2">Log in to host a game</h2>
        <p className="text-sm text-primary-400 mb-7 max-w-xs">Create games, invite friends, and manage your squad on TapTurf</p>
        <button
          onClick={login}
          className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3.5 min-h-[44px] rounded-xl font-semibold text-sm cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Log in or sign up
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Step 4: success */}
      {step === 4 ? (
        <div className="px-5 pt-12 pb-32 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-accent-400 to-accent-600 rounded-full flex items-center justify-center shadow-gold mb-6">
            <Check className="w-10 h-10 text-white stroke-[2.5]" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold text-primary-800 font-serif mb-2">Game created!</h1>
          <p className="text-sm text-primary-400 mb-2">
            <span className="font-semibold text-primary-700">{sport}</span> · {turfName}
          </p>
          <p className="text-sm text-primary-400 mb-10">Share the link so friends can request to join.</p>

          <div className="w-full space-y-3">
            <button
              onClick={handleWhatsAppShare}
              className="w-full flex items-center justify-center gap-2.5 bg-[#25D366] hover:bg-[#1fb855] text-white py-4 min-h-[52px] rounded-2xl font-semibold text-base transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2"
            >
              <Share2 className="w-5 h-5" aria-hidden="true" />
              Share on WhatsApp
            </button>
            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-2.5 border border-cream-300 bg-white hover:bg-cream-100 text-primary-700 py-4 min-h-[52px] rounded-2xl font-semibold text-base transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2"
            >
              <Copy className="w-5 h-5" aria-hidden="true" />
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button
              onClick={() => router.push(`/game/${createdGameId}`)}
              className="w-full flex items-center justify-center gap-2.5 bg-primary-600 hover:bg-primary-700 text-white py-4 min-h-[52px] rounded-2xl font-semibold text-base transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              <Trophy className="w-5 h-5" aria-hidden="true" />
              View my game
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Sticky header */}
          <div className="sticky top-0 z-20 bg-cream-100/97 backdrop-blur-sm border-b border-cream-300 px-5 py-3">
            <div className="flex items-center gap-3 mb-3">
              {step > 1 ? (
                <button
                  onClick={() => setStep((step - 1) as Step)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream-200 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500"
                  aria-label="Go back"
                >
                  <ArrowLeft className="w-4 h-4 text-primary-600" />
                </button>
              ) : (
                <div className="w-8" />
              )}
              <div className="flex-1 flex items-center gap-1.5">
                {STEPS.map((s) => (
                  <div key={s.n} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-full h-1.5 rounded-full transition-all duration-300 ${step >= s.n ? "bg-primary-600" : "bg-cream-300"}`} />
                    <span className={`text-[10px] font-medium transition-colors ${step >= s.n ? "text-primary-600" : "text-primary-300"}`}>{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="w-8 text-right">
                <span className="text-xs font-semibold text-primary-400">{step}/3</span>
              </div>
            </div>
          </div>

          {/* Step content */}
          <div className="px-5 pt-6 pb-36">

            {/* Step 1: Sport */}
            {step === 1 && (
              <div>
                <h1 className="text-2xl font-bold text-primary-800 font-serif mb-1">What are you playing?</h1>
                <p className="text-sm text-primary-400 mb-6">Pick a sport to get started</p>

                <div className="grid grid-cols-2 gap-3">
                  {SPORT_OPTIONS.map((s) => {
                    const active = sport === s.name;
                    return (
                      <button
                        key={s.name}
                        onClick={() => handleSportSelect(s)}
                        className={`relative flex flex-col items-start gap-3 p-4 min-h-[96px] border-2 rounded-2xl text-left transition-all active:scale-[0.97] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
                          active
                            ? "border-primary-600 bg-primary-50 shadow-soft"
                            : "border-cream-300 bg-white hover:border-primary-200 hover:shadow-soft"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${s.color} text-white`}>
                          {s.icon}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-primary-800">{s.name}</p>
                          <p className="text-xs text-primary-400 flex items-center gap-1">
                            <Users className="w-3 h-3" aria-hidden="true" />
                            {s.defaultMax} players
                          </p>
                        </div>
                        {active && (
                          <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-primary-600 rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-white stroke-[2.5]" />
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
                  <h1 className="text-2xl font-bold text-primary-800 font-serif mb-1">When & where?</h1>
                  <p className="text-sm text-primary-400">Pick a date, time, and venue</p>
                </div>

                {/* Date strip */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-500 uppercase tracking-wider mb-3">
                    <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                    Date
                  </label>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
                    {dateOptions.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => { setDate(d.value); setStartTime(""); setDuration(null); }}
                        className={`flex-shrink-0 w-[68px] py-3 rounded-xl border-2 text-center transition-all active:scale-[0.97] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[60px] ${
                          date === d.value
                            ? "bg-primary-600 text-white border-primary-600"
                            : "bg-white text-primary-700 border-cream-300 hover:border-primary-200"
                        }`}
                      >
                        <p className={`text-xs font-bold ${date === d.value ? "text-white" : "text-primary-700"}`}>{d.label}</p>
                        <p className={`text-[11px] mt-0.5 ${date === d.value ? "text-primary-200" : "text-primary-400"}`}>{d.sublabel}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start time — native picker */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-500 uppercase tracking-wider mb-3" htmlFor="start-time">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    Start time
                  </label>
                  <input
                    id="start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => { setStartTime(e.target.value); setDuration(null); }}
                    className="w-full border-2 border-cream-300 rounded-xl px-4 py-3.5 min-h-[52px] text-base font-semibold text-primary-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all cursor-pointer"
                  />
                </div>

                {/* Duration — 2×2 grid, shown after start time selected */}
                {startTime && (
                  <div>
                    <label className="text-xs font-semibold text-primary-500 uppercase tracking-wider mb-3 block">
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
                            className={`flex flex-col items-center py-3 rounded-xl border-2 transition-all active:scale-[0.97] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[56px] ${
                              selected
                                ? "bg-primary-600 text-white border-primary-600"
                                : "bg-white border-cream-300 hover:border-primary-200"
                            }`}
                          >
                            <span className={`text-sm font-bold ${selected ? "text-white" : "text-primary-800"}`}>{label}</span>
                            <span className={`text-[10px] mt-0.5 ${selected ? "text-primary-200" : "text-primary-400"}`}>{fmt(endH, endM)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Venue search */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-500 uppercase tracking-wider mb-3">
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    Venue
                  </label>

                  {turfId ? (
                    <div className="flex items-center justify-between border-2 border-primary-600 rounded-xl px-4 py-3.5 bg-primary-50">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MapPin className="w-4 h-4 text-primary-500 shrink-0" aria-hidden="true" />
                        <span className="text-sm font-semibold text-primary-800 truncate">{turfName}</span>
                      </div>
                      <button
                        onClick={() => { setTurfId(""); setTurfName(""); setTurfSearch(""); }}
                        className="text-xs font-semibold text-primary-500 hover:text-primary-700 transition-colors shrink-0 ml-3 cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-300" aria-hidden="true" />
                      <input
                        ref={turfSearchRef}
                        type="text"
                        value={turfSearch}
                        onChange={(e) => setTurfSearch(e.target.value)}
                        placeholder="Search for a turf..."
                        className="w-full pl-10 pr-4 py-3.5 min-h-[52px] border-2 border-cream-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all placeholder:text-primary-300 text-primary-700"
                      />
                      {showTurfDropdown && turfResults.length > 0 && (
                        <div className="absolute z-20 top-full mt-1.5 w-full bg-white border border-cream-300 rounded-2xl shadow-elevated overflow-hidden">
                          {turfResults.map((turf) => (
                            <button
                              key={turf.id}
                              onClick={() => { setTurfId(turf.id); setTurfName(turf.name); setShowTurfDropdown(false); setTurfSearch(""); }}
                              className="w-full text-left px-4 py-3.5 hover:bg-primary-50 border-b border-cream-200 last:border-0 transition-colors cursor-pointer"
                            >
                              <p className="text-sm font-semibold text-primary-800">{turf.name}</p>
                              <p className="text-xs text-primary-400 flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" aria-hidden="true" />
                                {turf.address}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                      {turfSearch.length >= 2 && turfResults.length === 0 && (
                        <p className="absolute z-20 top-full mt-1.5 w-full bg-white border border-cream-200 rounded-xl px-4 py-3 text-sm text-primary-400 shadow-soft">
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
                  <h1 className="text-2xl font-bold text-primary-800 font-serif mb-1">Game details</h1>
                  <p className="text-sm text-primary-400">Almost there</p>
                </div>

                {/* Quick summary */}
                <div className="flex items-center gap-3 bg-primary-50 border border-primary-100 rounded-xl px-4 py-3">
                  {selectedSportObj && (
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br ${selectedSportObj.color} text-white shrink-0`}>
                      {selectedSportObj.icon}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-primary-800 truncate">{sport} · {turfName}</p>
                    <p className="text-xs text-primary-400 mt-0.5">
                      {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                      {startTime && endTime && (() => {
                        const [sh, sm] = startTime.split(":").map(Number);
                        const [eh, em] = endTime.split(":").map(Number);
                        return ` · ${fmt(sh, sm)} – ${fmt(eh, em)}`;
                      })()}
                    </p>
                  </div>
                </div>

                {/* Skill level */}
                <div>
                  <label className="block text-xs font-semibold text-primary-500 uppercase tracking-wider mb-3">Skill level</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SKILL_LEVELS.map((level) => (
                      <button
                        key={level.value}
                        onClick={() => setSkillLevel(level.value)}
                        className={`flex flex-col items-start px-4 py-3 min-h-[56px] rounded-xl border-2 transition-all active:scale-[0.97] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                          skillLevel === level.value
                            ? "bg-primary-600 text-white border-primary-600"
                            : "bg-white text-primary-700 border-cream-300 hover:border-primary-200"
                        }`}
                      >
                        <span className={`text-sm font-bold ${skillLevel === level.value ? "text-white" : "text-primary-800"}`}>{level.label}</span>
                        <span className={`text-[11px] ${skillLevel === level.value ? "text-primary-200" : "text-primary-400"}`}>{level.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Max players */}
                <div>
                  <label className="block text-xs font-semibold text-primary-500 uppercase tracking-wider mb-3">Max players</label>
                  <div className="flex items-center gap-4 bg-white border border-cream-300 rounded-xl px-4 py-3">
                    <button
                      onClick={() => setMaxPlayers(Math.max(2, maxPlayers - 1))}
                      className="w-10 h-10 flex items-center justify-center border border-cream-300 rounded-lg hover:border-primary-300 hover:bg-primary-50 active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500"
                      aria-label="Decrease"
                    >
                      <Minus className="w-4 h-4 text-primary-600" />
                    </button>
                    <div className="flex-1 text-center">
                      <span className="text-2xl font-bold text-primary-800 font-serif">{maxPlayers}</span>
                      <span className="text-sm text-primary-400 ml-2">players</span>
                    </div>
                    <button
                      onClick={() => setMaxPlayers(Math.min(50, maxPlayers + 1))}
                      className="w-10 h-10 flex items-center justify-center border border-cream-300 rounded-lg hover:border-primary-300 hover:bg-primary-50 active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500"
                      aria-label="Increase"
                    >
                      <Plus className="w-4 h-4 text-primary-600" />
                    </button>
                  </div>
                </div>

                {/* Cost per person */}
                <div>
                  <label className="block text-xs font-semibold text-primary-500 uppercase tracking-wider mb-3">Cost per person</label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {COST_OPTIONS.slice(0, 4).map((price) => (
                      <button
                        key={price}
                        onClick={() => { setCostPerPerson(price); setCustomCost(""); }}
                        className={`py-2.5 min-h-[44px] rounded-xl border-2 text-sm font-bold transition-all active:scale-[0.97] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                          costPerPerson === price && !customCost
                            ? "bg-primary-600 text-white border-primary-600"
                            : "bg-white text-primary-700 border-cream-300 hover:border-primary-200"
                        }`}
                      >
                        {price === 0 ? "Free" : `₹${price}`}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {COST_OPTIONS.slice(4).map((price) => (
                      <button
                        key={price}
                        onClick={() => { setCostPerPerson(price); setCustomCost(""); }}
                        className={`py-2.5 min-h-[44px] rounded-xl border-2 text-sm font-bold transition-all active:scale-[0.97] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                          costPerPerson === price && !customCost
                            ? "bg-primary-600 text-white border-primary-600"
                            : "bg-white text-primary-700 border-cream-300 hover:border-primary-200"
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
                      className="col-span-3 border-2 border-cream-300 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-primary-700 bg-white min-h-[44px]"
                      placeholder="₹ custom"
                    />
                  </div>
                </div>

                {/* Turf booked toggle */}
                <div className="flex items-center justify-between bg-white border border-cream-300 rounded-xl px-4 py-3.5">
                  <div>
                    <p className="text-sm font-semibold text-primary-800">Turf already booked?</p>
                    <p className="text-xs text-primary-400 mt-0.5">Let players know it&apos;s confirmed</p>
                  </div>
                  <button
                    onClick={() => setTurfBooked(!turfBooked)}
                    className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${turfBooked ? "bg-primary-600" : "bg-cream-300"}`}
                    role="switch"
                    aria-checked={turfBooked}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${turfBooked ? "translate-x-6" : ""}`} />
                  </button>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-primary-500 uppercase tracking-wider mb-3" htmlFor="notes">
                    Notes <span className="normal-case font-normal text-primary-300">(optional)</span>
                  </label>
                  <input
                    id="notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Bring your own shoes, jersey colour: red"
                    className="w-full border-2 border-cream-300 rounded-xl px-4 py-3.5 min-h-[52px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all placeholder:text-primary-300 text-primary-700"
                  />
                </div>

                {submitError && (
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm text-red-700 font-medium">{submitError}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sticky bottom CTA */}
          {step === 2 && (
            <div className="fixed bottom-0 left-0 right-0 z-30 bg-cream-100/97 backdrop-blur-sm border-t border-cream-300 px-5 py-4 safe-area-pb">
              <button
                onClick={() => setStep(3)}
                disabled={!step2Valid}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-4 min-h-[52px] rounded-2xl font-bold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Continue
              </button>
            </div>
          )}
          {step === 3 && (
            <div className="fixed bottom-0 left-0 right-0 z-30 bg-cream-100/97 backdrop-blur-sm border-t border-cream-300 px-5 py-4 safe-area-pb">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-4 min-h-[52px] rounded-2xl font-bold text-base transition-all disabled:opacity-50 active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> Creating...</>
                ) : (
                  <><Sparkles className="w-5 h-5" aria-hidden="true" /> Create Game</>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
