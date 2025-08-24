import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Minimize2, Move } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { parseSmartQuery } from "../lib/smartTime";

type Msg = { role: "user" | "assistant"; text: string; time: number; };

export function AssistantWidget({
  onSmartSearch, onRecommend,
}: {
  onSmartSearch: (q: ReturnType<typeof parseSmartQuery>) => string[];
  onRecommend: () => string;
}) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try { return JSON.parse(localStorage.getItem("turfer_chat") || "[]"); } catch { return []; }
  });
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  useEffect(() => {
    localStorage.setItem("turfer_chat", JSON.stringify(msgs));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  function send(text: string) {
    if (!text.trim()) return;
    const userMsg: Msg = { role: "user", text, time: Date.now() };
    setMsgs((m) => [...m, userMsg]);

    const s = text.toLowerCase();
    
    // FAQ responses
    if (/how.*book|booking.*work|how.*reserve/.test(s)) {
      reply("To book a turf:\n1. Search for turfs in your area\n2. Click 'Book via WhatsApp' on any turf card\n3. Choose your preferred contact option\n4. Confirm your booking with the turf owner");
      return;
    }
    if (/join.*game|how.*join/.test(s)) {
      reply("To join a game:\n1. Go to the 'Join Games' section\n2. Browse available games\n3. Click on a game to see details\n4. Contact the host via WhatsApp to join");
      return;
    }
    if (/cancel.*booking|how.*cancel/.test(s)) {
      reply("To cancel a booking:\n• Contact the turf owner directly via phone or WhatsApp\n• Cancellation policies vary by facility\n• It's best to cancel at least 2-4 hours in advance");
      return;
    }
    if (/location.*not.*work|gps.*problem|near me.*not/.test(s)) {
      reply("If location isn't working:\n1. Enable location services in your browser\n2. Click 'Allow' when prompted for location access\n3. You can also search manually by entering your area name");
      return;
    }
    if (/price|cost|how much/.test(s)) {
      reply("Turf prices vary by location and facilities:\n• Basic turfs: ₹400-800/hour\n• Premium turfs: ₹800-1500/hour\n• Weekend rates are typically 20-30% higher\n• Game costs are split among players");
      return;
    }
    if (/recommend|best value/.test(s)) {
      const answer = onRecommend();
      reply(answer);
      return;
    }
    if (/book|reserve|slot|available|tonight|tomorrow|weekend|near/.test(s)) {
      const q = parseSmartQuery(text);
      const lines = onSmartSearch(q);
      reply(lines.join("\n"));
      return;
    }
    if (/split|payment|upi|razorpay|stripe/.test(s)) {
      reply("You can split equally across players at checkout. UPI/Razorpay coming soon in MVP.");
      return;
    }
    if (/help|support|contact/.test(s)) {
      reply("Need help? You can:\n• Use this chat for quick questions\n• Check the Support page in the footer\n• Email us at support@tapturf.in\n• WhatsApp us at +91 99999-99999");
      return;
    }
    reply("I can help with:\n• Booking turfs and joining games\n• Finding the best prices\n• Troubleshooting issues\n\nTry asking 'How do I book a turf?' or use the quick options below.");
  }

  function reply(text: string) {
    const asst: Msg = { role: "assistant", text, time: Date.now() };
    setMsgs((m) => [...m, asst]);
  }

  return (
    <>
      {!open && (
        <button
          className="fixed bottom-5 right-5 z-50 rounded-full bg-primary-600 hover:bg-primary-700 text-white w-14 h-14 shadow-xl flex items-center justify-center"
          onClick={() => setOpen(true)}
          aria-label="Open chat"
        >
          <MessageCircle className="w-6 h-6"/>
        </button>
      )}
      {open && (
        <div 
          className="fixed bottom-5 right-5 z-50 w-[340px] sm:w-[380px] bg-white border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in-0 zoom-in-95 duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assistant-title"
        >
          <div className="px-3 h-11 flex items-center justify-between border-b">
            <h3 id="assistant-title" className="font-medium">Turfer Assistant</h3>
            <Button variant="ghost" onClick={()=>setOpen(false)} aria-label="Close assistant"><X className="w-5 h-5"/></Button>
          </div>
          <div className="p-3 h-[380px] overflow-y-auto space-y-2">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[85%] ${m.role==="user" ? "ml-auto text-white bg-primary-600" : "bg-gray-100 text-gray-800"} px-3 py-2 rounded-2xl`}>
                {m.text.split("\n").map((line, idx) => <div key={idx}>{line}</div>)}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="px-3 pb-2 space-y-2">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="cursor-pointer" onClick={()=>send("Which grounds are available tonight near Govind Nagar?")}>Tonight near me</Badge>
              <Badge variant="outline" className="cursor-pointer" onClick={()=>send("Recommend best value")}>Recommend Best Value</Badge>
              <Badge variant="outline" className="cursor-pointer" onClick={()=>send("Book Greenfield 8–9pm")}>Book Now</Badge>
              <Badge variant="outline" className="cursor-pointer" onClick={()=>setMsgs([])}>Clear</Badge>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 h-10 px-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                placeholder="Ask to search, book, or split payments…"
                value={input}
                onChange={(e)=>setInput(e.target.value)}
                onKeyDown={(e)=> e.key==='Enter' && (send(input), setInput(""))}
                aria-label="Chat message input"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}