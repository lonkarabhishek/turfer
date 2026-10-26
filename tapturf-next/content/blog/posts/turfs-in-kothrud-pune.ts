import type { Post } from "../types";

// Data post: turfs listed in and around Kothrud, Pune.
// Source: TapTurf database (public.turfs), queried read-only on 24 Oct 2026.
// Scope: active Pune listings whose area or address says Kothrud or Karve Nagar.
// 18 venues (one in Erandwane gives its address as Kothrud Industrial Area).
// Prices and hours are as listed (mostly from Google Maps and other public
// listings), not owner-verified.

export const post: Post = {
  slug: "turfs-in-kothrud-pune",
  title: "Turfs in Kothrud, Pune: 18 Listed, Prices and Hours",
  description:
    "TapTurf data, 24 Oct 2026: 18 turfs in Kothrud and Karve Nagar, Pune. What an hour costs, the cheaper afternoon slots, late hours, pickleball and what to check.",
  hook: "18 turfs, a ₹1,175 typical weekday evening rate, and afternoon slots at about half price. Here is Kothrud by locality, with the data's limits.",
  category: "Pune",
  city: "pune",
  readMinutes: 6,
  publishedAt: "2026-10-24",
  coverEmoji: "⚽",
  heroImage: {
    url: "/blog/art/turfs-in-kothrud-pune.svg",
    og: "https://www.tapturf.in/blog/art/turfs-in-kothrud-pune.png",
    alt: "Summary card for turfs in Kothrud, Pune: 18 listed, a ₹1,175 typical weekday evening rate, ₹500 lowest listed hour, 7 open to midnight or later, and a bar chart of venues by locality",
  },
  keywords: [
    "turf in kothrud",
    "turfs in kothrud pune",
    "football turf kothrud",
    "box cricket kothrud",
    "turf in karve nagar",
    "turf price kothrud",
    "pickleball kothrud",
    "24 hour turf kothrud",
  ],
  cta: { href: "/pune/football", label: "See football turfs in Pune" },
  blocks: [
    {
      type: "p",
      text: "As of 24 October 2026, TapTurf lists 18 active turfs in Kothrud and Karve Nagar, Pune. All 18 offer football and 15 offer box cricket. Where a price is listed, the typical weekday evening rate is ₹1,175 an hour, and several venues list weekday afternoon slots at about half their evening rate.",
    },
    {
      type: "callout",
      title: "Read this first",
      text: "These figures describe turfs listed on TapTurf, not every turf in Kothrud. Listings are compiled from Google Maps and other public sources. Prices and hours are as listed and have not been confirmed by owners, so check the rate and the slot with the venue before you book.",
    },
    {
      type: "stat-grid",
      items: [
        { value: "18", label: "Turfs listed in Kothrud and Karve Nagar", hint: "TapTurf database, 24 Oct 2026" },
        { value: "₹1,175", label: "Typical weekday evening rate", hint: "median of 12 priced venues" },
        { value: "₹500", label: "Lowest listed hourly rate", hint: "weekday morning, one venue" },
        { value: "7", label: "Open to midnight or later", hint: "3 of them list 24 hours" },
      ],
    },

    { type: "h2", text: "How many turfs are there in Kothrud?" },
    {
      type: "p",
      text: "We counted every active Pune listing whose area or address says Kothrud or Karve Nagar. That gives 18 venues. One of them, Turf 11, is listed under Erandwane but gives its address as Kothrud Industrial Area, so it is included. Kothrud already had the most listed turfs of any Pune area in our Nashik vs Pune comparison, and adding Karve Nagar makes the cluster bigger still.",
    },
    {
      type: "table",
      caption: "Turfs in Kothrud and Karve Nagar by locality (TapTurf database, 24 Oct 2026)",
      columns: ["Locality in the address", "Turfs", "Examples"],
      rows: [
        ["Kothrud, no street given", 6, "Game On Football Turf, The Turf Ground, Hindu Gymkhana Kothrud"],
        ["Paud Road, Gandhi Bhavan Road, Chaitanya Nagar", 4, "Ground Zero Kothrud, The Foothill Arena, Eklavya Sports"],
        ["Karve Nagar", 3, "Derby Sports Turf, Kaizen Sports, Playfit Sports Club"],
        ["Rambaug Colony and Mahaganesh Colony (MIT side)", 2, "Greenbox Turf MIT, Rama Sports"],
        ["Jijai Nagar, towards Warje", 2, "Kurukshetra Multi Sports Arena, Champions Field 2.0"],
        ["Erandwane edge", 1, "Turf 11"],
      ],
    },
    {
      type: "p",
      text: "Football is everywhere here: all 18 venues list it, and listed formats run from 5-a-side to 8-a-side. Box cricket is listed at 15. Four venues also list pickleball (Hindu Gymkhana Kothrud, Kaizen Sports, Rama Sports and Eklavya Sports And Cultural Academy) and three list cricket nets. Two listings carry The Foothill Arena name, one on Paud Road and one on Gandhi Bhavan Road.",
    },

    { type: "h2", text: "What does a turf in Kothrud cost per hour?" },
    {
      type: "p",
      text: "Twelve of the 18 venues have a listed hourly price. Weekday evening rates run from ₹800 to ₹1,350, with a median of ₹1,175. Weekend evenings are dearer, with a median of ₹1,300 and a top listed rate of ₹1,650 at Derby Sports Turf. For a 7-a-side game, ₹1,175 split 14 ways is about ₹84 a head.",
    },
    {
      type: "table",
      caption: "Listed hourly prices, Kothrud and Karve Nagar turfs with a price (TapTurf database, 24 Oct 2026)",
      columns: ["Turf", "Weekday morning", "Weekday evening", "Weekend evening"],
      rows: [
        ["Kurukshetra Multi Sports Arena", "₹500", "₹1,000", "₹1,200"],
        ["Turf 38", "₹700", "₹1,000", "₹1,200"],
        ["Rama Sports", "₹800", "₹800", "₹1,000"],
        ["Hindu Gymkhana Kothrud", "₹800", "₹1,200", "₹1,500"],
        ["Game On Football Turf", "₹800", "₹1,200", "₹1,300"],
        ["Eklavya Sports And Cultural Academy", "₹899", "₹1,099", "₹1,100"],
        ["Champions Field 2.0", "₹900", "₹1,100", "₹1,200"],
        ["Playfit Sports Club", "₹900", "₹1,300", "₹1,600"],
        ["Turf 11", "₹950", "₹1,150", "₹1,350"],
        ["Derby Sports Turf", "₹950", "₹1,350", "₹1,650"],
        ["Kaizen Sports", "₹1,100", "₹1,300", "₹1,500"],
        ["The Turf Ground", "₹1,200", "₹1,200", "Not listed"],
      ],
    },
    {
      type: "p",
      text: "Taking every listed rate together (morning, afternoon and evening, weekday and weekend), the Kothrud median is ₹1,000 an hour, the same as the Pune-wide median in our price map. So Kothrud is not an expensive area overall. It is the evening and weekend slots that cost more, and 10 of the 11 venues that list both rates charge at least ₹100 more on weekend evenings.",
    },
    {
      type: "cta",
      text: "Listed hourly prices across 14 Indian cities.",
      href: "/blog/india-turf-price-map-2026",
      label: "Read: India's turf price map",
    },

    { type: "h2", text: "When is the cheapest time to play in Kothrud?" },
    {
      type: "p",
      text: "Weekday afternoons. Four venues list an afternoon rate at about half their weekday evening rate: Kaizen Sports at ₹550 against ₹1,300, Game On Football Turf at ₹600 against ₹1,200, Playfit Sports Club at ₹600 against ₹1,300, and Derby Sports Turf at ₹650 against ₹1,350. The lowest listed rate in the area is ₹500 an hour on weekday mornings and afternoons at Kurukshetra Multi Sports Arena. If your squad can play before 5 pm, ask for the afternoon rate.",
    },
    {
      type: "cta",
      text: "Peak and off-peak slots, and how to pick one.",
      href: "/blog/best-time-to-book-a-turf",
      label: "Read: the best time to book a turf",
    },

    { type: "h2", text: "Which Kothrud turfs are open late or 24 hours?" },
    {
      type: "p",
      text: "Hours are listed for all 18 venues. Three list 'Open 24 hours': High Score FC, Kurukshetra Multi Sports Arena and Champions Field 2.0. The Turf Ground lists 6 am to 2 am, and Game On Football Turf, Ground Zero Kothrud and Eklavya Sports list closing at midnight. Most of the rest close between 10 pm and 11:30 pm. For early games, Game On, Derby, Kaizen and Playfit list opening at 5 am. Turf 11 lists the latest opening, 10 am.",
    },
    {
      type: "cta",
      text: "Which Pune and Nashik turfs stay open past midnight.",
      href: "/blog/late-night-turfs-pune-nashik",
      label: "Read: late-night turfs in Pune and Nashik",
    },
    {
      type: "turf",
      id: "game-on-football-turf-kothrud",
      name: "Game On Football Turf",
      area: "Kothrud, Pune",
      rating: 4.2,
      reviews: 853,
      note: "The most-reviewed venue in this list. 6-a-side football, listed 5 am to midnight. Listed ₹600 an hour on weekday afternoons and ₹1,200 in the evening.",
    },
    {
      type: "turf",
      id: "the-turf-ground-kothrud",
      name: "The Turf Ground",
      area: "Kothrud, Pune",
      rating: 4.6,
      reviews: 437,
      note: "Listed 6 am to 2 am daily. Football and box cricket, with 6, 7 and 8-a-side formats listed. Listed ₹1,200 an hour on weekdays.",
    },
    {
      type: "turf",
      id: "derby-sports-turf-karve-nagar",
      name: "Derby Sports Turf",
      area: "Behind Cummins College, Karve Nagar, Pune",
      rating: 4.3,
      reviews: 547,
      note: "One of three venues here that list a changing room. Listed ₹650 an hour on weekday afternoons, up to ₹1,650 on weekend evenings.",
    },
    {
      type: "turf",
      id: "kurukshetra-multi-sports-arena-kothrud",
      name: "Kurukshetra Multi Sports Arena",
      area: "Jijai Nagar, Kothrud, Pune",
      rating: 4.5,
      reviews: 96,
      note: "Listed as open 24 hours. The lowest listed rate here, ₹500 an hour on weekday mornings and afternoons. Box cricket and football.",
    },
    {
      type: "turf",
      id: "hindu-gymkhana-kothrud",
      name: "Hindu Gymkhana Kothrud",
      area: "Kothrud, Pune",
      rating: 4.7,
      reviews: 387,
      note: "Lists pickleball and cricket nets as well as box cricket and 7-a-side football. Listed 6 am to 10 pm.",
    },

    { type: "h2", text: "Can you play pickleball in Kothrud?" },
    {
      type: "p",
      text: "Yes, on TapTurf's listings. Four venues list pickleball: Hindu Gymkhana Kothrud, Kaizen Sports in Karve Nagar, Rama Sports near MIT Vishwashanti Gurukul School, and Eklavya Sports And Cultural Academy on DP Road. Eklavya also lists tennis, table tennis and basketball. Ask whether the court is a dedicated pickleball court or marked on a shared surface, and whether paddles and balls are provided.",
    },
    {
      type: "cta",
      text: "New to the game? Rules, kit and where to start in Pune.",
      href: "/blog/pickleball-pune-beginners-guide",
      label: "Read: pickleball in Pune for beginners",
    },

    { type: "h2", text: "What facilities do Kothrud turfs list?" },
    {
      type: "p",
      text: "Parking is listed at 16 of the 18 venues and washrooms at 11. Changing rooms are rare: only Derby Sports Turf, Playfit Sports Club and Rama Sports list one, 10 venues say they do not have one, and the rest are unknown. Floodlights are marked at 8 venues and the field is blank for the others. Blank does not mean missing, it means we do not have the detail yet.",
    },

    { type: "h2", text: "What should you check before booking in Kothrud?" },
    {
      type: "ol",
      items: [
        "Confirm the exact slot and rate. Listed prices are not owner-confirmed, and the gap between afternoon and evening rates can be ₹700 or more.",
        "Ask for the locality, not just the word Kothrud. Venues run from Paud Road and Karve Nagar to Jijai Nagar near the highway, so check the map pin.",
        "Check the format. Listed grounds range from 5-a-side to 8-a-side, so make sure the size suits your squad.",
        "If you are coming from work, ask about a changing room. Only three venues here list one.",
        "Some venues have split hours. Rama Sports, for example, lists a short morning slot and then opens from the afternoon on weekdays.",
      ],
    },
    {
      type: "p",
      text: "Agree on how to split the bill before the game. Our guide to splitting turf costs with your squad has a simple method, and our Hinjewadi area guide covers the other big turf cluster in west Pune.",
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
          q: "How many turfs are there in Kothrud?",
          a: "TapTurf lists 18 active turfs in Kothrud and Karve Nagar, Pune, as of 24 October 2026. This covers turfs listed on TapTurf, not necessarily every turf in the area.",
        },
        {
          q: "What is the price of a turf in Kothrud per hour?",
          a: "Among the 12 Kothrud turfs with a listed price, weekday evening rates range from ₹800 to ₹1,350, with a median of ₹1,175. The lowest listed slot is ₹500 an hour on weekday mornings at Kurukshetra Multi Sports Arena. Confirm current rates with the venue.",
        },
        {
          q: "Are there 24-hour turfs in Kothrud?",
          a: "Yes, on listed hours. High Score FC, Kurukshetra Multi Sports Arena and Champions Field 2.0 list 'Open 24 hours', and The Turf Ground lists hours until 2 am. Message the venue before a very late slot.",
        },
        {
          q: "Is there a pickleball court in Kothrud?",
          a: "Four listed venues offer pickleball: Hindu Gymkhana Kothrud, Kaizen Sports, Rama Sports and Eklavya Sports And Cultural Academy.",
        },
        {
          q: "When is the cheapest time to book a turf in Kothrud?",
          a: "Weekday afternoons. Several venues, including Kaizen Sports, Game On Football Turf, Playfit Sports Club and Derby Sports Turf, list afternoon rates at about half their weekday evening rate.",
        },
      ],
    },

    { type: "h2", text: "About this data" },
    {
      type: "ul",
      items: [
        "Source: TapTurf database, 24 October 2026 (queried the same day, read-only).",
        "Scope: 18 active Pune listings whose area or address says Kothrud or Karve Nagar. Turf 11 is listed under Erandwane but its address says Kothrud Industrial Area.",
        "Prices: 12 venues have a listed hourly price. Each can list up to six rates (morning, afternoon and evening, weekday and weekend). Prices are compiled from public sources and are not owner-confirmed.",
        "The all-rates median of ₹1,000 uses all 69 listed rates across the 12 venues, the same method as our India turf price map, whose Pune-wide median is ₹1,000 (172 priced Pune venues, 23 October 2026).",
        "Hours: listed for all 18 venues, mainly from Google Maps. Not confirmed by owners.",
        "Ratings and review counts are as shown on TapTurf on 24 October 2026.",
        "Facilities count only venues where the field is filled in. Blank fields are unknown, not 'no'.",
      ],
    },
  ],
};
