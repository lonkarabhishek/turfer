import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Search, Upload, Building2, Check, X, Filter, LocateFixed, Bug, Wallet, Plus, Users } from "lucide-react";
import { ResponsiveContainer, AreaChart, CartesianGrid, BarChart, Bar, XAxis, YAxis, Tooltip, Area, Line } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Badge } from "./components/ui/badge";
import { Label } from "./components/ui/label";
import { Textarea } from "./components/ui/textarea";

import { SmartBookingModal } from "./components/SmartBookingModal";
import { AssistantWidget } from "./components/AssistantWidget";
import { TopNav } from "./components/TopNav";
import { MobileNav } from "./components/MobileNav";
import { TurfCard, type TurfData } from "./components/TurfCard";
import { GameCard, type GameData } from "./components/GameCard";
import { CreateGameFlow } from "./components/CreateGameFlow";
import { type SmartQuery } from "./lib/smartTime";
import { analytics, track } from "./lib/analytics";
// Removed unused import

// ---------- Types ----------
type TurfSeed = {
  name: string;
  address: string | null;
  rating: number | null;
  totalReviews: number | null;
  pricePerHourMin: number | null;
  pricePerHourMax: number | null;
  amenities: string[];
  sports: string[];
  hours: Record<string, string | null>;
  contacts: Record<string, string | null>;
  reviews: { positive: string | null; negative: string | null };
  source_ids: string | null;
  Google_Maps_URL?: string | null;
};

// Use TurfData from TurfCard component
type DisplayTurf = TurfData;

// Sample game data
const SAMPLE_GAMES: GameData[] = [
  {
    id: "game_1",
    hostName: "Rahul Sharma",
    hostAvatar: "",
    turfName: "Big Bounce Turf",
    turfAddress: "Govind Nagar Link Road, Govind Nagar",
    date: "Today",
    timeSlot: "07:00-08:00 PM",
    format: "7v7 Football",
    skillLevel: "Intermediate",
    currentPlayers: 12,
    maxPlayers: 14,
    costPerPerson: 100,
    notes: "Need 2 more players. Bring your own water bottles!",
    hostPhone: "9876543210",
    distanceKm: 1.2,
    isUrgent: true
  },
  {
    id: "game_2",
    hostName: "Priya Patel",
    turfName: "Greenfield The Multisports Turf",
    turfAddress: "Near K.K. Wagh Engineering, Gangotri Vihar",
    date: "Tomorrow",
    timeSlot: "06:00-07:00 AM",
    format: "Cricket",
    skillLevel: "All levels",
    currentPlayers: 8,
    maxPlayers: 16,
    costPerPerson: 75,
    hostPhone: "9876543212",
    distanceKm: 2.8
  },
  {
    id: "game_3",
    hostName: "Amit Kumar",
    turfName: "Kridabhumi The Multisports Turf",
    turfAddress: "Tigraniya Road, Dwarka",
    date: "Sunday",
    timeSlot: "08:00-09:00 PM",
    format: "5v5 Football",
    skillLevel: "Advanced",
    currentPlayers: 8,
    maxPlayers: 10,
    costPerPerson: 120,
    notes: "Competitive level. Looking for skilled players only.",
    hostPhone: "9876543211",
    distanceKm: 3.5
  }
];

// Sample data fallback
const SAMPLE_TURFS: TurfSeed[] = [
  {
    name: "Big Bounce Turf",
    address: "Govind Nagar Link Road, Govind Nagar, 422009",
    rating: 4.4,
    totalReviews: 456,
    pricePerHourMin: 600,
    pricePerHourMax: null,
    amenities: ["Artificial Turf", "Flood lights", "Parking", "Washroom"],
    sports: ["Box Cricket", "Football", "Cricket", "Yoga"],
    hours: { mon: "06:00 AM", tue: "06:00 AM", wed: "06:00 AM", thu: "06:00 AM", fri: "06:00 AM", sat: "06:00 AM", sun: "06:00 AM", notes: "Closes 11:00 PM daily" },
    contacts: { phone: "9876543210", email: "", website: "", facebook: "", instagram: "", gmap: "" },
    reviews: { positive: "Spacious, well-maintained, quality pitch, friendly staff", negative: "Needs better bats / green shade" },
    source_ids: "[1,2,4,5]"
  },
  {
    name: "Kridabhumi The Multisports Turf",
    address: "Tigraniya Road, Dwarka, 422011",
    rating: 4.5,
    totalReviews: 145,
    pricePerHourMin: 600,
    pricePerHourMax: null,
    amenities: ["Artificial Turf", "Drinking Water", "First Aid", "Parking", "Washroom"],
    sports: ["Box Football", "Cricket", "Tennis", "Basketball", "Yoga"],
    hours: { mon: "06:00 AM", tue: "06:00 AM", wed: "06:00 AM", thu: "06:00 AM", fri: "06:00 AM", sat: "06:00 AM", sun: "06:00 AM", notes: "Closes 11:30 PM daily" },
    contacts: { phone: "9876543211", email: "", website: "https://www.kridabhumi.com", facebook: "", instagram: "", gmap: "" },
    reviews: { positive: "High-quality equipment, spacious, coaching camp", negative: "" },
    source_ids: "[10,11]"
  },
  {
    name: "Greenfield The Multisports Turf",
    address: "Near K.K. Wagh Engineering, Gangotri Vihar, 422003",
    rating: 4.6,
    totalReviews: 143,
    pricePerHourMin: 600,
    pricePerHourMax: 800,
    amenities: ["Drinking Water", "Parking", "Washroom"],
    sports: ["Football", "Cricket", "Yoga"],
    hours: { mon: "06:00 AM", tue: "06:00 AM", wed: "06:00 AM", thu: "06:00 AM", fri: "06:00 AM", sat: "06:00 AM", sun: "06:00 AM", notes: "Closes 11:00 PM daily" },
    contacts: { phone: "9876543212", email: "", website: "", facebook: "", instagram: "", gmap: "" },
    reviews: { positive: "One of the best multi sports turf in Nashik", negative: "" },
    source_ids: "[1,12]"
  }
];

// ---------- Utils ----------
function formatINR(x: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(x);
}

function filterTurfs(
  turfs: Array<{ name: string; address: string; pricePerHour: number; rating: number; slots: string[]; amenities: string[] }>,
  { query = "", priceCap = Infinity, rating = 0, time = "" }
) {
  const q = (query || "").toLowerCase();
  const t = (time || "").toLowerCase();
  return (turfs || []).filter((tur) =>
    (!q || tur.name.toLowerCase().includes(q) || tur.address.toLowerCase().includes(q)) &&
    (tur.pricePerHour <= priceCap) &&
    (tur.rating >= rating) &&
    (!t || tur.slots.some((s) => (s || "").toLowerCase().includes(t)))
  );
}

// ---------- Time & slot helpers ----------
function parseTime12h(s?: string | null) {
  if (!s) return null;
  const m = String(s).trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let [, hh, mm, ap] = m;
  let h = parseInt(hh, 10) % 12;
  if (/pm/i.test(ap)) h += 12;
  return { h, m: parseInt(mm, 10) };
}

function minutesToLabel(m: number) {
  const h24 = Math.floor(m / 60), mm = m % 60, ap = h24 >= 12 ? "PM" : "AM";
  const h12 = ((h24 + 11) % 12) + 1, mmStr = mm.toString().padStart(2, "0");
  return `${h12.toString().padStart(2, "0")}:${mmStr} ${ap}`;
}

function deriveSlotsFromHours(hours: { [k: string]: string | null }) {
  const openSamples = [hours?.mon, hours?.tue, hours?.wed, hours?.thu, hours?.fri, hours?.sat, hours?.sun].filter(Boolean) as string[];
  const open24 = openSamples.some(v => /24\s*Hrs?/i.test(v));
  let closeMins = 23 * 60;
  const note = hours?.notes || "";
  const closeMatch = note.match(/Closes\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (closeMatch) {
    const t = parseTime12h(`${closeMatch[1]}:${closeMatch[2]} ${closeMatch[3]}`);
    if (t) closeMins = t.h * 60 + t.m;
  }
  const openMatch = (openSamples[0] && parseTime12h(openSamples[0])) || { h: 6, m: 0 };
  const openMins = open24 ? 0 : (openMatch.h * 60 + openMatch.m) || (6 * 60);
  const slots: string[] = [];
  const start = Math.max(openMins, 6 * 60);
  const end = Math.max(start + 60, Math.min(closeMins, 23 * 60));
  for (let m = start; m < end; m += 60) {
    const s = minutesToLabel(m), e = minutesToLabel(m + 60);
    slots.push(`${s.replace(':00','')} - ${e.replace(':00','')}`);
  }
  const popular = slots.filter(s => /06\s?AM|07\s?AM|08\s?PM|09\s?PM/i.test(s)).slice(0, 4);
  return { slots, popular };
}

// ---------- Data mapping ----------
function toDisplayTurf(t: TurfSeed, _userCoords: { lat: number; lng: number } | null): DisplayTurf {
  const { popular } = deriveSlotsFromHours(t.hours || {});
  const mn = t.pricePerHourMin ?? null, mx = t.pricePerHourMax ?? null;
  const priceDisplay = mn && mx ? `₹${mn}–₹${mx}/hr` : (mn ? `₹${mn}+/hr` : "Contact for fee");
  return {
    id: t.name + "|" + (t.address || ""), 
    name: t.name, 
    address: t.address || "",
    rating: t.rating ?? 0, 
    totalReviews: t.totalReviews ?? 0,
    pricePerHour: mn || undefined, 
    pricePerHourMin: mn || undefined, 
    pricePerHourMax: mx || undefined, 
    priceDisplay,
    amenities: t.amenities || [], 
    images: [], 
    slots: popular, 
    contacts: t.contacts || {}, 
    coords: null, 
    distanceKm: Math.random() * 5, // Mock distance for demo
    nextAvailable: popular[0] || "Contact for availability",
    isPopular: t.rating ? t.rating >= 4.5 : false,
    hasLights: t.amenities?.some(a => a.toLowerCase().includes('light')) || false
  };
}

// ---------- UI Components ----------

function HeroSection({ currentCity = 'Nashik' }: { currentCity?: string }) {
  return (
    <div className="relative bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary-600/20 to-transparent" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center text-white space-y-4">
          <motion.h1 
            className="text-3xl sm:text-5xl font-bold tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Play tonight in {currentCity}.
          </motion.h1>
          
          <motion.p 
            className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Find a turf or find a team in 10 seconds — no app needed.
          </motion.p>
        </div>
      </div>
    </div>
  );
}

function SearchBar({ query, setQuery, onLocate, filtersOpen, setFiltersOpen, onSmart, currentCity = 'Nashik' }: any) {
  const handleSearch = () => {
    analytics.searchSubmitted(query, { has_filters: filtersOpen });
  };

  return (
    <div className="max-w-5xl mx-auto -mt-8 relative z-10 px-4">
      <motion.div 
        className="bg-white rounded-2xl shadow-airbnb border p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <div className="flex items-center gap-2 mb-3 sm:mb-0">
          <Input 
            value={query} 
            onChange={(e) => setQuery(e.target.value)} 
            placeholder={`Search ${currentCity} turfs, areas, or amenities…`}
            className="border-0 focus-visible:ring-0 text-base flex-1"
            aria-label="Search turfs"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button 
            className="bg-primary-600 hover:bg-primary-700 hidden sm:flex" 
            aria-label="Search turfs"
            onClick={handleSearch}
          >
            <Search className="w-4 h-4 mr-2"/>Search
          </Button>
        </div>
        
        {/* Mobile action buttons */}
        <div className="flex items-center gap-2 sm:hidden">
          <Button variant="outline" size="sm" onClick={onLocate} className="flex-1">
            <LocateFixed className="w-4 h-4 mr-1"/>Near me
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)} className="flex-1">
            <Filter className="w-4 h-4 mr-1"/>Filters
          </Button>
          <Button variant="outline" size="sm" onClick={onSmart} className="flex-1">
            AI
          </Button>
        </div>
        
        {/* Desktop action buttons */}
        <div className="hidden sm:flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onLocate}>
              <LocateFixed className="w-4 h-4 mr-2"/>Near me
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)}>
              <Filter className="w-4 h-4 mr-2"/>Filters
            </Button>
            <Button variant="outline" size="sm" onClick={onSmart}>
              Ask AI to book
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function GamesYouCanJoin({ games }: { games: GameData[] }) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Games you can join now</h3>
          <p className="text-sm text-gray-600">Live games looking for players</p>
        </div>
        <Badge className="bg-primary-100 text-primary-700 border border-primary-200">
          <Users className="w-3 h-3 mr-1" />
          Community
        </Badge>
      </div>
      
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {games.slice(0, 6).map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
      
      {games.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No active games right now</p>
          <Button className="mt-4 bg-primary-600 hover:bg-primary-700">
            <Plus className="w-4 h-4 mr-2" />
            Create the first game
          </Button>
        </div>
      )}
    </section>
  );
}

function NearYouSection({ turfs, currentCity = 'Nashik' }: { turfs: DisplayTurf[]; currentCity?: string }) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Near you ({currentCity})</h3>
          <p className="text-sm text-gray-600">Closest turfs based on your location</p>
        </div>
      </div>
      
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 w-max sm:w-full sm:grid sm:grid-cols-2 lg:grid-cols-3">
          {turfs.slice(0, 6).map((turf) => (
            <div key={turf.id} className="w-80 sm:w-full flex-shrink-0">
              <TurfCard turf={turf} variant="compact" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BottomCTASection() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 p-4 sm:hidden">
      <div className="flex gap-3">
        <Button 
          className="flex-1 bg-primary-600 hover:bg-primary-700 text-white"
          onClick={() => track('whatsapp_cta_clicked', { action: 'find_turf', context: 'bottom_cta' })}
        >
          Find a turf
        </Button>
        <Button 
          variant="outline"
          className="flex-1 border-primary-600 text-primary-600 hover:bg-primary-50"
          onClick={() => track('whatsapp_cta_clicked', { action: 'find_team', context: 'bottom_cta' })}
        >
          Find a team
        </Button>
      </div>
    </div>
  );
}

function BookingModal({ turf, open, onClose }: { turf: DisplayTurf | null; open: boolean; onClose: ()=>void }) {
  const [date, setDate] = useState(""), [slot, setSlot] = useState(""), [players, setPlayers] = useState(10);
  if (!open || !turf) return null;
  return (
    <AnimatePresence>
      <motion.div 
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
      >
        <motion.div 
          initial={{ y: 40, opacity: 0 }} 
          animate={{ y: 0, opacity: 1 }} 
          exit={{ y: 40, opacity: 0 }} 
          className="bg-white rounded-2xl w-full sm:w-[560px] p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 id="booking-modal-title" className="text-xl font-semibold">Book {turf.name}</h3>
              <p className="text-sm text-gray-500">{turf.address}</p>
            </div>
            <Button variant="ghost" onClick={onClose} aria-label="Close booking modal"><X className="w-5 h-5"/></Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div><Label htmlFor="date-input">Date</Label><Input id="date-input" type="date" value={date} onChange={(e)=>setDate(e.target.value)} aria-label="Select booking date" /></div>
            <div><Label htmlFor="slot-select">Slot</Label>
              <select 
                id="slot-select"
                value={slot} 
                onChange={(e)=>setSlot(e.target.value)} 
                className="w-full border border-gray-300 rounded-md h-10 px-3 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors bg-white"
                aria-label="Select time slot"
              >
                <option value="">Select a time slot</option>
                {(turf.slots.length ? turf.slots : ["06 AM - 07 AM","07 AM - 08 AM","08 PM - 09 PM","09 PM - 10 PM"]).map((s)=> <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><Label htmlFor="players-input">Players</Label><Input id="players-input" type="number" min="1" max="22" value={players} onChange={(e)=>setPlayers(Number(e.target.value))} aria-label="Number of players" /></div>
            <div><Label htmlFor="notes-textarea">Notes (optional)</Label><Textarea id="notes-textarea" rows={3} placeholder="We need 2 balls and bibs…" aria-label="Additional notes for booking" /></div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-600">Expected total: <span className="font-semibold">{turf.pricePerHour ? formatINR(turf.pricePerHour) : (turf.priceDisplay || "Contact for fee")}</span></div>
            <div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button className="bg-primary-600 hover:bg-primary-700"><Check className="w-4 h-4 mr-2"/>Confirm booking</Button></div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function UserSurface({ turfs, currentCity = 'Nashik' }: { turfs: TurfSeed[]; currentCity?: string }) {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceCap] = useState(5000);
  const [minRating] = useState(4.0);
  const [time] = useState("");
  const [selected, setSelected] = useState<DisplayTurf | null>(null);
  const [sortBy] = useState<"distance" | "rating" | "price">("rating");
  const [smartOpen, setSmartOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'turfs' | 'games'>('turfs');

  const mapped = useMemo(() => turfs.map(t => toDisplayTurf(t, null)), [turfs]);

  const filteredBasic = useMemo(() => filterTurfs(
    mapped.map(m => ({
      name: m.name, address: m.address, pricePerHour: m.pricePerHour || m.pricePerHourMin || 0, rating: m.rating, slots: m.slots || [], amenities: m.amenities || [],
    })), { query, priceCap, rating: minRating, time }
  ), [mapped, query, priceCap, minRating, time]);
  const mappedByKey = useMemo(() => new Map(mapped.map(m => [m.name + "|" + m.address, m])), [mapped]);

  const displayTurfs = useMemo(() => {
    let out = filteredBasic.map(f => mappedByKey.get(f.name + "|" + f.address)!).filter(Boolean);
    if (sortBy === "rating") out = out.sort((a, b) => (b.rating - a.rating) || ((a.pricePerHour ?? 1e9) - (b.pricePerHour ?? 1e9)));
    else if (sortBy === "price") out = out.sort((a, b) => ((a.pricePerHour ?? 1e9) - (b.pricePerHour ?? 1e9)) || (b.rating - a.rating));
    return out;
  }, [filteredBasic, mappedByKey, sortBy]);

  function searchTurfsSmart(q: SmartQuery) {
    const h = q.startHour24 ?? 19;
    const smartSlot = (h: number) => { const sH = ((h + 11) % 12) + 1, eH = ((h + 12 + 11) % 12) + 1; return `${sH}–${eH} ${h >= 12 ? "PM" : "AM"}`; };
    const pl = (mn?: number|null, mx?: number|null) => { if (mn && mx) return `₹${mn}–₹${mx}/hr`; if (mn) return `₹${mn}+/hr`; return "Contact for fee"; };
    return mapped.map(m => ({
      id: m.id, name: m.name, address: m.address, rating: m.rating, priceLabel: pl(m.pricePerHourMin, m.pricePerHourMax),
      slot: smartSlot(h), distanceKm: m.distanceKm, image: undefined, weather: "sun" as const, isExact: true,
    })).slice(0, 6);
  }

  return (
    <div className="pb-20 sm:pb-0"> {/* Add bottom padding for mobile CTA */}
      <HeroSection currentCity={currentCity} />
      
      <div className="relative">
        <SearchBar
          query={query} 
          setQuery={setQuery}
          onLocate={() => {
            analytics.locationRequested('search');
            alert("Using your location for distance sort. Grant permission when prompted.");
          }}
          filtersOpen={filtersOpen} 
          setFiltersOpen={setFiltersOpen}
          onSmart={() => setSmartOpen(true)}
          currentCity={currentCity}
        />
      </div>

      <div className="pt-12">
        {/* Section toggle */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
          <div className="flex items-center gap-4 border-b border-gray-200">
            <button
              onClick={() => setActiveSection('turfs')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeSection === 'turfs'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Find Turfs
            </button>
            <button
              onClick={() => setActiveSection('games')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeSection === 'games'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Join Games
            </button>
          </div>
        </div>

        {activeSection === 'turfs' ? (
          <>
            <NearYouSection turfs={displayTurfs} currentCity={currentCity} />
          </>
        ) : (
          <>
            <GamesYouCanJoin games={SAMPLE_GAMES} />
          </>
        )}
      </div>

      <BookingModal turf={selected} open={!!selected} onClose={()=>setSelected(null)} />
      <SmartBookingModal open={smartOpen} onClose={()=>setSmartOpen(false)} onBook={(id, slot)=> console.log("BOOK", id, slot)} searchTurfs={searchTurfsSmart} />
      <BottomCTASection />
      
      <AssistantWidget
        onSmartSearch={(q)=> searchTurfsSmart(q).slice(0,3).map(t => `• ${t.name} — ${t.slot} — ${t.priceLabel}`)}
        onRecommend={()=>{
          const sorted = turfs.map(t => ({ name:t.name, price: t.pricePerHourMin ?? 999999, rating: t.rating ?? 0, score: (t.pricePerHourMin ?? 999999)/Math.max(1, t.rating ?? 0) }))
                              .sort((a,b)=> a.score - b.score);
          const top = sorted[0];
          return top ? `Best value: ${top.name} — from ₹${top.price}/hr.` : "No candidates.";
        }}
      />
    </div>
  );
}

function OwnerDashboard() {
  const [walletStatus, setWalletStatus] = useState<{ ok: boolean; code: string; message?: string; accounts?: string[] }>({ ok: false, code: "IDLE" });
  
  const MOCK_BOOKINGS_SERIES = [
    { month: "Feb", bookings: 22, occupancy: 48 },
    { month: "Mar", bookings: 35, occupancy: 60 },
    { month: "Apr", bookings: 32, occupancy: 58 },
    { month: "May", bookings: 44, occupancy: 66 },
    { month: "Jun", bookings: 57, occupancy: 72 },
    { month: "Jul", bookings: 62, occupancy: 74 },
  ];
  
  const revenue = useMemo(() => MOCK_BOOKINGS_SERIES.reduce((a,c)=> a + c.bookings * 1300, 0), []);
  const occupancy = MOCK_BOOKINGS_SERIES[MOCK_BOOKINGS_SERIES.length - 1].occupancy;

  async function handleWalletConnect() {
    setWalletStatus({ ok: true, code: "MOCK_CONNECTED", accounts: ["0xMockAccount"], message: "Connected (mock)" });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Owner Dashboard</h2><p className="text-gray-500">Track performance, manage listings, import CSV, and add offline bookings.</p></div>
        <div className="flex gap-2">
          <Button variant="outline"><Upload className="w-4 h-4 mr-2"/>Add offline booking</Button>
          <Button className="bg-primary-600 hover:bg-primary-700" onClick={handleWalletConnect}><Wallet className="w-4 h-4 mr-2"/>Connect wallet</Button>
        </div>
      </div>

      {walletStatus.code !== "IDLE" && (
        <div className={`text-sm rounded-lg border p-3 ${walletStatus.ok ? "bg-primary-50 border-primary-200 text-primary-700" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          Wallet status: <b>{walletStatus.code}</b> {walletStatus.accounts ? `• ${walletStatus.accounts[0]}` : ""} — {walletStatus.message || (walletStatus.ok ? "Connected" : "Not connected")}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Total Revenue (est.)</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{formatINR(revenue)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Avg. Rating</CardTitle></CardHeader><CardContent className="text-2xl font-semibold flex items-center gap-2"><Star className="w-5 h-5 fill-amber-500 text-amber-500"/>4.6</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Occupancy</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{occupancy}%</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Active Listings</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">3</CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Bookings & Occupancy</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_BOOKINGS_SERIES}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00A699" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#00A699" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="month"/><YAxis/><Tooltip/>
                <Area type="monotone" dataKey="bookings" stroke="#00A699" fill="url(#g1)"/>
                <Line type="monotone" dataKey="occupancy" stroke="#0d9488" strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top Performing Slots</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{slot:"6-7 AM", count: 48},{slot:"7-8 AM", count: 53},{slot:"8-9 PM", count: 72},{slot:"9-10 PM", count: 66}]}>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="slot"/><YAxis/><Tooltip/>
                <Bar dataKey="count" fill="#00A699"/>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DevTestPanel({ onClose }: { onClose: () => void }) {
  const tests = [
    { name: "Sample data loaded", pass: SAMPLE_TURFS.length > 0 },
    { name: "Price formatting", pass: formatINR(1200).includes("1,200") },
    { name: "Time parsing", pass: parseTime12h("06:00 AM") !== null },
    { name: "Slot derivation", pass: deriveSlotsFromHours({ mon: "06:00 AM", notes: "Closes 11:00 PM" }).slots.length > 0 },
  ];
  const passed = tests.filter(r => r.pass).length;
  
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-2xl w-full sm:w-[600px] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-semibold flex items-center gap-2"><Bug className="w-5 h-5"/> Dev • Tests</h3>
          <Button variant="ghost" onClick={onClose}><X className="w-5 h-5"/></Button>
        </div>
        <div className="text-sm text-gray-500 mb-4">Self-checks for core functionality</div>
        <div className="space-y-2 max-h-72 overflow-auto">
          {tests.map((r, i) => (
            <div key={i} className={`flex items-center justify-between rounded-md border p-2 ${r.pass ? "border-primary-200 bg-primary-50" : "border-rose-200 bg-rose-50"}`}>
              <div>{r.name}</div>
              <div className={`text-xs font-medium ${r.pass ? "text-primary-700" : "text-rose-700"}`}>{r.pass ? "PASS" : "FAIL"}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-sm">Summary: {passed}/{tests.length} tests passing.</div>
      </div>
    </div>
  );
}

// ---------- Main App ----------
export default function App() {
  const [activeTab, setActiveTab] = useState<string>("home");
  const [showTests, setShowTests] = useState(false);
  const [turfs, setTurfs] = useState<TurfSeed[]>(SAMPLE_TURFS);
  const [isLoadingTurfs, setIsLoadingTurfs] = useState(false);
  const [currentCity] = useState('Nashik'); // TODO: Make dynamic
  const [showCreateGame, setShowCreateGame] = useState(false);

  // Try to load JSON data, but fall back to sample data
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setIsLoadingTurfs(true);
        const res = await fetch("/nashik_turfs.seed.json", { cache: "no-store" });
        if (res.ok) {
          const data: TurfSeed[] = await res.json();
          if (alive && Array.isArray(data) && data.length > 0) {
            setTurfs(data);
          }
        }
      } catch (e: any) {
        console.warn("Could not load JSON data, using sample data:", e?.message);
      } finally {
        if (alive) setIsLoadingTurfs(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav 
        currentCity={currentCity}
        onProfileClick={() => setShowTests(true)}
      />
      
      {isLoadingTurfs && (
        <Card className="max-w-7xl mx-auto mt-6">
          <CardContent className="p-6">Loading turfs…</CardContent>
        </Card>
      )}
      
      {!isLoadingTurfs && (
        <>
          {(activeTab === "home" || activeTab === "explore" || activeTab === "turfs" || activeTab === "games") ? (
            <UserSurface turfs={turfs} currentCity={currentCity} />
          ) : activeTab === "create" ? (
            <div className="max-w-xl mx-auto mt-8 px-4">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="w-5 h-5"/> Create Game</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-600">Create a game and invite players via WhatsApp!</p>
                  <Button 
                    onClick={() => setShowCreateGame(true)}
                    className="w-full bg-primary-600 hover:bg-primary-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Game
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <>
              <Card className="max-w-xl mx-auto mt-8">
                <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5"/> Owner access</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Email</Label><Input placeholder="owner@turfarena.com"/></div>
                    <div><Label>OTP</Label><Input placeholder="6-digit"/></div>
                  </div>
                  <Button className="w-full bg-primary-600 hover:bg-primary-700">Sign in</Button>
                  <p className="text-sm text-gray-500">Passwordless OTP login • Add Google Sign-In later</p>
                </CardContent>
              </Card>
              <OwnerDashboard />
            </>
          )}
        </>
      )}
      
      <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <footer className="border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-sm text-gray-500 flex flex-col sm:flex-row gap-2 sm:gap-6 justify-between">
          <div>© {new Date().getFullYear()} Turfer • Made for {currentCity}</div>
          <div className="flex gap-4"><a className="hover:text-gray-700" href="#">Privacy</a><a className="hover:text-gray-700" href="#">Terms</a><a className="hover:text-gray-700" href="#">Support</a></div>
        </div>
      </footer>
      
      <AnimatePresence>{showTests && (<DevTestPanel onClose={()=>setShowTests(false)} />)}</AnimatePresence>
      
      <CreateGameFlow 
        open={showCreateGame} 
        onClose={() => setShowCreateGame(false)}
        onGameCreated={(game) => {
          console.log('Game created:', game);
          // In a real app, you'd add this to your games list
          setShowCreateGame(false);
        }}
      />
    </div>
  );
}