import type { Post } from "../types";

export const post: Post = {
  slug: "turf-prices-pune",
  title: "How Much Does It Cost to Book a Turf in Pune?",
  description:
    "Real Pune turf slot prices from the TapTurf database — from ₹200/hr at some Hotfut slots up to ₹1,200/hr at premium venues — plus a per-player calculator so you and your squad can split the cost before you commit.",
  hook: "Actual published prices, not averages. And a calculator that does the per-player split so nobody has to open Google Sheets.",
  category: "Guides",
  city: "pune",
  readMinutes: 6,
  publishedAt: "2026-09-26",
  coverEmoji: "💸",
  heroImage: {
    url: "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWluVehlKK7EQC1aLXqA_MlNeKacLkys0f-whXQJmZn_YVq34vLW48k_LAGIVqxfHzCHjp5XnnbNJQXczHBvBChh3aY96gO0B6HQm18Ajne7jRBjwtMYEUkg_5WWzOfRbJ9Wt9Is=w1200-h900-k-no",
    alt: "Football turf slot in Kharadi, Pune — evening slot pricing",
    credit: "Hotfut Kharadi",
  },
  keywords: [
    "turf price Pune",
    "football turf price Pune",
    "cricket turf price Pune",
    "turf booking Pune",
    "box cricket cost Pune",
    "per player turf cost",
  ],
  cta: { href: "/pune", label: "Compare Pune turfs" },
  blocks: [
    {
      type: "p",
      text: "\"What does a turf cost in Pune?\" doesn't have a single answer. It depends on the venue, the sport, weekday vs weekend, morning vs evening, and whether you're paying for a 45 / 60 / 90 minute slot. What you actually want is: a fair range, real examples, and a calculator to split it. Here's all three.",
    },

    { type: "callout", title: "We do not publish an average price", text: "The 'average' Pune turf price is a made-up number. Real slots run from ₹200/hr to ₹1,200/hr on TapTurf right now. What matters is your specific venue on your specific day." },

    { type: "h2", text: "The real price bands" },
    { type: "stat-grid", items: [
      { value: "₹200", label: "Cheapest live slot", hint: "Hotfut Kharadi, weekday" },
      { value: "₹500", label: "Mid-tier hourly", hint: "Common evening rate" },
      { value: "₹1,200", label: "Premium hourly", hint: "Prime weekend evening" },
      { value: "₹80–150", label: "Typical per player", hint: "10-player 5-a-side split" },
    ] },

    { type: "h2", text: "Turf price calculator" },
    { type: "p", text: "The number everyone actually cares about is per-player. Punch in a rate you got quoted on WhatsApp and see the split." },
    { type: "price-calc", caption: "Change any field to update instantly", defaults: { pricePerHour: 800, players: 10, hours: 1 } },

    { type: "h2", text: "What drives the price" },
    { type: "h3", text: "1. Time of day" },
    { type: "p", text: "Evening peak (7pm–11pm) is usually 20–40% more than the same slot at 10am. That's just supply and demand — nobody wants a morning slot, everybody wants a Friday 9pm." },
    { type: "h3", text: "2. Weekend vs weekday" },
    { type: "p", text: "Weekend rates go up another 15–30%. Some venues publish two price columns; others just quote you the current rate on WhatsApp." },
    { type: "h3", text: "3. Venue quality" },
    { type: "p", text: "New artificial grass, working floodlights, changing rooms, cafeteria, parking — all of these add ₹100–₹300/hr to the rate. You're paying for the experience, not just the pitch." },
    { type: "h3", text: "4. Ground size and format" },
    { type: "p", text: "A 7-a-side ground costs more per slot than a 5-a-side box because it's physically bigger to maintain and light. On a per-player basis it usually evens out." },

    { type: "h2", text: "Real Pune slot rates (published)" },
    { type: "p", text: "A handful of Pune venues have published slot rates on TapTurf. These are useful anchor points — but always confirm the current rate directly with the turf before you commit." },
    { type: "related-turfs", title: "Under ₹300 per hour", ids: [
      "47bc4194-18bf-4d66-84f4-ef6463ee9eb7",
      "626c5731-6392-475c-a936-ca53f2f0788f",
    ] },
    { type: "related-turfs", title: "Around ₹500 per hour", ids: [
      "0677eb38-375b-45b8-b6a4-d0b92bdf8e3c",
      "feda49ae-c12c-4791-ad00-f78f8f465678",
    ] },
    { type: "related-turfs", title: "₹1,000+ per hour", ids: [
      "bed1ebe4-78fc-4c42-acc0-4e911436f81d",
    ] },

    { type: "callout", title: "Prices change. Always verify.", text: "The rates above are pulled from the live TapTurf database, but venues adjust slot pricing without warning — especially for weekend evenings. Message the turf on WhatsApp for the current rate before you commit your squad." },

    { type: "h2", text: "How to actually save money" },
    { type: "ol", items: [
      "Book weekday mornings if your schedule allows — cheapest slot of the week almost everywhere.",
      "Play with a full 12–14 player squad and split evenly. Per-player cost drops significantly.",
      "Book back-to-back with a friendly squad — some venues offer a small discount for a 2-hour combined booking.",
      "Ask about a monthly slot. Regulars often get a 10–15% discount on a fixed weekly time.",
      "Don't chase a ₹100 saving into an area 40 minutes away. Petrol + time > savings.",
    ] },

    { type: "h2", text: "How TapTurf helps" },
    { type: "p", text: "The listing page shows the published range for every venue that has one, distance from you, real photos, and a Call/WhatsApp button. Compare 3–4 in the same area in about 60 seconds instead of the usual Instagram → phone-tag loop." },
    { type: "cta", text: "See every Pune turf — sorted by distance from where you are.", href: "/pune", label: "Compare Pune turfs" },

    { type: "h2", text: "Frequently asked" },
    { type: "faq", items: [
      { q: "What's the cheapest football turf in Pune?",
        a: "Right now, some Hotfut slots publish at ₹200/hr on TapTurf. But 'cheapest' is a moving target — quality, distance and slot time all matter. Use the calculator above to find your actual per-player cost." },
      { q: "Are weekend rates always higher?",
        a: "Not always, but usually yes — 15–30% higher for Friday evening through Sunday. A few venues run flat rates regardless of day." },
      { q: "Do turfs charge extra for lights or equipment?",
        a: "Lights are usually included after sunset. Balls and cones vary — some include them, some rent for a nominal fee. Ask on WhatsApp before you assume." },
      { q: "Can I negotiate the price?",
        a: "For a one-off booking, rarely. For a weekly regular slot with a full squad, yes — 10–15% is a normal ask." },
      { q: "Does TapTurf charge a booking fee?",
        a: "No. TapTurf shows the venue, real photos, and the direct number. You pay the turf directly whatever they quote — no markup." },
    ] },
  ],
};
