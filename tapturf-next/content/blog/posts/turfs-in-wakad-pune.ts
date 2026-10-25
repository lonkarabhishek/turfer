import type { Post } from "../types";

// Data post: turfs listed in Wakad, Pune.
// Source: TapTurf database (public.turfs), queried read-only on 25 Oct 2026.
// Scope: active Pune listings whose area is Wakad (11), plus SP Sports Academy
// and Turf, listed under Tathawade but named "SP's Sports Academy Wakad" in its
// address (12 venues). Kridangan Turf & Badminton mentions Wakad in its address
// but is listed in Rahatani, so it is not counted.
// Prices and hours are as listed (mostly from Google Maps and booking-app
// listings), not owner-verified.

export const post: Post = {
  slug: "turfs-in-wakad-pune",
  title: "Turfs in Wakad, Pune: 12 Listed, Prices and Hours",
  description:
    "TapTurf data, 25 Oct 2026: 12 turfs in Wakad, Pune. What an hour costs, why most rates are flat all day, the 24-hour venues, pickleball and what to check.",
  hook: "12 turfs, a ₹1,100 typical weekday evening rate, and most venues charging one flat rate all day. Here is Wakad by locality, with the data's limits.",
  category: "Pune",
  city: "pune",
  readMinutes: 6,
  publishedAt: "2026-10-25",
  coverEmoji: "⚽",
  heroImage: {
    url: "/blog/art/turfs-in-wakad-pune.svg",
    og: "https://www.tapturf.in/blog/art/turfs-in-wakad-pune.png",
    alt: "Summary card for turfs in Wakad, Pune: 12 listed, a ₹1,100 typical weekday evening rate, ₹799 lowest listed hour, 4 open to midnight or later, and a bar chart of venues by locality",
  },
  keywords: [
    "turf in wakad",
    "turfs in wakad pune",
    "football turf wakad",
    "box cricket wakad",
    "turf price wakad",
    "24 hour turf wakad",
    "pickleball wakad",
    "turf near datta mandir road wakad",
  ],
  cta: { href: "/pune/box-cricket", label: "See box cricket turfs in Pune" },
  blocks: [
    {
      type: "p",
      text: "As of 25 October 2026, TapTurf lists 12 active turfs in Wakad, Pune. Ten offer football and ten offer box cricket. Where a price is listed, the typical weekday evening rate is ₹1,100 an hour, and most Wakad venues list one flat rate for every slot, so picking the venue matters more than picking the time.",
    },
    {
      type: "callout",
      title: "Read this first",
      text: "These figures describe turfs listed on TapTurf, not every turf in Wakad. Listings are compiled mainly from Google Maps and booking-app pages. Prices and hours are as listed and have not been confirmed by owners, so check the rate and the slot with the venue before you book.",
    },
    {
      type: "stat-grid",
      items: [
        { value: "12", label: "Turfs listed in Wakad", hint: "TapTurf database, 25 Oct 2026" },
        { value: "₹1,100", label: "Typical weekday evening rate", hint: "median of 9 priced venues" },
        { value: "₹799", label: "Lowest listed hourly rate", hint: "weekday morning, Turf 10 Wakad" },
        { value: "4", label: "Open to midnight or later", hint: "2 of them list 24 hours" },
      ],
    },

    { type: "h2", text: "How many turfs are there in Wakad?" },
    {
      type: "p",
      text: "We counted every active Pune listing whose area is Wakad. That gives 11 venues. We added SP Sports Academy and Turf, which is listed under Tathawade but calls itself SP's Sports Academy Wakad in its address, for a total of 12. Kridangan Turf & Badminton mentions Wakad in its address too, but it is listed in Rahatani near Kalewadi Phata, so we left it out. Most addresses here say Pimpri-Chinchwad, because Wakad falls on that side of the city.",
    },
    {
      type: "table",
      caption: "Turfs in Wakad by locality (TapTurf database, 25 Oct 2026)",
      columns: ["Locality in the address", "Turfs", "Examples"],
      rows: [
        ["Shankar Kalat Nagar and Datta Mandir Road", 4, "Silver Sports Club Wakad, Impetus Sporting, Matchday Arena"],
        ["Kaspate Wasti and Mankar Chowk", 2, "Galaxy Arena, RannX Sports Arena"],
        ["Kaveri Nagar", 1, "Kaverinagar Football Turf"],
        ["Chilekar Nagar", 1, "Wakad Goal Arena"],
        ["Bhumkar Wasti Road", 1, "Kartik Kalate Sports Academy and Turf"],
        ["Santosh Nagar", 1, "PIFA Football Academy and Turf"],
        ["Wakad, no street given", 1, "Turf 10 Wakad"],
        ["Tathawade edge", 1, "SP Sports Academy and Turf"],
      ],
    },
    {
      type: "p",
      text: "The Shankar Kalat Nagar and Datta Mandir Road stretch is the busiest pocket: it holds the three most-reviewed venues in this list. Football is listed at 10 venues and box cricket at 10. Impetus Sporting lists two grounds, an 8-a-side football pitch and a 9-a-side cricket format. Two venues list pickleball, two list badminton, and The Ring Reachers' Sports Academy also lists basketball, volleyball and skating.",
    },

    { type: "h2", text: "What does a turf in Wakad cost per hour?" },
    {
      type: "p",
      text: "Nine of the 12 venues have a listed hourly price. Weekday evening rates run from ₹800 to ₹1,300, with a median of ₹1,100. For a 7-a-side game, ₹1,100 split 14 ways is about ₹79 a head. Weekend evenings are barely dearer, with a median of ₹1,099, because six of the nine priced venues list the same rate on weekday and weekend evenings.",
    },
    {
      type: "table",
      caption: "Listed hourly prices, Wakad turfs with a price (TapTurf database, 25 Oct 2026)",
      columns: ["Turf", "Weekday morning", "Weekday evening", "Weekend evening"],
      rows: [
        ["Turf 10 Wakad", "₹799", "₹999", "₹1,099"],
        ["Wakad Goal Arena", "₹800", "₹800", "₹1,000"],
        ["The Ring Reachers' Sports Academy", "₹800", "₹1,300", "₹1,000"],
        ["Impetus Sporting", "₹1,000", "₹1,000", "₹1,000"],
        ["Galaxy Arena", "₹1,000", "₹1,000", "₹1,000"],
        ["Matchday Arena", "₹1,000", "₹1,200", "₹1,200"],
        ["PIFA Football Academy and Turf", "₹1,100", "₹1,100", "₹1,100"],
        ["Kartik Kalate Sports Academy and Turf", "₹1,250", "₹1,250", "₹1,250"],
        ["RannX Sports Arena", "₹1,300", "₹1,300", "₹1,300"],
      ],
    },
    {
      type: "p",
      text: "Taking every listed rate together (morning, afternoon and evening, weekday and weekend), the Wakad median is ₹1,000 an hour, the same as the Pune-wide median in our price map. Compared with Kothrud, where the typical weekday evening rate is ₹1,175, Wakad evenings are a little cheaper. One listing looks odd: The Ring Reachers' Sports Academy lists ₹1,300 on weekday evenings but ₹1,000 on weekend evenings. That is what the listing says, so confirm it with the venue.",
    },
    {
      type: "cta",
      text: "Listed hourly prices across 14 Indian cities.",
      href: "/blog/india-turf-price-map-2026",
      label: "Read: India's turf price map",
    },

    { type: "h2", text: "Is it cheaper to play on weekday mornings in Wakad?" },
    {
      type: "p",
      text: "Only at a few venues. Five of the nine priced venues (Impetus Sporting, Galaxy Arena, PIFA Football Academy, Kartik Kalate Sports Academy and RannX Sports Arena) list one flat rate for every slot, so the time of day does not change the price. The savings are at three places: Turf 10 Wakad lists ₹799 on weekday mornings and afternoons against ₹1,099 at weekends, Wakad Goal Arena lists ₹800 on weekdays against ₹1,000 at weekends, and The Ring Reachers' Sports Academy lists ₹800 on weekday mornings and afternoons against ₹1,300 on weekday evenings. In Wakad, choosing the venue saves more than choosing the hour.",
    },
    {
      type: "cta",
      text: "Peak and off-peak slots, and how to pick one.",
      href: "/blog/best-time-to-book-a-turf",
      label: "Read: the best time to book a turf",
    },

    { type: "h2", text: "Which Wakad turfs are open late or 24 hours?" },
    {
      type: "p",
      text: "Hours are listed for 11 of the 12 venues. Two list 'Open 24 hours': The Ring Reachers' Sports Academy in Shankar Kalat Nagar and RannX Sports Arena at Mankar Chowk. Turf 10 Wakad and SP Sports Academy and Turf list 6 am to midnight. Most of the rest close at 11 pm, and Wakad Goal Arena lists 10 pm. For early games, Kaverinagar Football Turf lists opening at 5 am and the others mostly at 6 am. Silver Sports Club Wakad has no hours on file yet.",
    },
    {
      type: "cta",
      text: "Which Pune and Nashik turfs stay open past midnight.",
      href: "/blog/late-night-turfs-pune-nashik",
      label: "Read: late-night turfs in Pune and Nashik",
    },
    {
      type: "turf",
      id: "silver-sports-club-wakad",
      name: "Silver Sports Club Wakad",
      area: "Shankar Kalat Nagar, Wakad, Pune",
      rating: 4.2,
      reviews: 917,
      note: "The most-reviewed venue in this list. Football, box cricket and badminton. No price or hours on file yet, so call before you go.",
    },
    {
      type: "turf",
      id: "impetus-sporting-wakad",
      name: "Impetus Sporting",
      area: "Datta Mandir Road, Wakad, Pune",
      rating: 4.5,
      reviews: 772,
      note: "Two grounds: 8-a-side football and a 9-a-side cricket format. Listed at a flat ₹1,000 an hour, 6 am to 11 pm. Lists a changing room and floodlights.",
    },
    {
      type: "turf",
      id: "matchday-arena-the-game-begins-wakad",
      name: "Matchday Arena",
      area: "Datta Mandir Road, Wakad, Pune",
      rating: 4.5,
      reviews: 524,
      note: "Box cricket, football, pickleball, badminton and table tennis. Listed ₹1,000 an hour in the day and ₹1,200 in the evening, 6 am to 11 pm.",
    },
    {
      type: "turf",
      id: "turf-10-wakad",
      name: "Turf 10 Wakad",
      area: "Wakad, Pune",
      rating: 3.8,
      reviews: 113,
      note: "The lowest listed rate here, ₹799 an hour on weekday mornings and afternoons. Box cricket and football, listed 6 am to midnight.",
    },
    {
      type: "turf",
      id: "rannx-sports-arena-wakad",
      name: "RannX Sports Arena",
      area: "Mankar Chowk, Kaspate Wasti, Wakad, Pune",
      rating: 4.9,
      reviews: 30,
      note: "Listed as open 24 hours. Box cricket and pickleball at a flat ₹1,300 an hour. Lists a changing room and floodlights.",
    },

    { type: "h2", text: "Can you play pickleball in Wakad?" },
    {
      type: "p",
      text: "Yes, on TapTurf's listings. Two venues list pickleball: Matchday Arena on Datta Mandir Road and RannX Sports Arena at Mankar Chowk, which is also one of the two 24-hour venues. Ask whether the court is a dedicated pickleball court or marked on a shared surface, and whether paddles and balls are provided. For badminton, Silver Sports Club Wakad and Matchday Arena list courts.",
    },
    {
      type: "cta",
      text: "New to the game? Rules, kit and where to start in Pune.",
      href: "/blog/pickleball-pune-beginners-guide",
      label: "Read: pickleball in Pune for beginners",
    },

    { type: "h2", text: "What facilities do Wakad turfs list?" },
    {
      type: "p",
      text: "Washrooms are listed at 11 of the 12 venues and parking at 10. Changing rooms are listed at three: Impetus Sporting, Matchday Arena and RannX Sports Arena. Two venues say they do not have one, and the rest are unknown. Floodlights are marked at 7 venues and the field is blank for the others. Blank does not mean missing, it means we do not have the detail yet.",
    },

    { type: "h2", text: "What should you check before booking in Wakad?" },
    {
      type: "ol",
      items: [
        "Confirm the exact slot and rate. Listed prices are not owner-confirmed, and one listing here shows a lower weekend rate than its weekday evening rate.",
        "Ask for the locality, not just the word Wakad. Venues run from Datta Mandir Road and Kaspate Wasti to Bhumkar Wasti Road and the Tathawade side, so check the map pin before you set off in evening traffic.",
        "Check the format and the sport. Some venues are box cricket only and some are football only, so make sure the ground suits your squad.",
        "If you are coming straight from work, ask about a changing room. Only three venues here list one.",
        "Do not wait for an off-peak discount. Most Wakad venues list one rate all day, so compare venues instead.",
      ],
    },
    {
      type: "p",
      text: "Agree on how to split the bill before the game. Our guide to splitting turf costs with your squad has a simple method, and our Hinjewadi area guide covers the IT-park turfs just west of Wakad.",
    },
    {
      type: "cta",
      text: "15 turfs across Hinjewadi Phases 1 to 3, Maan and Marunji.",
      href: "/blog/turfs-in-hinjewadi-pune",
      label: "Read: turfs in Hinjewadi, Pune",
    },
    {
      type: "cta",
      text: "18 turfs in Kothrud and Karve Nagar, with cheaper afternoon slots.",
      href: "/blog/turfs-in-kothrud-pune",
      label: "Read: turfs in Kothrud, Pune",
    },

    {
      type: "faq",
      items: [
        {
          q: "How many turfs are there in Wakad?",
          a: "TapTurf lists 12 active turfs in Wakad, Pune, as of 25 October 2026. This covers turfs listed on TapTurf, not necessarily every turf in the area.",
        },
        {
          q: "What is the price of a turf in Wakad per hour?",
          a: "Among the 9 Wakad turfs with a listed price, weekday evening rates range from ₹800 to ₹1,300, with a median of ₹1,100. The lowest listed slot is ₹799 an hour on weekday mornings at Turf 10 Wakad. Confirm current rates with the venue.",
        },
        {
          q: "Are there 24-hour turfs in Wakad?",
          a: "Yes, on listed hours. The Ring Reachers' Sports Academy and RannX Sports Arena list 'Open 24 hours', and Turf 10 Wakad and SP Sports Academy and Turf list hours until midnight. Message the venue before a very late slot.",
        },
        {
          q: "Is there a pickleball court in Wakad?",
          a: "Two listed venues offer pickleball: Matchday Arena on Datta Mandir Road and RannX Sports Arena at Mankar Chowk.",
        },
        {
          q: "Is it cheaper to book a Wakad turf in the morning?",
          a: "Only at a few venues. Most priced Wakad turfs list one flat rate all day. Turf 10 Wakad, Wakad Goal Arena and The Ring Reachers' Sports Academy list lower weekday morning rates.",
        },
      ],
    },

    { type: "h2", text: "About this data" },
    {
      type: "ul",
      items: [
        "Source: TapTurf database, 25 October 2026 (queried the same day, read-only).",
        "Scope: 11 active Pune listings with Wakad as the area, plus SP Sports Academy and Turf, which is listed under Tathawade but names Wakad in its address. Kridangan Turf & Badminton is listed in Rahatani and is not counted.",
        "Prices: 9 venues have a listed hourly price. Each can list up to six rates (morning, afternoon and evening, weekday and weekend). Prices are compiled from public listings and booking-app pages and are not owner-confirmed.",
        "The all-rates median of ₹1,000 uses all 54 listed rates across the 9 venues, the same method as our India turf price map, whose Pune-wide median is ₹1,000 (172 priced Pune venues, 23 October 2026).",
        "Hours: listed for 11 of the 12 venues, mainly from Google Maps. Not confirmed by owners.",
        "Ratings and review counts are as shown on TapTurf on 25 October 2026. PIFA Football Academy and Turf has no rating on file.",
        "Facilities count only venues where the field is filled in. Blank fields are unknown, not 'no'.",
      ],
    },
  ],
};
