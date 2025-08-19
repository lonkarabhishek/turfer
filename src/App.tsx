import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Star, Search, Calendar, Phone, Upload, Building2, Check, X, Filter, LocateFixed, LogIn, Bug, Wallet } from "lucide-react";
import { ResponsiveContainer, Area, AreaChart, CartesianGrid, BarChart, Bar, XAxis, YAxis, Tooltip, Line } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Badge } from "./components/ui/badge";
import { Label } from "./components/ui/label";
import { Textarea } from "./components/ui/textarea";

import { SmartBookingModal } from "./components/SmartBookingModal";
import { AssistantWidget } from "./components/AssistantWidget";
import { parseSmartQuery, type SmartQuery } from "./lib/smartTime";

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

type DisplayTurf = {
  id: string;
  name: string;
  address: string;
  rating: number;
  totalReviews: number;
  pricePerHour?: number;
  pricePerHourMin?: number | null;
  pricePerHourMax?: number | null;
  priceDisplay: string;
  amenities: string[];
  images: string[];
  slots: string[];
  contacts: Record<string, string | null>;
  coords: { lat: number; lng: number } | null;
  distanceKm: number | null;
};

// ---------- Utils ----------
function formatINR(x: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(x);
}
function priceLabelObj(t: { pricePerHour?: number; pricePerHourMin?: number | null; pricePerHourMax?: number | null; }) {
  const mn = t.pricePerHourMin ?? t.pricePerHour ?? null;
  const mx = t.pricePerHourMax ?? null;
  if (mn && mx) return `₹${mn}–₹${mx}/hr`;
  if (mn) return `₹${mn}+/hr`;
  return "Contact for fee";
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

// ---------- Wallet (safe + mock-by-default) ----------
let __walletMode: "auto" | "mock" | "real" = "auto";
function getWalletMode() {
  if (__walletMode !== "auto") return __walletMode;
  const hasProvider = typeof window !== "undefined" && (window as any)?.ethereum && typeof (window as any).ethereum.request === "function";
  return hasProvider ? "real" : "mock";
}
function getWalletProvider() {
  return typeof window !== "undefined" ? (window as any)?.ethereum || null : null;
}
async function connectMetaMaskGracefully() {
  try {
    const mode = getWalletMode();
    const provider = getWalletProvider();
    if (mode === "mock" || !provider) {
      return { ok: true, code: "MOCK_CONNECTED", accounts: ["0xMockAccount00000000000000000000000000000001"], message: "Connected (mock)" };
    }
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) return { ok: false, code: "NO_ACCOUNTS", accounts: [], message: "No accounts returned" };
    return { ok: true, code: "CONNECTED", accounts, message: "Connected (MetaMask)" };
  } catch (e: any) {
    return { ok: false, code: "ERROR", accounts: [], message: e?.message || "Unknown wallet error" };
  }
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

// ---------- Maps & distance ----------
function parseCoordsFromGMapUrl(url?: string | null): { lat: number; lng: number } | null {
  if (!url) return null;
  const at = url.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
  const q = url.match(/[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (q) return { lat: parseFloat(q[1]), lng: parseFloat(q[2]) };
  return null;
}
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1));
}

// ---------- CSV Import ----------
type RawRow = Record<string, string>;
function normalizeVal(s?: string | null) { if (s == null) return null; const v = String(s).trim(); return !v || /^N\/A$/i.test(v) ? null : v; }
function parsePriceInt(s?: string | null) { if (!s) return null; const m = String(s).replace(/,/g, "").match(/\d+/); return m ? parseInt(m[0], 10) : null; }
function splitMulti(s?: string | null) { if (!s) return []; const semi = s.split(";").map(v => v.trim()).filter(Boolean); if (semi.length > 1) return semi; return s.split(",").map(v => v.trim()).filter(Boolean); }
function mapCsvRowToSeed(row: RawRow): TurfSeed {
  const addressParts = [normalizeVal(row["Primary_Address"]), normalizeVal(row["Locality"]), normalizeVal(row["Pincode"])].filter(Boolean);
  const hours = {
    mon: normalizeVal(row["Operating_Hours_Mon"]), tue: normalizeVal(row["Operating_Hours_Tue"]),
    wed: normalizeVal(row["Operating_Hours_Wed"]), thu: normalizeVal(row["Operating_Hours_Thu"]),
    fri: normalizeVal(row["Operating_Hours_Fri"]), sat: normalizeVal(row["Operating_Hours_Sat"]),
    sun: normalizeVal(row["Operating_Hours_Sun"]), notes: normalizeVal(row["Operating_Hours_Notes"]),
  };
  const contacts = {
    phone: normalizeVal(row["Contact_Phone"]), email: normalizeVal(row["Contact_Email"]),
    website: normalizeVal(row["Website_URL"]), facebook: normalizeVal(row["Facebook_URL"]),
    instagram: normalizeVal(row["Instagram_URL"]), gmap: normalizeVal(row["Google_Maps_URL"]),
  };
  return {
    name: normalizeVal(row["Turf_Name"]) || "Unnamed",
    address: addressParts.join(", "),
    rating: row["Overall_Rating"] ? Number(row["Overall_Rating"]) : null,
    totalReviews: row["Number_of_Ratings"] ? Number(row["Number_of_Ratings"]) : null,
    pricePerHourMin: parsePriceInt(normalizeVal(row["Pricing_Hourly_Min_INR"])),
    pricePerHourMax: parsePriceInt(normalizeVal(row["Pricing_Hourly_Max_INR"])),
    amenities: splitMulti(normalizeVal(row["Amenities"]) || ""),
    sports: splitMulti(normalizeVal(row["Sports_Offered"]) || ""),
    hours, contacts,
    reviews: { positive: normalizeVal(row["Notable_Reviews_Summary_Positive"]), negative: normalizeVal(row["Notable_Reviews_Summary_Negative"]) },
    source_ids: normalizeVal(row["Source_IDs"]),
    Google_Maps_URL: contacts.gmap || null,
  };
}
function CSVImporter({ onMerge }: { onMerge: (records: TurfSeed[]) => void }) {
  const [busy, setBusy] = useState(false), [info, setInfo] = useState<string | null>(null);
  async function handleFile(file: File) {
    setBusy(true); setInfo(null);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) throw new Error("Empty CSV");
      const headers = lines[0].split(","), targetCols = headers.length, rows: RawRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const tokens = lines[i].split(","), out: string[] = [];
        let t = [...tokens];
        while (out.length < targetCols && t.length > 0) {
          const remainingCols = targetCols - out.length;
          let k = t.length - (remainingCols - 1); if (k < 1) k = 1;
          out.push(t.slice(0, k).join(",").trim()); t = t.slice(k);
        }
        while (out.length < targetCols) out.push("");
        const obj: RawRow = {}; headers.forEach((h, idx) => obj[h] = out[idx]); rows.push(obj);
      }
      const mapped = rows.map(mapCsvRowToSeed);
      onMerge(mapped); setInfo(`Imported ${mapped.length} records`);
    } catch (e: any) { setInfo(`Import error: ${e?.message || e}`); } finally { setBusy(false); }
  }
  return (
    <div className="border rounded-xl p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Import CSV</div>
        <input type="file" accept=".csv,text/csv" aria-label="Upload CSV" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}/>
      </div>
      {info && <div className="text-xs text-gray-600 mt-2">{info}</div>}
      {busy && <div className="text-xs text-gray-600 mt-2">Parsing…</div>}
    </div>
  );
}

// ---------- Tests ----------
function runUnitTests() {
  const tests: Array<{ name: string; pass: boolean }> = [];
  const expect = (name: string, condition: boolean) => tests.push({ name, pass: !!condition });

  expect("formatINR formats 1200", /^₹\s?1,200$/.test(formatINR(1200 as any)));

  const sample = [
    { name: "A", address: "Indira Nagar", pricePerHour: 1000, rating: 4.1, slots: ["7-8 AM"], amenities: [] },
    { name: "B", address: "College Rd", pricePerHour: 1500, rating: 4.8, slots: ["9-10 PM"], amenities: [] },
    { name: "C", address: "Gangapur Rd", pricePerHour: 2000, rating: 3.9, slots: ["7-8 AM", "8-9 PM"], amenities: [] },
  ];
  const f1 = filterTurfs(sample as any, { query: "gangapur", priceCap: 3000, rating: 0, time: "" });
  expect("filter: query", f1.length === 1 && f1[0].name === "C");

  // smart parse
  const q = parseSmartQuery("Book tomorrow after 7pm for 10 players");
  expect("smart: tomorrow", q.dateHint === "tomorrow");
  expect("smart: 19h", q.startHour24 === 19);
  expect("smart: players", q.players === 10);

  // time slots
  const sl = deriveSlotsFromHours({ mon:"06:00 AM", tue:"06:00 AM", wed:"06:00 AM", thu:"06:00 AM", fri:"06:00 AM", sat:"06:00 AM", sun:"06:00 AM", notes:"Closes 11:00 PM" });
  expect("slots: evening popular", sl.popular.some((x: string) => /08.*PM|09.*PM/i.test(x)));

  // coords
  const c1 = parseCoordsFromGMapUrl("https://maps.google.com/?q=19.9975,73.7898");
  expect("coords: q param", !!c1 && Math.abs((c1 as any).lat-19.9975)<1e-6);

  tests.push({ name: "wallet: has connector", pass: typeof connectMetaMaskGracefully === "function" });
  return tests;
}
function DevTestPanel({ onClose }: { onClose: () => void }) {
  const results = runUnitTests(); const passed = results.filter(r => r.pass).length;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-2xl w-full sm:w-[600px] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-semibold flex items-center gap-2"><Bug className="w-5 h-5"/> Dev • Tests</h3>
          <Button variant="ghost" onClick={onClose}><X className="w-5 h-5"/></Button>
        </div>
        <div className="text-sm text-gray-500 mb-4">Self-checks for smart parse, slots, CSV mapping, wallet, etc.</div>
        <div className="space-y-2 max-h-72 overflow-auto">
          {results.map((r, i) => (
            <div key={i} className={`flex items-center justify-between rounded-md border p-2 ${r.pass ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
              <div>{r.name}</div>
              <div className={`text-xs font-medium ${r.pass ? "text-emerald-700" : "text-rose-700"}`}>{r.pass ? "PASS" : "FAIL"}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-sm">Summary: {passed}/{results.length} tests passing.</div>
      </div>
    </div>
  );
}

// ---------- UI bits ----------
const Section = ({ title, action, children }: any) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);
function TopNav({ activeTab, setActiveTab, onOpenTests }: any) {
  return (
    <div className="sticky top-0 z-50 backdrop-blur bg-white/70 border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow">TB</span>
          <div className="hidden sm:flex gap-6">
            <button className={`text-sm font-medium hover:text-emerald-700 ${activeTab === "user" ? "text-emerald-700" : "text-gray-600"}`} onClick={() => setActiveTab("user")}>Find Turfs</button>
            <button className={`text-sm font-medium hover:text-emerald-700 ${activeTab === "owner" ? "text-emerald-700" : "text-gray-600"}`} onClick={() => setActiveTab("owner")}>Owner Dashboard</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="hidden sm:flex" onClick={onOpenTests}><Bug className="w-4 h-4 mr-2"/>Dev • Tests</Button>
          <Button variant="outline" size="sm" className="hidden sm:flex"><LogIn className="w-4 h-4 mr-2"/>Sign in</Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">List your turf</Button>
        </div>
      </div>
    </div>
  );
}
function SearchBar({ query, setQuery, onLocate, filtersOpen, setFiltersOpen, onSmart }: any) {
  return (
    <div className="max-w-5xl mx-auto -mt-10">
      <div className="shadow-xl rounded-2xl border bg-white p-2 flex items-center gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Nashik turfs, areas, or amenities…" className="border-0 focus-visible:ring-0 text-base"/>
        <Button variant="outline" onClick={onLocate}><LocateFixed className="w-4 h-4 mr-2"/>Near me</Button>
        <Button variant="outline" onClick={() => setFiltersOpen(!filtersOpen)}><Filter className="w-4 h-4 mr-2"/>Filters</Button>
        <Button variant="outline" onClick={onSmart}>Smart Booking</Button>
        <Button className="bg-emerald-600 hover:bg-emerald-700"><Search className="w-4 h-4 mr-2"/>Search</Button>
      </div>
    </div>
  );
}
function FilterTray({ open, onClose, setPriceCap, priceCap, rating, setRating, time, setTime }: any) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="max-w-5xl mx-auto mt-3 overflow-hidden">
          <Card>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Max price/hour</Label><Input type="number" value={priceCap} onChange={(e)=>setPriceCap(Number(e.target.value))} placeholder="e.g. 1200" /></div>
              <div><Label>Minimum rating</Label><Input type="number" step="0.1" value={rating} onChange={(e)=>setRating(Number(e.target.value))} placeholder="4.2" /></div>
              <div><Label>Preferred time</Label><Input value={time} onChange={(e)=>setTime(e.target.value)} placeholder="e.g. 7-8 AM or 9-10 PM" /></div>
              <div className="md:col-span-3 flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700">Apply</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
function TurfCard({ turf, onBook }: { turf: DisplayTurf; onBook: (t: DisplayTurf)=>void }) {
  return (
    <Card className="overflow-hidden hover:shadow-xl transition-shadow">
      <div className="aspect-[16/9] w-full overflow-hidden">
        <img src={turf.images[0] || "https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?q=80&w=1600&auto=format&fit=crop"} alt={turf.name} className="w-full h-full object-cover" />
      </div>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="font-semibold text-lg">{turf.name}</h4>
            <div className="flex items-center text-sm text-gray-500 gap-2"><MapPin className="w-4 h-4"/><span>{turf.address}</span></div>
            {typeof turf.distanceKm === "number" && (<div className="text-xs text-gray-500">{turf.distanceKm.toFixed(1)} km away</div>)}
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-amber-600"><Star className="w-4 h-4 fill-amber-500"/><span className="font-medium">{turf.rating.toFixed(1)}</span><span className="text-gray-400">({turf.totalReviews})</span></div>
            <div className="text-sm text-gray-500">Google rating</div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {turf.amenities.slice(0, 6).map((a) => (<Badge key={a} variant="secondary" className="rounded-full">{a}</Badge>))}
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Price</div>
            <div className="font-semibold">{turf.priceDisplay}</div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="w-4 h-4"/> Popular:
            <div className="flex gap-2 flex-wrap">
              {(turf.slots || []).map((s) => (<Badge key={s} variant="outline" className="rounded-full">{s}</Badge>))}
            </div>
          </div>
          <div className="flex gap-2">
            {turf.contacts?.phone && (<a href={`tel:${turf.contacts.phone}`} aria-label="Call"><Button variant="outline" size="sm"><Phone className="w-4 h-4 mr-2"/>Call</Button></a>)}
            {turf.contacts?.website && (<a href={turf.contacts.website} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm">Website</Button></a>)}
            {turf.contacts?.instagram && (<a href={turf.contacts.instagram} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm">Instagram</Button></a>)}
            {(turf.contacts?.gmap) && (<a href={turf.contacts.gmap} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm">Maps</Button></a>)}
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onBook(turf)}>Book</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
function BookingModal({ turf, open, onClose }: { turf: DisplayTurf | null; open: boolean; onClose: ()=>void }) {
  const [date, setDate] = useState(""), [slot, setSlot] = useState(""), [players, setPlayers] = useState(10);
  if (!open || !turf) return null;
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="bg-white rounded-2xl w-full sm:w-[560px] p-5 shadow-2xl">
          <div className="flex items-start justify-between">
            <div><h3 className="text-xl font-semibold">Book {turf.name}</h3><p className="text-sm text-gray-500">{turf.address}</p></div>
            <Button variant="ghost" onClick={onClose}><X className="w-5 h-5"/></Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e)=>setDate(e.target.value)} /></div>
            <div><Label>Slot</Label>
              <select value={slot} onChange={(e)=>setSlot(e.target.value)} className="w-full border rounded-md h-10 px-3">
                <option value="">Select</option>
                {(turf.slots.length ? turf.slots : ["06 AM - 07 AM","07 AM - 08 AM","08 PM - 09 PM","09 PM - 10 PM"]).map((s)=> <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><Label>Players</Label><Input type="number" value={players} onChange={(e)=>setPlayers(Number(e.target.value))} /></div>
            <div><Label>Notes (optional)</Label><Textarea rows={3} placeholder="We need 2 balls and bibs…"/></div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-600">Expected total: <span className="font-semibold">{turf.pricePerHour ? formatINR(turf.pricePerHour) : (turf.priceDisplay || "Contact for fee")}</span></div>
            <div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button className="bg-emerald-600 hover:bg-emerald-700"><Check className="w-4 h-4 mr-2"/>Confirm booking</Button></div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
function OwnerAuthPanel(){
  return (
    <Card className="max-w-xl mx-auto mt-8">
      <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5"/> Owner access</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Email</Label><Input placeholder="owner@turfarena.com"/></div>
          <div><Label>OTP</Label><Input placeholder="6-digit"/></div>
        </div>
        <Button className="w-full bg-emerald-600 hover:bg-emerald-700">Sign in</Button>
        <p className="text-sm text-gray-500">Passwordless OTP login • Add Google Sign-In later</p>
      </CardContent>
    </Card>
  );
}
function OwnerDashboard({ onMergeTurfs, setTurfs }: { onMergeTurfs: (records: TurfSeed[]) => void; setTurfs: React.Dispatch<React.SetStateAction<TurfSeed[]>>; }) {
  const [walletStatus, setWalletStatus] = useState<{ ok: boolean; code: string; message?: string; accounts?: string[] }>({ ok: false, code: "IDLE" });
  async function handleWalletConnect(){ setWalletStatus(await connectMetaMaskGracefully() as any); }

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold">Owner Dashboard</h2><p className="text-gray-500">Track performance, manage listings, import CSV, and add offline bookings.</p></div>
        <div className="flex gap-2">
          <Button variant="outline"><Upload className="w-4 h-4 mr-2"/>Add offline booking</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleWalletConnect}><Wallet className="w-4 h-4 mr-2"/>Connect wallet</Button>
        </div>
      </div>

      {walletStatus.code !== "IDLE" && (
        <div className={`text-sm rounded-lg border p-3 ${walletStatus.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          Wallet status: <b>{walletStatus.code}</b> {walletStatus.accounts ? `• ${walletStatus.accounts[0]}` : ""} — {walletStatus.message || (walletStatus.ok ? "Connected" : "Not connected")}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Total Revenue (est.)</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{formatINR(revenue)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Avg. Rating</CardTitle></CardHeader><CardContent className="text-2xl font-semibold flex items-center gap-2"><Star className="w-5 h-5 fill-amber-500 text-amber-500"/>4.6</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Occupancy</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{occupancy}%</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Active Listings</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">—</CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Bookings & Occupancy</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_BOOKINGS_SERIES}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="month"/><YAxis/><Tooltip/>
                <Area type="monotone" dataKey="bookings" stroke="#10b981" fill="url(#g1)"/>
                <Line type="monotone" dataKey="occupancy" stroke="#059669" strokeWidth={2}/>
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
                <Bar dataKey="count" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Manage Listings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <CSVImporter onMerge={(records) => {
              onMergeTurfs(records);
              setTurfs(prev => prev);
            }}/>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Quick Offline Booking</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Turf</Label><select className="w-full border rounded-md h-10 px-3"><option>Choose after we load turfs…</option></select></div>
            <div className="grid grid-cols-2 gap-3"><div><Label>Date</Label><Input type="date"/></div><div><Label>Slot</Label><Input placeholder="e.g. 8-9 PM"/></div></div>
            <div><Label>Customer name</Label><Input placeholder="e.g. Abhishek"/></div>
            <div><Label>Phone</Label><Input placeholder="e.g. 98XXXXXXXX"/></div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700"><Check className="w-4 h-4 mr-2"/>Save booking</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------- Data mapping & Home surface ----------
function toDisplayTurf(t: TurfSeed, userCoords: { lat: number; lng: number } | null): DisplayTurf {
  const coords = parseCoordsFromGMapUrl(t.contacts?.gmap || t.Google_Maps_URL || undefined);
  const { popular } = deriveSlotsFromHours(t.hours || {});
  const mn = t.pricePerHourMin ?? null, mx = t.pricePerHourMax ?? null;
  const priceDisplay = mn && mx ? `₹${mn}–₹${mx}/hr` : (mn ? `₹${mn}+/hr` : "Contact for fee");
  const distanceKm = (userCoords && coords) ? haversineKm(userCoords, coords) : null;
  return {
    id: t.name + "|" + (t.address || ""), name: t.name, address: t.address || "",
    rating: t.rating ?? 0, totalReviews: t.totalReviews ?? 0,
    pricePerHour: mn || undefined, pricePerHourMin: mn, pricePerHourMax: mx, priceDisplay,
    amenities: t.amenities || [], images: [], slots: popular, contacts: t.contacts || {}, coords, distanceKm,
  };
}
function HotDeals({ turfs }:{ turfs: TurfSeed[] }) {
  const deals = (turfs || []).slice(0,4).map((t, i) => ({
    id: t.name + i, name: t.name, price: t.pricePerHourMin || 600,
    discount: [10, 15, 20, 30][i % 4], window: i % 2 ? "Tonight only" : "Off-peak 6–8 AM",
    address: t.address || "",
  }));
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Hot Deals</h3>
        <Badge className="bg-amber-500 text-white rounded-full">Limited</Badge>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {deals.map(d => (
          <Card key={d.id} className="overflow-hidden hover:shadow-xl transition">
            <div className="h-32 bg-[url('https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?q=80&w=1200&auto=format&fit=crop')] bg-cover bg-center"/>
            <CardContent className="p-3">
              <div className="font-medium">{d.name}</div>
              <div className="text-xs text-gray-500">{d.address}</div>
              <div className="flex items-center justify-between mt-2">
                <div className="text-sm"><span className="line-through text-gray-400">₹{Math.round(d.price*(100+d.discount)/100)}</span> <b>₹{d.price}</b>/hr</div>
                <Badge className="bg-amber-500 text-white rounded-full">{d.discount}% OFF</Badge>
              </div>
              <div className="text-[11px] text-amber-700 mt-1">{d.window}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function UserSurface({ turfs, setTurfs }: { turfs: TurfSeed[]; setTurfs: React.Dispatch<React.SetStateAction<TurfSeed[]>> }) {
  const [query, setQuery] = useState(""), [filtersOpen, setFiltersOpen] = useState(false);
  const [priceCap, setPriceCap] = useState(5000), [minRating, setMinRating] = useState(4.0), [time, setTime] = useState("");
  const [selected, setSelected] = useState<DisplayTurf | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [sortBy, setSortBy] = useState<"distance" | "rating" | "price">("rating");
  const [smartOpen, setSmartOpen] = useState(false);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserCoords(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
    );
  }, []);

  const mapped = useMemo(() => turfs.map(t => toDisplayTurf(t, userCoords)), [turfs, userCoords]);

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
    else if (sortBy === "distance") out = out.sort((a, b) => ((a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)));
    return out;
  }, [filteredBasic, mappedByKey, sortBy]);

  // Smart Booking glue
  function fakeWeather(): "sun" | "cloud" | "rain" { const r = Math.random(); return r < 0.7 ? "sun" : r < 0.9 ? "cloud" : "rain"; }
  function pl(mn?: number|null, mx?: number|null) { if (mn && mx) return `₹${mn}–₹${mx}/hr`; if (mn) return `₹${mn}+/hr`; return "Contact for fee"; }
  function smartSlot(h: number) { const sH = ((h + 11) % 12) + 1, eH = ((h + 12 + 11) % 12) + 1; return `${sH}–${eH} ${h >= 12 ? "PM" : "AM"}`; }
  function searchTurfsSmart(q: SmartQuery) {
    const h = q.startHour24 ?? 19;
    const base = mapped.map(m => ({
      id: m.id, name: m.name, address: m.address, rating: m.rating, priceLabel: pl(m.pricePerHourMin, m.pricePerHourMax),
      slot: smartSlot(h), distanceKm: m.distanceKm, image: m.images[0], weather: fakeWeather(), isExact: true,
    }));
    if (base.length > 1) { base[0].isExact = false; base[0].slot = smartSlot(Math.max(6, h - 1)); }
    if (base.length > 2) { base[1].isExact = false; base[1].slot = smartSlot(Math.min(22, h + 1)); }
    return base.slice(0, 6);
  }

  return (
    <div>
      <div className="relative bg-gradient-to-br from-emerald-600 via-green-500 to-lime-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h1 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">Book cricket turfs in Nashik</h1>
          <p className="text-white/90 mt-2 max-w-xl">See live availability, ratings and photos. One place to book – no more calling ten numbers.</p>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 bottom=0 translate-y-1/2 w-full px-4">
          <SearchBar
            query={query} setQuery={setQuery}
            onLocate={()=>alert("Using your location for distance sort. Grant permission when prompted.")}
            filtersOpen={filtersOpen} setFiltersOpen={setFiltersOpen}
            onSmart={()=>setSmartOpen(true)}
          />
        </div>
      </div>

      <FilterTray open={filtersOpen} onClose={()=>setFiltersOpen(false)} {...{priceCap, setPriceCap, rating: minRating, setRating: setMinRating, time, setTime}}/>

      <HotDeals turfs={turfs} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2">
        <div className="flex items-center justify-between mb-2 text-sm text-gray-600">
          <div className="flex gap-2">
            <Button variant="outline" onClick={()=>{
              const sorted = turfs.map(t => ({ name:t.name, price: t.pricePerHourMin ?? 999999, rating: t.rating ?? 0, score: (t.pricePerHourMin ?? 999999)/Math.max(1, t.rating) }))
                                  .sort((a,b)=> a.score - b.score);
              const top = sorted[0]; if (top) alert(`Best value: ${top.name} (₹${top.price}/hr, rating ${top.rating.toFixed?.(1) ?? top.rating})`);
            }}>
              Recommend Best Value
            </Button>
          </div>
          <div className="flex items-center">
            <span className="mr-2">Sort by:</span>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)} className="border rounded-md h-9 px-2">
              <option value="rating">Rating</option>
              <option value="price">Price</option>
              <option value="distance">Distance</option>
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {displayTurfs.map((t)=> (<TurfCard key={t.id} turf={t} onBook={setSelected} />))}
          {displayTurfs.length === 0 && (<Card><CardContent className="p-8 text-center text-gray-500">No turfs match your filters. Try widening your search.</CardContent></Card>)}
        </div>
        <Card className="h-[700px] sticky top-24 hidden lg:block overflow-hidden">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><MapPin className="w-4 h-4"/> Map</CardTitle></CardHeader>
          <CardContent className="p-0"><div className="h-[620px] w-full bg-[url('https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?q=80&w=1600&auto=format&fit=crop')] bg-cover bg-center"/><div className="p-3 text-sm text-gray-500">Embed Google Maps / Mapbox with markers</div></CardContent>
        </Card>
      </div>

      <BookingModal turf={selected} open={!!selected} onClose={()=>setSelected(null)} />
      <SmartBookingModal open={smartOpen} onClose={()=>setSmartOpen(false)} onBook={(id, slot)=> console.log("BOOK", id, slot)} searchTurfs={(q)=>searchTurfsSmart(q)} />

      <AssistantWidget
        onSmartSearch={(q)=> searchTurfsSmart(q).slice(0,3).map(t => `• ${t.name} — ${t.slot} — ${t.priceLabel}`)}
        onBookNow={(name)=> console.log("Book now:", name)}
        onRecommend={()=>{
          const sorted = turfs.map(t => ({ name:t.name, price: t.pricePerHourMin ?? 999999, rating: t.rating ?? 0, score: (t.pricePerHourMin ?? 999999)/Math.max(1, t.rating) }))
                              .sort((a,b)=> a.score - b.score);
          const top = sorted[0];
          return top ? `Best value: ${top.name} — from ₹${top.price}/hr.` : "No candidates.";
        }}
      />
    </div>
  );
}

// ---------- App ----------
export default function App() {
  const [activeTab, setActiveTab] = useState<"user" | "owner">("user");
  const [showTests, setShowTests] = useState(false);
  const [turfs, setTurfs] = useState<TurfSeed[]>([]);
  const [isLoadingTurfs, setIsLoadingTurfs] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setIsLoadingTurfs(true);
        const res = await fetch("/nashik_turfs_seed.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to fetch seed: ${res.status}`);
        const data: TurfSeed[] = await res.json();
        if (alive) setTurfs(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (alive) setLoadError(e?.message || "Unknown error");
      } finally {
        if (alive) setIsLoadingTurfs(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav activeTab={activeTab} setActiveTab={setActiveTab} onOpenTests={()=>setShowTests(true)} />
      {isLoadingTurfs && <Card className="max-w-7xl mx-auto mt-6"><CardContent className="p-6">Loading turfs…</CardContent></Card>}
      {loadError && <Card className="max-w-7xl mx-auto mt-6"><CardContent className="p-6 text-rose-600">Error: {loadError}</CardContent></Card>}
      {!isLoadingTurfs && !loadError && (
        activeTab === "user"
          ? <UserSurface turfs={turfs} setTurfs={setTurfs}/>
          : (<>
              <OwnerAuthPanel/>
              <OwnerDashboard
                onMergeTurfs={(records)=> {
                  setTurfs(prev => {
                    const key = (t: TurfSeed) => `${(t.name||"").toLowerCase()}|${(t.address||"").toLowerCase()}`;
                    const map = new Map<string, TurfSeed>();
                    [...prev, ...records].forEach(r => map.set(key(r), r));
                    return Array.from(map.values());
                  });
                }}
                setTurfs={setTurfs}
              />
            </>)
      )}
      <footer className="border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-sm text-gray-500 flex flex-col sm:flex-row gap-2 sm:gap-6 justify-between">
          <div>© {new Date().getFullYear()} TurfBook • Made for Nashik</div>
          <div className="flex gap-4"><a className="hover:text-gray-700" href="#">Privacy</a><a className="hover:text-gray-700" href="#">Terms</a><a className="hover:text-gray-700" href="#">Support</a></div>
        </div>
      </footer>
      <AnimatePresence>{showTests && (<DevTestPanel onClose={()=>setShowTests(false)} />)}</AnimatePresence>
    </div>
  );
}
