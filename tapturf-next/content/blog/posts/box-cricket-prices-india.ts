import type { Post } from "../types";

// All figures from public.turfs on 2026-10-08: venues tagged Box Cricket,
// active, with at least one listed positive price. "Off-peak" is the
// lowest of a venue's morning/afternoon/evening rates; "peak" the highest
// of its evening and weekend-evening rates. Medians, not averages.

export const post: Post = {
  slug: "box-cricket-prices-india",
  title: "What an Hour of Box Cricket Costs in Pune, Mumbai, Nagpur and Hyderabad (October 2026)",
  description:
    "Real listed hourly rates for box cricket across four cities, from 153 venues that publish prices: cheapest, typical and most expensive slots, what moves the price, and how much it works out per player.",
  hook: "153 venues publish a rate. We lined them all up. Pune is cheapest, Mumbai is double, and the evening bump is bigger than you think.",
  category: "Guides",
  city: null,
  readMinutes: 7,
  publishedAt: "2026-10-08",
  coverEmoji: "💸",
  heroImage: {
    url: "/blog/art/box-cricket-prices.svg",
    og: "https://www.tapturf.in/blog/art/box-cricket-prices.png",
    alt: "Illustration of a price tag, a stopwatch, a cricket bat and coins over a turf strip",
  },
  keywords: [
    "box cricket price per hour",
    "box cricket turf cost",
    "turf booking price",
    "box cricket Pune price",
    "box cricket Hyderabad price",
    "box cricket Mumbai price",
    "box cricket Nagpur price",
    "turf cost per person",
  ],
  cta: { href: "/turf-near-me", label: "Compare rates near you" },
  blocks: [
    {
      type: "p",
      text: "Ask three friends what a turf costs and you get three numbers, because they each booked a different cage on a different night. So we did the boring thing: pulled every box cricket venue on TapTurf that lists a price, 153 of them across Pune, Mumbai, Nagpur and Hyderabad, and lined up the rates. These are the venues' own published numbers on 8 October 2026, not estimates.",
    },
    {
      type: "stat-grid",
      items: [
        { value: "₹200", label: "Cheapest listed hour", hint: "A Pune morning slot" },
        { value: "₹800", label: "Typical off-peak", hint: "Median in Pune and Hyderabad" },
        { value: "₹3,500", label: "Most expensive hour", hint: "Mumbai and Hyderabad peak" },
        { value: "153", label: "Venues with a listed rate", hint: "Out of 263 box cricket turfs" },
      ],
    },

    { type: "h2", text: "The four cities side by side" },
    {
      type: "p",
      text: "Off-peak is the lowest rate a venue lists, usually a weekday morning or afternoon. Peak is the highest, usually a weekend evening. Both are medians, so half the venues in that city are cheaper and half dearer.",
    },
    {
      type: "table",
      caption: "Listed per-hour box cricket rates by city, 8 October 2026. Medians across venues that publish a price.",
      columns: ["City", "Cages", "List a rate", "Cheapest", "Off-peak (median)", "Peak (median)", "Dearest"],
      rows: [
        ["Pune", 93, 60, "₹200", "₹800", "₹1,125", "₹1,999"],
        ["Hyderabad", 83, 79, "₹400", "₹800", "₹1,200", "₹3,500"],
        ["Nagpur", 46, 8, "₹800", "₹1,175", "₹1,250", "₹2,500"],
        ["Mumbai", 41, 6, "₹700", "₹1,400", "₹1,900", "₹3,500"],
      ],
    },
    {
      type: "callout",
      title: "Read Mumbai and Nagpur with care",
      text: "Only 6 Mumbai venues and 8 Nagpur venues publish a rate, so those medians describe the venues that choose to list, which tend to be the better-organised and pricier ones. Pune (60 venues) and Hyderabad (79) are proper samples.",
    },

    { type: "h3", text: "Pune: the cheapest city, and the widest spread" },
    {
      type: "p",
      text: "Pune has the most cages of any city we cover and the lowest floor: a ₹200 hour exists, if you can play at the time it's offered. The middle of the market is ₹800 off-peak and ₹1,125 at peak, and nothing listed goes above ₹1,999. Pune venues also publish prices more readily than anywhere except Hyderabad, which makes it the easiest city to shop around in.",
    },
    { type: "h3", text: "Hyderabad: the most transparent" },
    {
      type: "p",
      text: "79 of 83 Hyderabad cages list a rate, the highest share anywhere. The typical numbers match Pune off-peak (₹800) and run slightly higher at peak (₹1,200), but the ceiling is much higher: a few large cages list ₹2,400 to ₹3,500 for an evening hour. Hyderabad also has 30 venues open 24 hours, so there is more cheap night-time supply than the medians suggest.",
    },
    { type: "h3", text: "Nagpur: a small sample, priced in the middle" },
    {
      type: "p",
      text: "Eight published rates, ranging from ₹800 to ₹2,500, with the typical hour around ₹1,200. The 38 venues that don't list usually quote something close to that on the phone, but we can't verify it, so treat ₹1,200 as a starting assumption rather than a fact.",
    },
    { type: "h3", text: "Mumbai: double, and mostly unlisted" },
    {
      type: "p",
      text: "Among the six Mumbai venues that publish, the typical off-peak hour is ₹1,400 and peak is ₹1,900, roughly twice Pune. The cheapest listed hour is ₹700 in Bhandup and the dearest is ₹3,500 at a Bandra school ground. Space is the reason: Mumbai cages are on rooftops and in industrial estates, and rent follows.",
    },

    { type: "h2", text: "What the price actually depends on" },
    {
      type: "ol",
      items: [
        "Time of day. Almost every venue runs two or three tiers: morning and afternoon, evening from around 6pm, and weekend evening. The evening bump is usually somewhere between 25 and 70 percent over the day rate. Hyderabad's HighBall lists ₹750 by day and ₹1,400 on a weekend night, nearly double.",
        "Cage size. A \"big box\" for 8-a-side costs more than a six-a-side cage, sometimes at the same venue. GSS Lords in Kukatpally lists ₹1,500 to ₹2,400; a six-a-side cage nearby lists ₹800.",
        "City and neighbourhood. Rent and land cost pass straight through. Bandra and Andheri East sit at the top in Mumbai; Pune's outer suburbs sit at the bottom nationally.",
        "Add-ons. Some venues include the tennis ball, stumps and water in the rate; others charge separately. Ask once, it changes the per-head maths.",
        "Flat-rate venues. A minority charge one price all day. Lucky Sports Hub in Andheri East lists ₹1,300 at any hour, and NexGen in Hyderabad ₹600. These are the ones to book for Saturday night.",
      ],
    },

    { type: "h2", text: "Per player, which is what matters" },
    {
      type: "p",
      text: "Nobody pays ₹1,200 for a turf. Twelve people pay ₹100 each. That's the frame to use, and it makes the city differences shrink: a ₹1,900 Mumbai peak hour is about ₹160 a head for 12 players, a ₹1,200 Hyderabad or Nagpur hour is ₹100, and an ₹800 Pune off-peak hour is under ₹70.",
    },
    {
      type: "table",
      caption: "Cost per player for one hour at typical peak rates, by squad size.",
      columns: ["City (median peak)", "10 players", "12 players", "14 players"],
      rows: [
        ["Pune, ₹1,125", "₹113", "₹94", "₹80"],
        ["Hyderabad, ₹1,200", "₹120", "₹100", "₹86"],
        ["Nagpur, ₹1,250", "₹125", "₹104", "₹89"],
        ["Mumbai, ₹1,900", "₹190", "₹158", "₹136"],
      ],
    },
    { type: "price-calc", defaults: { pricePerHour: 1200, players: 12, hours: 1 }, caption: "Put in your own venue's rate and squad size." },

    { type: "h2", text: "How to pay less without playing worse" },
    {
      type: "ul",
      items: [
        "Book the hour before the evening tier starts. A 5pm slot at the day rate is the same cage as the 6pm slot at the evening rate.",
        "Play after midnight in Hyderabad or Pune. Night slots at 24-hour venues are almost always charged at the evening rate, not a premium, and they're the easiest to get.",
        "Pick a flat-rate venue for weekend nights, when tiered venues are at their most expensive.",
        "Ask for a weekday morning rate. Several venues that list ₹800 will go lower for a 7am regular booking; the cheapest listed hours in Pune are exactly that.",
        "Fill the squad. The difference between 10 and 14 players is a third off per head, and the cage doesn't care.",
        "Compare before you call. Listed rates sit on every TapTurf page, so you can shortlist three cages within your budget and ring only those.",
      ],
    },

    { type: "h2", text: "What we didn't count" },
    {
      type: "p",
      text: "Nashik's cricket turfs are tagged as cricket rather than box cricket in our data, so they are covered in our Nashik cricket guide instead. Venues with no listed price are excluded entirely rather than guessed at. Reported prices from reviews, which appear on some TapTurf pages marked as unverified, are also left out. When a venue lists a price we take it at face value; if it is wrong, the Suggest button on the turf page is the fastest way to tell us.",
    },

    {
      type: "faq",
      items: [
        {
          q: "How much does one hour of box cricket cost in India?",
          a: "Across 153 venues on TapTurf that list a price, the typical off-peak hour is ₹800 in Pune and Hyderabad, about ₹1,175 in Nagpur and ₹1,400 in Mumbai. Peak evening hours run ₹1,125 in Pune, ₹1,200 in Hyderabad, ₹1,250 in Nagpur and ₹1,900 in Mumbai. The cheapest listed hour is ₹200 and the dearest ₹3,500.",
        },
        {
          q: "Which city has the cheapest box cricket turfs?",
          a: "Pune, with a median off-peak rate of ₹800, a median peak of ₹1,125 and nothing listed above ₹1,999. Hyderabad matches it off-peak but has pricier large cages at the top end.",
        },
        {
          q: "Why are evening slots more expensive?",
          a: "Demand. Most people can only play after work, so venues price evenings and weekend evenings higher, usually 25 to 70 percent above the day rate. The cage, lights and ball are the same.",
        },
        {
          q: "How much does box cricket cost per person?",
          a: "Divide the hourly rate by your squad. At a typical ₹1,200 peak hour, 12 players pay ₹100 each. In Mumbai at ₹1,900 it is about ₹160 each. Bigger squads bring it down fast.",
        },
        {
          q: "Does TapTurf add a booking fee?",
          a: "No. The rates on TapTurf are the venues' own, and you pay the venue directly.",
        },
      ],
    },

    {
      type: "cta",
      text: "See listed rates on every cage near you and shortlist before you call.",
      href: "/turf-near-me",
      label: "Find box cricket turfs near me",
    },
  ],
};
