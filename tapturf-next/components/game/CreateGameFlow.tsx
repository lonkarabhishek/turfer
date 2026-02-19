"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, MapPin, Search, Share2, Copy, Trophy } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createGame } from "@/lib/queries/games";
import { searchTurfs } from "@/lib/queries/users";
import type { CreateGameData } from "@/types/game";

const SPORT_OPTIONS = [
  { name: "Football", icon: "\u26bd", defaultMax: 14, defaultFormat: "7v7" },
  { name: "5v5 Football", icon: "\u26bd", defaultMax: 10, defaultFormat: "5v5" },
  { name: "Cricket", icon: "\ud83c\udfd0", defaultMax: 22, defaultFormat: "Full" },
  { name: "Box Cricket", icon: "\ud83c\udfd0", defaultMax: 12, defaultFormat: "6v6" },
  { name: "Basketball", icon: "\ud83c\udfc0", defaultMax: 10, defaultFormat: "5v5" },
  { name: "Tennis", icon: "\ud83c\udfbe", defaultMax: 4, defaultFormat: "Doubles" },
  { name: "Pickleball", icon: "\ud83c\udfd3", defaultMax: 4, defaultFormat: "Doubles" },
];

const SKILL_LEVELS = [
  { value: "all" as const, label: "All levels" },
  { value: "beginner" as const, label: "Beginner" },
  { value: "intermediate" as const, label: "Intermediate" },
  { value: "advanced" as const, label: "Advanced" },
];

type Step = 1 | 2 | 3 | 4;

export function CreateGameFlow() {
  const { user, login, loading: authLoading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdGameId, setCreatedGameId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [sport, setSport] = useState("");
  const [format, setFormat] = useState("");
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

  // Show login modal if not logged in (don't redirect away)
  useEffect(() => {
    if (!authLoading && !user) {
      login();
    }
  }, [authLoading, user, login]);

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
  }, []);

  const handleSportSelect = (s: typeof SPORT_OPTIONS[0]) => {
    setSport(s.name);
    setFormat(s.defaultFormat);
    setMaxPlayers(s.defaultMax);
    setStep(2);
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
      format,
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
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-sm text-gray-500">Please log in to create a game.</p>
        <button
          onClick={login}
          className="mt-4 bg-gray-900 text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
        >
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-6">
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
                className={`flex items-center gap-3 p-4 border rounded-2xl text-left transition-all hover:shadow-md ${
                  sport === s.name ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400"
                }`}
              >
                <span className="text-2xl">{s.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.defaultFormat} · {s.defaultMax} players</p>
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
          <p className="text-sm text-gray-500 mb-6">Set the date, time, and venue</p>

          <div className="space-y-5">
            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {/* Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Start time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">End time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>

            {/* Turf search */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Venue</label>
              {turfId ? (
                <div className="flex items-center justify-between border border-gray-900 rounded-xl px-4 py-3">
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

            {/* Skill level */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Skill level</label>
              <div className="flex gap-2 flex-wrap">
                {SKILL_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => setSkillLevel(level.value)}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
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

      {/* Step 3: Details */}
      {step === 3 && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Game details</h1>
          <p className="text-sm text-gray-500 mb-6">Set players, cost, and other details</p>

          <div className="space-y-5">
            {/* Max players */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Max players</label>
              <input
                type="number"
                min={2}
                max={50}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(parseInt(e.target.value) || 2)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {/* Cost */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Cost per person (₹)</label>
              <input
                type="number"
                min={0}
                step={50}
                value={costPerPerson}
                onChange={(e) => setCostPerPerson(parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            {/* Turf booked */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Turf booked?</p>
                <p className="text-xs text-gray-500">Have you already booked the turf?</p>
              </div>
              <button
                onClick={() => setTurfBooked(!turfBooked)}
                className={`relative w-11 h-6 rounded-full transition-colors ${turfBooked ? "bg-gray-900" : "bg-gray-300"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${turfBooked ? "translate-x-5" : ""}`} />
              </button>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell players about this game..."
                rows={3}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Bring your own shoes"
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
            className="w-full mt-6 bg-accent-500 hover:bg-accent-600 text-white py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating game..." : "Create Game"}
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
