import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { parseSmartQuery } from "../lib/smartTime";

type Msg = { role: "user" | "assistant"; text: string; time: number; };

export function AssistantWidget({
  onSmartSearch, onBookNow, onRecommend,
}: {
  onSmartSearch: (q: ReturnType<typeof parseSmartQuery>) => string[];
  onBookNow: (turfName?: string) => void;
  onRecommend: () => string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try { return JSON.parse(localStorage.getItem("turfer_chat") || "[]"); } catch { return []; }
  });
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("turfer_chat", JSON.stringify(msgs));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  function send(text: string) {
    if (!text.trim()) return;
    const userMsg: Msg = { role: "user", text, time: Date.now() };
    setMsgs((m) => [...m, userMsg]);

    const s = text.toLowerCase();
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
    reply("Try: “Which grounds are available tonight near Govind Nagar?” or tap a chip below.");
  }

  function reply(text: string) {
    const asst: Msg = { role: "assistant", text, time: Date.now() };
    setMsgs((m) => [...m, asst]);
  }

  return (
    <>
      {!open && (
        <button
          className="fixed bottom-5 right-5 z-50 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white w-14 h-14 shadow-xl flex items-center justify-center"
          onClick={() => setOpen(true)}
          aria-label="Open chat"
        >
          <MessageCircle className="w-6 h-6"/>
        </button>
      )}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[340px] sm:w-[380px] bg-white border rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-3 h-11 flex items-center justify-between border-b">
            <div className="font-medium">Turfer Assistant</div>
            <Button variant="ghost" onClick={()=>setOpen(false)}><X className="w-5 h-5"/></Button>
          </div>
          <div className="p-3 h-[380px] overflow-y-auto space-y-2">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[85%] ${m.role==="user" ? "ml-auto text-white bg-emerald-600" : "bg-gray-100 text-gray-800"} px-3 py-2 rounded-2xl`}>
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
                className="flex-1 h-10 px-3 rounded-md border focus:ring-2 focus:ring-emerald-600 outline-none"
                placeholder="Ask to search, book, or split payments…"
                value={input}
                onChange={(e)=>setInput(e.target.value)}
                onKeyDown={(e)=> e.key==='Enter' && (send(input), setInput(""))}
              />
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={()=>{ send(input); setInput(""); }}>Send</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
