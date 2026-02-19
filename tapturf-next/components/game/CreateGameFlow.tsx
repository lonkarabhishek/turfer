"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, MapPin, Search, Share2, Copy, Trophy, Clock, Calendar } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createGame } from "@/lib/queries/games";
import { searchTurfs } from "@/lib/queries/users";
import type { CreateGameData } from "@/types/game";

const SPORT_OPTIONS = [
  { name: "Football", icon: "\u26bd", defaultMax: 14 },
  { name: "5v5 Football", icon: "\u26bd", defaultMax: 10 },
  { name: "Cricket", icon: "\ud83c\udfd0", defaultMax: 22 },
  { name: "Box Cricket", icon: "\ud83c\udfd0", defaultMax: 12 },
  { name: "Basketball", icon: "\ud83c\udfc0", defaultMax: 10 },
  { name: "Tennis", icon: "\ud83c\udfbe", defaultMax: 4 },
  { name: "Pickleball", icon: "\ud83c\udfd3", defaultMax: 4 },
  { name: "Badminton", icon: "\ud83c\udff8", defaultMax: 4 },
];

const SKILL_LEVELS = [
  { value: "all" as const, label: "All levels" },
  { value: "beginner" as const, label: "Beginner" },
  { value: "intermediate" as const, label: "Intermediate" },
  { value: "advanced" as const, label: "Advanced" },
];

type Step = 1 | 2 | 3 | 4;

function formatSlotLabel(hour: number, min: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h}:${min.toString().padStart(2, "0")} ${ampm}`;
}

function formatTimeValue(hour: number, min: number): string {
  return `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}

function addHour(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const newH = Math.min(h + 1, 23);
  return formatTimeValue(newH, m);
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

  // Form state
  const [sport, setSport] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [turfId, setTurfId] = useState("");
  const [turfName, setTurfName] = useState("");
  const [turfSearch, setTurfSearch] = useState("");
  const [turfResults, setTurfResults] = useState<{ id: string; name: string; address: string }[]>([]);
  const [showTurfDropdown, setShowTurfDropdown] = useState(false);
  const [skillLevel, setSkillLevel] = useState<CreateGameData["skillLevel"]>("all");
  const [costPerPerson, setCostPerPerson] = useState(100);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [turfBooked, setTurfBooked] = useState(false);
  const [isToday, setIsToday] = useState(true);

  // Show login modal once if not logged in
  useEffect(() => {
    if (!authLoading && !user && !hasTriggeredLogin) {
      setHasTriggeredLogin(true);
      login();
    }
  }, [authLoading, user, login, hasTriggeredLogin]);

  // Search turfs
  useEffect(() => {
    if (turfSearch.length < 2) { setTurfResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await searchTurfs(turfSearch);
      setTurfResults(data);
      setShowTurfDropdown(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [turfSearch]);

  // Set today's date as default
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setDate(today);
    setIsToday(true);
  }, []);

  // Auto-set end time when start time is selected (+1 hour)
  useEffect(() => {
    if (startTime) {
      setEndTime(addHour(startTime));
    }
  }, [startTime]);

  // Generate time slots — next 6 hours in 30-min gaps
  const timeSlots = useMemo(() => {
    const slots: { label: string; value: string }[] = [];
    const now = new Date();

    let startHour: number;
    let startMin: number;

    if (isToday) {
      // Round up to the next 30-min slot
      const currentMin = now.getMinutes();
      startHour = now.getHours();
      if (currentMin < 30) {
        startMin = 30;
      } else {
        startMin = 0;
        startHour += 1;
      }
    } else {
      // For future dates, show from 6:00 AM
      startHour = 6;
      startMin = 0;
    }

    const maxSlots = isToday ? 12 : 34; // 6 hours (12 slots) for today, 6AM-11PM for future
    const endHourLimit = isToday ? startHour + 6 : 23;

    let h = startHour;
    let m = startMin;
    let count = 0;

    while (count < maxSlots && h <= endHourLimit) {
      if (h > 23) break;
      slots.push({
        label: formatSlotLabel(h, m),
        value: formatTimeValue(h, m),
      });
      count++;
      m += 30;
      if (m >= 60) {
        m = 0;
        h += 1;
      }
    }

    return slots;
  }, [isToday]);

  // Date options — today + next 6 days
  const dateOptions = useMemo(() => {
    const options: { label: string; sublabel: string; value: string; isToday: boolean }[] = [];
    const now = new Date();

    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const value = d.toISOString().split("T")[0];
      const dayName = d.toLocaleDateString("en-IN", { weekday: "short" });
      const dateNum = d.getDate();
      const month = d.toLocaleDateString("en-IN", { month: "short" });

      options.push({
        label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayName,
        sublabel: `${dateNum} ${month}`,
        value,
        isToday: i === 0,
      });
    }

    return options;
  }, []);

  const handleSportSelect = (s: typeof SPORT_OPTIONS[0]) => {
    setSport(s.name);
    setMaxPlayers(s.defaultMax);
    setStep(2);
  };

  const handleDateSelect = (dateValue: string, today: boolean) => {
    setDate(dateValue);
    setIsToday(today);
    setStartTime("");
    setEndTime("");
  };

  const handleSubmit = async () => {
    if (!user) {
      login();
      return;
    }

    setSubmitError("");
    setSubmitting(true);

    const gameData: CreateGameData = {
      turfId,
      date,
      startTime,
      endTime,
      sport,
      format: sport,
      skillLevel,
      maxPlayers,
      costPerPerson,
      description: description || undefined,
      notes: notes || undefined,
      turfBooked,
    };

    const { data, error } = await createGame(gameData, {
      id: user.id,
      name: user.name,
      phone: user.phone,
      profile_image_url: user.profile_image_url,
    });

    setSubmitting(false);

    if (data && !error) {
      setCreatedGameId(data.id);
      setStep(4);
    } else {
      setSubmitError(error || "Failed to create game. Please try again.");
    }
  };

  const handleCopyLink = async () => {
    if (createdGameId) {
      await navigator.clipboard.writeText(`${window.location.origin}/game/${createdGameId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsAppShare = () => {
    if (createdGameId) {
      const text = `Join my ${sport} game on TapTurf! ${window.location.origin}/game/${createdGameId}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500 mt-3">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trophy className="w-7 h-7 text-gray-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Log in to create a game</h2>
        <p className="text-sm text-gray-500 mb-6">You need an account to host games on TapTurf</p>
        <button
          onClick={login}
          className="bg-gray-900 text-white px-8 py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
        >
          Log in or sign up
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-6 pb-24">
      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${s <= step ? "bg-gray-900" : "bg-gray-200"}`} />
        ))}
      </div>

      {/* Back button */}
      {step > 1 && step < 4 && (
        <button
          onClick={() => setStep((step - 1) as Step)}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      )}

      {/* Step 1: Choose Sport */}
      {step === 1 && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Choose a sport</h1>
          <p className="text-sm text-gray-500 mb-6">What are you playing?</p>

          <div className="grid grid-cols-2 gap-3">
            {SPORT_OPTIONS.map((s) => (
              <button
                key={s.name}
                onClick={() => handleSportSelect(s)}
                className={`flex items-center gap-3 p-4 border rounded-2xl text-left transition-all hover:shadow-md active:scale-[0.98] ${
                  sport === s.name ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400"
                }`}
              >
                <span className="text-2xl">{s.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.defaultMax} players</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: When & Where */}
      {step === 2 && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">When & where</h1>
          <p className="text-sm text-gray-500 mb-6">Pick a time slot and venue</p>

          <div className="space-y-6">
            {/* Date pills */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2.5">
                <Calendar className="w-4 h-4" />
                Date
              </label>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {dateOptions.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => handleDateSelect(d.value, d.isToday)}
                    className={`flex-shrink-0 px-4 py-2.5 rounded-xl border text-center transition-all active:scale-[0.97] ${
                      date === d.value
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <p className={`text-xs font-semibold ${date === d.value ? "text-white" : "text-gray-900"}`}>{d.label}</p>
                    <p className={`text-[10px] mt-0.5 ${date === d.value ? "text-gray-300" : "text-gray-500"}`}>{d.sublabel}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Start time slots */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2.5">
                <Clock className="w-4 h-4" />
                Start time
              </label>
              {timeSlots.length === 0 ? (
                <p className="text-sm text-gray-400 py-3">No slots available for today. Try tomorrow!</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {timeSlots.map((slot) => (
                    <button
                      key={slot.value}
                      onClick={() => setStartTime(slot.value)}
                      className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all active:scale-[0.97] ${
                        startTime === slot.value
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* End time (auto-filled, editable) */}
            {startTime && (
              <div className="animate-fade-in">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End time
                </label>
                <div className="flex gap-2">
                  {[0.5, 1, 1.5, 2].map((hours) => {
                    const [h, m] = startTime.split(":").map(Number);
                    const totalMin = h * 60 + m + hours * 60;
                    const endH = Math.floor(totalMin / 60);
                    const endM = totalMin % 60;
                    if (endH > 23) return null;
                    const val = formatTimeValue(endH, endM);
                    const label = hours === 0.5 ? "30 min" : hours === 1 ? "1 hr" : hours === 1.5 ? "1.5 hr" : "2 hr";
                    return (
                      <button
                        key={val}
                        onClick={() => setEndTime(val)}
                        className={`flex-1 py-2.5 rounded-xl border text-center transition-all active:scale-[0.97] ${
                          endTime === val
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        <p className={`text-sm font-semibold ${endTime === val ? "text-white" : "text-gray-900"}`}>{label}</p>
                        <p className={`text-[10px] mt-0.5 ${endTime === val ? "text-gray-300" : "text-gray-500"}`}>{formatSlotLabel(endH, endM)}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Turf search */}
            <div className="relative">
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
                <MapPin className="w-4 h-4" />
                Venue
              </label>
              {turfId ? (
                <div className="flex items-center justify-between border border-gray-900 rounded-xl px-4 py-3 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary-500" />
                    <span className="text-sm font-medium text-gray-900">{turfName}</span>
                  </div>
                  <button onClick={() => { setTurfId(""); setTurfName(""); setTurfSearch(""); }} className="text-xs text-gray-500 underline">Change</button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={turfSearch}
                    onChange={(e) => setTurfSearch(e.target.value)}
                    placeholder="Search for a turf..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  {showTurfDropdown && turfResults.length > 0 && (
                    <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {turfResults.map((turf) => (
                        <button
                          key={turf.id}
                          onClick={() => {
                            setTurfId(turf.id);
                            setTurfName(turf.name);
                            setShowTurfDropdown(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                        >
                          <p className="text-sm font-medium text-gray-900">{turf.name}</p>
                          <p className="text-xs text-gray-500">{turf.address}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setStep(3)}
            disabled={!date || !startTime || !endTime || !turfId}
            className="w-full mt-8 flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step 3: Details & Confirm */}
      {step === 3 && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Game details</h1>
          <p className="text-sm text-gray-500 mb-6">Set players, cost, and create your game</p>

          <div className="space-y-5">
            {/* Summary card */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Sport</span>
                <span className="text-sm font-semibold text-gray-900">{sport}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Date</span>
                <span className="text-sm font-semibold text-gray-900">{new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Time</span>
                <span className="text-sm font-semibold text-gray-900">
                  {(() => {
                    const [sh, sm] = startTime.split(":").map(Number);
                    const [eh, em] = endTime.split(":").map(Number);
                    return `${formatSlotLabel(sh, sm)} - ${formatSlotLabel(eh, em)}`;
                  })()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Venue</span>
                <span className="text-sm font-semibold text-gray-900 text-right max-w-[60%] truncate">{turfName}</span>
              </div>
            </div>

            {/* Skill level */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Skill level</label>
              <div className="flex gap-2 flex-wrap">
                {SKILL_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => setSkillLevel(level.value)}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors active:scale-[0.97] ${
                      skillLevel === level.value
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Max players */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Max players</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMaxPlayers(Math.max(2, maxPlayers - 1))}
                  className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-xl text-lg font-medium hover:bg-gray-50 active:scale-95 transition-all"
                >
                  -
                </button>
                <span className="text-lg font-bold text-gray-900 w-8 text-center">{maxPlayers}</span>
                <button
                  onClick={() => setMaxPlayers(Math.min(50, maxPlayers + 1))}
                  className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-xl text-lg font-medium hover:bg-gray-50 active:scale-95 transition-all"
                >
                  +
                </button>
              </div>
            </div>

            {/* Cost */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Cost per person</label>
              <div className="flex gap-2 flex-wrap">
                {[0, 50, 100, 150, 200, 300].map((price) => (
                  <button
                    key={price}
                    onClick={() => setCostPerPerson(price)}
                    className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors active:scale-[0.97] ${
                      costPerPerson === price
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {price === 0 ? "Free" : `₹${price}`}
                  </button>
                ))}
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={costPerPerson}
                  onChange={(e) => setCostPerPerson(parseInt(e.target.value) || 0)}
                  className="w-24 border border-gray-300 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="Custom"
                />
              </div>
            </div>

            {/* Turf booked */}
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">Turf already booked?</p>
                <p className="text-xs text-gray-500">Let players know</p>
              </div>
              <button
                onClick={() => setTurfBooked(!turfBooked)}
                className={`relative w-11 h-6 rounded-full transition-colors ${turfBooked ? "bg-green-500" : "bg-gray-300"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${turfBooked ? "translate-x-5" : ""}`} />
              </button>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Bring your own shoes, jersey colors..."
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          {submitError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full mt-8 bg-accent-500 hover:bg-accent-600 text-white py-3.5 rounded-xl font-semibold text-base transition-colors disabled:opacity-50 active:scale-[0.98]"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </span>
            ) : (
              "Create Game"
            )}
          </button>
        </div>
      )}

      {/* Step 4: Success */}
      {step === 4 && (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Game created!</h1>
          <p className="text-sm text-gray-500 mb-8">Share it with your friends so they can join.</p>

          <div className="space-y-3">
            <button
              onClick={handleWhatsAppShare}
              className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#20bd5a] transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Share on WhatsApp
            </button>

            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 py-3 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
            >
              <Copy className="w-4 h-4" />
              {copied ? "Link copied!" : "Copy link"}
            </button>

            <button
              onClick={() => router.push(`/game/${createdGameId}`)}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
            >
              <Trophy className="w-4 h-4" />
              View Game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
