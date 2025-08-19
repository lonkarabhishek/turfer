import React, { useMemo, useState } from "react";
import { X, Calendar, MapPin, Star, Sun } from "lucide-react";
import { parseSmartQuery } from "../lib/smartTime";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";

type SmartTurf = {
  id: string;
  name: string;
  image?: string;
  priceLabel: string;
  distanceKm?: number | null;
  slot: string;
  rating: number;
  address: string;
  weather: "sun" | "cloud" | "rain";
  isExact: boolean;
};

export function SmartBookingModal({
  open, onClose, onBook, searchTurfs,
}: {
  open: boolean;
  onClose: () => void;
  onBook: (turfId: string, slot: string) => void;
  searchTurfs: (q: ReturnType<typeof parseSmartQuery>) => SmartTurf[];
}) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<SmartTurf[] | null>(null);
  const [loading, setLoading] = useState(false);

  const hint = useMemo(() => [
    "Book me a turf tomorrow after 7pm for 10 players.",
    "Check availability next weekend evening near Govind Nagar.",
    "Find slots today 8–9pm for 8 players.",
  ], []);

  if (!open) return null;

  function doSearch() {
    setLoading(true);
    const q = parseSmartQuery(input || "tomorrow after 7pm for 10 players");
    const r = searchTurfs(q);
    setResults(r);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:w-[760px] rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-semibold">Smart Booking</div>
          <Button variant="ghost" onClick={onClose}><X className="w-5 h-5"/></Button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <input
              className="flex-1 h-11 px-3 rounded-md border focus:ring-2 focus:ring-emerald-600 outline-none"
              placeholder={hint[0]}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e)=> e.key==='Enter' && doSearch()}
            />
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={doSearch}>Search</Button>
          </div>
          <div className="text-xs text-gray-500">Examples: {hint.join(" • ")}</div>

          {loading && <div className="text-sm text-gray-600">Finding best matches…</div>}

          {results && (
            <div className="grid sm:grid-cols-2 gap-4">
              {results.map((t) => (
                <Card key={t.id} className={`${t.isExact ? "" : "border-amber-300 bg-amber-50/40"}`}>
                  <div className="aspect-[16/9] w-full overflow-hidden">
                    <img src={t.image || "https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?q=80&w=1200&auto=format&fit=crop"} className="w-full h-full object-cover" />
                  </div>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold">{t.name}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3"/>{t.address}</div>
                        {typeof t.distanceKm === "number" && <div className="text-xs text-gray-500">{t.distanceKm.toFixed(1)} km away</div>}
                      </div>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1 text-amber-600">
                          <Star className="w-4 h-4 fill-amber-500"/><span className="text-sm font-medium">{t.rating.toFixed(1)}</span>
                        </div>
                        <div className="text-xs text-gray-400">Google</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="rounded-full"><Calendar className="w-3 h-3 mr-1"/> {t.slot}</Badge>
                        <Badge variant="secondary" className="rounded-full">{t.priceLabel}</Badge>
                      </div>
                      <div title="Weather" className="text-gray-500">
                        {t.weather === "sun" ? <Sun className="w-4 h-4"/> : t.weather === "rain" ? "🌧️" : "⛅"}
                      </div>
                    </div>

                    {!t.isExact && <div className="text-[11px] text-amber-700">Suggested alternative</div>}

                    <div className="flex justify-end">
                      <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onBook(t.id, t.slot)}>Book</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
