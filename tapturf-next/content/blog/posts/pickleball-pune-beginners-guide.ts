import type { Post } from "../types";

export const post: Post = {
  slug: "pickleball-pune-beginners-guide",
  title: "Pickleball in Pune: Beginner's Guide to Your First Game",
  description:
    "Everything a first-time pickleball player in Pune needs — the rules that matter, the paddle-and-ball basics, singles vs doubles, kitchen zone explained, and the courts on TapTurf that actually offer pickleball right now.",
  hook: "Not a sport for old people. It's tennis' faster, cheaper, more sociable cousin and it's exploding in Pune.",
  category: "Guides",
  city: "pune",
  readMinutes: 7,
  publishedAt: "2026-09-26",
  coverEmoji: "🏓",
  keywords: [
    "pickleball Pune",
    "pickleball court Pune",
    "pickleball near me Pune",
    "how to play pickleball",
    "pickleball rules India",
    "learn pickleball Pune",
  ],
  cta: { href: "/sport/pickleball", label: "See pickleball courts" },
  blocks: [
    {
      type: "p",
      text: "Pickleball is a small-court racket sport that borrows from tennis, badminton and table tennis. The court is one-third the size of a tennis court, the ball has holes and doesn't bounce much, and one hour is enough for a beginner to have real rallies with a real opponent. It's the fastest-growing racket sport in India — and Pune is early to it.",
    },

    { type: "stat-grid", items: [
      { value: "44'×20'", label: "Court size", hint: "About 1/3 of a tennis court" },
      { value: "2 or 4", label: "Players", hint: "Singles or doubles" },
      { value: "11", label: "Points to win", hint: "Win by 2, serve to score" },
      { value: "7'", label: "Kitchen zone", hint: "From the net, no volleys allowed" },
    ] },

    { type: "h2", text: "What you actually need" },
    { type: "ul", items: [
      "A paddle. A ₹1,500–₹3,000 wooden or composite paddle is fine to start.",
      "Balls. Outdoor pickleballs (harder plastic, more holes) for outdoor concrete/turf courts; indoor balls (softer, larger holes) for wood floors.",
      "Court shoes. Same rules as any other racket sport — non-marking soles, lateral support. Running shoes are the wrong tool.",
      "Water. Rallies are short but non-stop. You'll sweat more than you think.",
    ] },

    { type: "h2", text: "The rules you actually need on day one" },
    { type: "h3", text: "Serving" },
    { type: "p", text: "Underhand only. Paddle contacts the ball below your waist, arm swinging up. Serve diagonally to the receiver's service box, and the ball has to bounce once before they can return it. This is the 'double bounce rule' — the return must also bounce before you can hit it. Once both bounces are done, anything goes." },

    { type: "h3", text: "The kitchen (non-volley zone)" },
    { type: "p", text: "The 7-foot area on each side of the net is called the kitchen. You cannot hit the ball out of the air (a 'volley') while standing in the kitchen, or even while your momentum from a volley carries you into it. You can enter the kitchen to hit a ball that has bounced — but stepping in and back out cleanly takes practice." },

    { type: "h3", text: "Scoring" },
    { type: "p", text: "Only the serving side scores. First to 11, win by 2. In doubles, both players on the serving team get a serve before losing the serve — so calling the score sounds like '5-3-2' (server score, receiver score, first or second server). Don't stress about it on day one; just focus on getting the ball in play." },

    { type: "h2", text: "Singles vs doubles" },
    { type: "table", caption: "Two ways to play — pick based on cardio and squad size", columns: ["Format", "Best for", "Rally style", "Cardio load"], rows: [
      ["Singles", "Two players, tight fitness match", "Long lateral running", "High"],
      ["Doubles", "Groups of 4, mixed skill levels", "Fast reactions, less running", "Moderate"],
      ["Mixed doubles", "Couples / mixed friend groups", "Balanced, tactical", "Moderate"],
    ] },

    { type: "h2", text: "Where to play pickleball in Pune" },
    { type: "p", text: "Pickleball is new enough in Pune that the venue count is still small but growing. Every court below is on TapTurf and confirmed to offer pickleball — verify current availability with the venue before you drive out." },
    { type: "related-turfs", ids: [
      "6ec71550-63a9-4c4e-bf9d-d54b63405982",
      "a47b1767-701b-432a-9a55-e6868bab1c7c",
      "83bd2e75-0853-46e5-ade7-c5d2d9c60f16",
    ] },
    { type: "callout", title: "New venue?", text: "If your club or venue offers pickleball and isn't listed on TapTurf yet, drop us a WhatsApp — we add new sports courts weekly." },

    { type: "h2", text: "Your first session, planned" },
    { type: "ol", items: [
      "Book a court for 60 minutes. Any longer and beginners burn out.",
      "Warm up for 5 minutes — light shoulder rolls, some easy back-and-forth rallies with no scoring.",
      "Play three practice games to 5 (not 11) to get used to serving, the double bounce, and staying out of the kitchen.",
      "Then play a full game to 11.",
      "Water break. Repeat.",
    ] },

    { type: "h2", text: "Common day-one mistakes" },
    { type: "ul", items: [
      "Trying to hit hard — pickleball rewards placement over power almost every time.",
      "Standing at the baseline all match. Move up to the kitchen line after the third shot; that's where points are won.",
      "Volleying from inside the kitchen. Even if the ball is chest-high, if your feet are in the kitchen it's a fault.",
      "Serving overhand like tennis. It's illegal — paddle contact below the waist, upward swing." ,
      "Overgripping. Loose wrist = better dinks.",
    ] },

    { type: "h2", text: "Now find somewhere to play" },
    { type: "p", text: "TapTurf's sport filter has a pickleball chip — one tap and you'll see every pickleball-listed venue in your city sorted by distance." },
    { type: "cta", text: "See every pickleball court in Pune with photos and phone numbers.", href: "/sport/pickleball", label: "See pickleball courts" },

    { type: "h2", text: "Frequently asked" },
    { type: "faq", items: [
      { q: "Do I need my own paddle to try pickleball?",
        a: "Most venues will loan you a paddle for your first session. If you get hooked, buying your own for ₹1,500–₹3,000 is a small commitment that noticeably improves your play." },
      { q: "How long does a pickleball match take?",
        a: "A single game to 11 usually lasts 10–20 minutes. A best-of-three match is 30–60 minutes total. A booked hour normally covers 3–5 games." },
      { q: "Can I play pickleball on a badminton court?",
        a: "Technically yes — a badminton court is close to the right size. But the surface, net height (pickleball is lower) and lines will feel wrong. Purpose-built pickleball courts are worth seeking out." },
      { q: "Is pickleball actually a real sport?",
        a: "Yes. It has professional tours in the US and Australia, is spreading fast across India, and requires genuine skill at higher levels. Don't be fooled by how easy day-one feels." },
    ] },
  ],
};
