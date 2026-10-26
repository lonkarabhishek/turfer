import type { Post } from "../types";

// Data post: turfs listed in Undri, Pune.
// Source: TapTurf database (public.turfs), queried read-only on 26 Oct 2026.
// Scope: active Pune listings whose area is Undri (10 venues). No listing in
// another area mentions Undri in its name or address, so none were added.
// Mohammed Wadi and Kondhwa listings are not counted.
// Prices and hours are as listed (mostly from Google Maps and other public
// listings), not owner-verified.

export const post: Post = {
  slug: "turfs-in-undri-pune",
  title: "Turfs in Undri, Pune: 10 Listed, Prices and Hours",
  description:
    "TapTurf data, 26 Oct 2026: 10 turfs in Undri, Pune. What an hour costs, why daytime slots are cheaper, the 24-hour venues, facilities and what to check.",
  hook: "10 turfs, a ₹950 typical weekday evening rate, and daytime slots cheaper at 7 of 8 priced venues. Here is Undri venue by venue, with the data's limits.",
  category: "Pune",
  city: "pune",
  readMinutes: 6,
  publishedAt: "2026-10-26",
  coverEmoji: "⚽",
  heroImage: {
    url: "/blog/art/turfs-in-undri-pune.svg",
    og: "https://www.tapturf.in/blog/art/turfs-in-undri-pune.png",
    alt: "Summary card for turfs in Undri, Pune: 10 listed, a ₹950 typical weekday evening rate, ₹300 lowest listed hour, 8 open to midnight or later, and a bar chart of weekday evening prices by venue",
  },
  keywords: [
    "turf in undri",
    "turfs in undri pune",
    "football turf undri",
    "box cricket undri",
    "turf price undri",
    "24 hour turf undri",
    "turf near nyati estate road",
    "turf near bishop's school undri",
  ],
  cta: { href: "/pune/football", label: "See football turfs in Pune" },
  blocks: [
    {
      type: "p",
      text: "As of 26 October 2026, TapTurf lists 10 active turfs in Undri, Pune. All 10 offer football and nine offer box cricket. Where a price is listed, the typical weekday evening rate is ₹950 an hour. Across all listed slots, Undri's median of ₹800 sits below Pune's ₹1,000, and seven of the eight priced venues charge less in the daytime, so a morning or afternoon slot is where Undri gets cheap.",
    },
    {
      type: "callout",
      title: "Read this first",
      text: "These figures describe turfs listed on TapTurf, not every turf in Undri. Listings are compiled from Google Maps and other public sources. Prices and hours are as listed and have not been confirmed by owners, so check the rate and the slot with the venue before you book.",
    },
    {
      type: "stat-grid",
      items: [
        { value: "10", label: "Turfs listed in Undri", hint: "TapTurf database, 26 Oct 2026" },
        { value: "₹950", label: "Typical weekday evening rate", hint: "median of 8 priced venues" },
        { value: "₹300", label: "Lowest listed hourly rate", hint: "weekday daytime, Kanade Sports Club" },
        { value: "8", label: "Open to midnight or later", hint: "5 of them list 24 hours" },
      ],
    },

    { type: "h2", text: "How many turfs are there in Undri?" },
    {
      type: "p",
      text: "We counted every active Pune listing whose area is Undri, which gives 10 venues. No listing filed under another area mentions Undri in its name or address, so nothing was added from the edges. Nearby Mohammed Wadi and Kondhwa have their own listings and are not counted here. The venues are spread out rather than clustered: each one sits in a different pocket, from Kanade Farm and Hole Vasti to Nyati Estate Road and the Undri City Center Mall.",
    },
    {
      type: "table",
      caption: "Turfs in Undri at a glance (TapTurf database, 26 Oct 2026)",
      columns: ["Turf", "Where in Undri", "Listed hours"],
      rows: [
        ["Kanade Sports Club", "Kanade Farm, near Marvel Ideal Specio", "24 hours"],
        ["Nature Sports and Fitness Centre", "Behind Hill Green High School", "24 hours"],
        ["Brio Turf", "Behind Bishop's School", "24 hours"],
        ["Kick and Pitch", "Hole Vasti", "24 hours"],
        ["Four Lions Undri", "Shree Siddhivinayak Meera", "24 hours"],
        ["Yadnya Sports & Wellness Club", "Wadachi Wadi, near Bricks College of Architecture", "6 am to midnight"],
        ["Arena Xtreme Sports Club", "Undri City Center Mall, Bellagio", "5 am to midnight"],
        ["Adrenaline Arena", "Undri, no street given", "6 am to midnight"],
        ["Full On Sportz", "Ababil Sports Plaza, Nyati Estate Road", "5 am to 11 pm"],
        ["Hotfut Undri", "Kad Nagar", "6 am to 11 pm"],
      ],
    },
    {
      type: "p",
      text: "Football is listed at all 10 venues and box cricket at nine. Four Lions Undri lists cricket and a 10-a-side football ground rather than box cricket. Kanade Sports Club and Yadnya Sports & Wellness Club also list cricket nets. Badminton is listed at three venues (Full On Sportz, Hotfut Undri and Arena Xtreme Sports Club) and pickleball at one, Kick and Pitch. Kanade Sports Club is the biggest venue on file, with seven grounds and formats from 6-a-side up to 11-a-side, and Brio Turf lists three grounds.",
    },

    { type: "h2", text: "What does a turf in Undri cost per hour?" },
    {
      type: "p",
      text: "Eight of the 10 venues have a listed hourly price. Weekday evening rates run from ₹700 to ₹2,000, with a median of ₹950. For a 7-a-side game, ₹950 split 14 ways is about ₹68 a head. Weekend evenings have the same ₹950 median. Taking every listed rate together (morning, afternoon and evening, weekday and weekend), the Undri median is ₹800 an hour, against ₹1,000 for Pune as a whole in our price map and in Wakad.",
    },
    {
      type: "table",
      caption: "Listed hourly prices, Undri turfs with a price (TapTurf database, 26 Oct 2026)",
      columns: ["Turf", "Weekday morning", "Weekday evening", "Weekend evening"],
      rows: [
        ["Kanade Sports Club", "₹300", "₹700", "₹900"],
        ["Brio Turf", "₹500", "₹700", "₹800"],
        ["Arena Xtreme Sports Club", "₹750", "₹750", "₹800"],
        ["Adrenaline Arena", "₹600", "₹900", "₹900"],
        ["Full On Sportz", "₹800", "₹1,000", "₹1,000"],
        ["Kick and Pitch", "₹700", "₹1,100", "₹1,100"],
        ["Hotfut Undri", "₹1,000", "₹1,200", "₹1,200"],
        ["Yadnya Sports & Wellness Club", "₹1,400", "₹2,000", "₹2,000"],
      ],
    },
    {
      type: "p",
      text: "Two notes on the table. Kanade Sports Club's rates are for its smaller 6-a-side ground. Its listed rates are ₹300 an hour from 6 am to 7 pm on weekdays, ₹600 from 7 pm and ₹700 from 9 pm, while the 9-a-side and 11-a-side grounds are listed at ₹500 by day and ₹1,200 at night. Yadnya Sports & Wellness Club is the clear outlier at ₹2,000 on evenings, and its listing shows weekend daytime (₹1,200) cheaper than weekday daytime (₹1,400). That is what the listing says, so confirm it with the venue.",
    },
    {
      type: "cta",
      text: "Listed hourly prices across 14 Indian cities.",
      href: "/blog/india-turf-price-map-2026",
      label: "Read: India's turf price map",
    },

    { type: "h2", text: "Is it cheaper to play on weekday mornings in Undri?" },
    {
      type: "p",
      text: "Yes, at almost every priced venue. Seven of the eight list a lower weekday morning rate than their weekday evening rate, and the median weekday morning rate is ₹725 against ₹950 in the evening. The biggest gaps are at Kanade Sports Club (₹300 against ₹700), Kick and Pitch (₹700 against ₹1,100) and Yadnya Sports & Wellness Club (₹1,400 against ₹2,000). Only Arena Xtreme Sports Club lists one flat rate, ₹750 on weekdays and ₹800 at weekends. That is the opposite of Wakad, where most venues charge the same all day, so in Undri moving your game to the daytime is the easiest saving.",
    },
    {
      type: "cta",
      text: "Peak and off-peak slots, and how to pick one.",
      href: "/blog/best-time-to-book-a-turf",
      label: "Read: the best time to book a turf",
    },

    { type: "h2", text: "Which Undri turfs are open late or 24 hours?" },
    {
      type: "p",
      text: "Hours are listed for all 10 venues, and eight stay open to midnight or later. Five list 24 hours: Kanade Sports Club, Nature Sports and Fitness Centre, Brio Turf, Kick and Pitch and Four Lions Undri. Yadnya Sports & Wellness Club, Arena Xtreme Sports Club and Adrenaline Arena list closing at midnight. Full On Sportz and Hotfut Undri close at 11 pm. For early games, Full On Sportz and Arena Xtreme Sports Club list opening at 5 am, apart from the 24-hour venues.",
    },
    {
      type: "cta",
      text: "Which Pune and Nashik turfs stay open past midnight.",
      href: "/blog/late-night-turfs-pune-nashik",
      label: "Read: late-night turfs in Pune and Nashik",
    },
    {
      type: "turf",
      id: "kanade-sports-club-undri",
      name: "Kanade Sports Club",
      area: "Kanade Farm, Undri, Pune",
      rating: 4.4,
      reviews: 479,
      note: "The most-reviewed venue here, with seven grounds from 6-a-side to 11-a-side, plus cricket nets. Listed as open 24 hours, with the lowest listed rate in Undri: ₹300 an hour on weekday daytime for the 6-a-side ground.",
    },
    {
      type: "turf",
      id: "nature-sports-and-fitness-centre-undri",
      name: "Nature Sports and Fitness Centre",
      area: "Behind Hill Green High School, Undri, Pune",
      rating: 4.4,
      reviews: 341,
      note: "Football and box cricket, listed as open 24 hours. No hourly price in our main fields; its listed 7-a-side rates are ₹1,000 by day and ₹1,600 from 6 pm. Lists no washroom or changing room.",
    },
    {
      type: "turf",
      id: "brio-turf-undri",
      name: "Brio Turf",
      area: "Behind Bishop's School, Undri, Pune",
      rating: 4.3,
      reviews: 146,
      note: "Three grounds, 5-a-side to 9-a-side, listed as open 24 hours. ₹500 an hour on weekday mornings and ₹700 on weekday evenings. Lists a changing room and a cafeteria.",
    },
    {
      type: "turf",
      id: "hotfut-undri",
      name: "Hotfut Undri",
      area: "Kad Nagar, Undri, Pune",
      rating: 4.5,
      reviews: 142,
      note: "7-a-side football, box cricket and badminton, 6 am to 11 pm. ₹1,000 an hour by day and ₹1,200 in the evening. Lists a changing room, floodlights and coaching.",
    },
    {
      type: "turf",
      id: "kick-and-pitch-undri",
      name: "Kick and Pitch",
      area: "Hole Vasti, Undri, Pune",
      rating: 4.0,
      reviews: 59,
      note: "The only Undri listing with pickleball, alongside box cricket and football. Listed as open 24 hours, ₹700 an hour by day and ₹1,100 in the evening.",
    },

    { type: "h2", text: "Can you play pickleball or badminton in Undri?" },
    {
      type: "p",
      text: "Pickleball, at one listed venue: Kick and Pitch in Hole Vasti, which is also open 24 hours. Ask whether the court is a dedicated pickleball court or marked on a shared surface, and whether paddles and balls are provided. Badminton is listed at Full On Sportz on Nyati Estate Road, Hotfut Undri in Kad Nagar and Arena Xtreme Sports Club in the Undri City Center Mall.",
    },
    {
      type: "cta",
      text: "New to the game? Rules, kit and where to start in Pune.",
      href: "/blog/pickleball-pune-beginners-guide",
      label: "Read: pickleball in Pune for beginners",
    },

    { type: "h2", text: "What facilities do Undri turfs list?" },
    {
      type: "p",
      text: "Parking is listed at all 10 venues and washrooms at seven. Two venues, Nature Sports and Fitness Centre and Four Lions Undri, say they have no washroom. Changing rooms are listed at three: Kanade Sports Club, Brio Turf and Hotfut Undri. Four venues say they do not have one, and the rest are unknown. Five venues list a cafeteria, and floodlights are marked at four. Kanade Sports Club is the only venue marked as covered. Blank does not mean missing, it means we do not have the detail yet.",
    },

    { type: "h2", text: "What should you check before booking in Undri?" },
    {
      type: "ol",
      items: [
        "Confirm the exact slot and rate. Listed prices are not owner-confirmed, and at venues like Kanade Sports Club the rate changes by ground size and by the hour.",
        "Book daytime if you can. Seven of eight priced venues charge less before the evening, often by ₹200 to ₹600 an hour.",
        "Check the map pin. Undri's venues are spread from Hole Vasti and Kanade Farm to Nyati Estate Road and the City Center Mall, so ask for the landmark before you set off.",
        "Check the format and the sport. Four Lions Undri lists cricket rather than box cricket, and ground sizes run from 5-a-side to 11-a-side.",
        "If you need a washroom or changing room, ask first. Two venues say they have no washroom and only three list a changing room.",
      ],
    },
    {
      type: "p",
      text: "Agree on how to split the bill before the game. For other parts of Pune, our area guides to Wakad, Kothrud and Hinjewadi use the same data and method.",
    },
    {
      type: "cta",
      text: "12 turfs in Wakad, where most venues list one rate all day.",
      href: "/blog/turfs-in-wakad-pune",
      label: "Read: turfs in Wakad, Pune",
    },
    {
      type: "cta",
      text: "18 turfs in Kothrud and Karve Nagar, with cheaper afternoon slots.",
      href: "/blog/turfs-in-kothrud-pune",
      label: "Read: turfs in Kothrud, Pune",
    },
    {
      type: "cta",
      text: "15 turfs across Hinjewadi Phases 1 to 3, Maan and Marunji.",
      href: "/blog/turfs-in-hinjewadi-pune",
      label: "Read: turfs in Hinjewadi, Pune",
    },

    {
      type: "faq",
      items: [
        {
          q: "How many turfs are there in Undri?",
          a: "TapTurf lists 10 active turfs in Undri, Pune, as of 26 October 2026. This covers turfs listed on TapTurf, not necessarily every turf in the area.",
        },
        {
          q: "What is the price of a turf in Undri per hour?",
          a: "Among the 8 Undri turfs with a listed price, weekday evening rates range from ₹700 to ₹2,000, with a median of ₹950. The lowest listed slot is ₹300 an hour on weekday daytime for the 6-a-side ground at Kanade Sports Club. Confirm current rates with the venue.",
        },
        {
          q: "Are there 24-hour turfs in Undri?",
          a: "Yes, on listed hours. Kanade Sports Club, Nature Sports and Fitness Centre, Brio Turf, Kick and Pitch and Four Lions Undri list 24 hours, and three more list closing at midnight. Message the venue before a very late slot.",
        },
        {
          q: "Is it cheaper to book an Undri turf in the morning?",
          a: "Usually, yes. Seven of the eight priced Undri turfs list a lower weekday morning rate than their evening rate. The median weekday morning rate is ₹725 against ₹950 in the evening.",
        },
        {
          q: "Is there a pickleball court in Undri?",
          a: "One listed venue offers pickleball: Kick and Pitch in Hole Vasti, Undri.",
        },
      ],
    },

    { type: "h2", text: "About this data" },
    {
      type: "ul",
      items: [
        "Source: TapTurf database, 26 October 2026 (queried the same day, read-only).",
        "Scope: the 10 active Pune listings with Undri as the area. No listing in another area mentions Undri in its name or address. Mohammed Wadi and Kondhwa listings are not counted.",
        "Prices: 8 venues have a listed hourly price. Each can list up to six rates (morning, afternoon and evening, weekday and weekend). Prices are compiled from public sources and are not owner-confirmed.",
        "The all-rates median of ₹800 uses all 48 listed rates across the 8 venues, the same method as our India turf price map, whose Pune-wide median is ₹1,000 (172 priced Pune venues, 23 October 2026).",
        "Kanade Sports Club's per-ground rates and Nature Sports and Fitness Centre's 7-a-side rates come from the per-format price bands in our database (recorded 16 October 2026). Nature Sports is not in the price medians.",
        "Hours: listed for all 10 venues, mainly from Google Maps. Not confirmed by owners.",
        "Ratings and review counts are as shown on TapTurf on 26 October 2026. Adrenaline Arena's 4.5 rating comes from only 3 reviews.",
        "Facilities count only venues where the field is filled in. Blank fields are unknown, not 'no'.",
      ],
    },
  ],
};
