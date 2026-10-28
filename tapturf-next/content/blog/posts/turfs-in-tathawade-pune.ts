import type { Post } from "../types";

// Data post: turfs listed in Tathawade, Pune.
// Source: TapTurf database (public.turfs), queried read-only on 28 Oct 2026.
// Scope: active Pune listings whose area is Tathawade (10 venues). No listing
// in another area mentions Tathawade in its name or address, so none were
// added. SP Sports Academy and Turf is listed under Tathawade but names Wakad
// in its address, so it is also in the Wakad post (said so in the text).
// Sarai Sports Academy is filed under Tathawade but its address only says
// Punawale (said so in the text).
// Prices and hours are as listed (mostly from Google Maps and other public
// listings), not owner-verified.

export const post: Post = {
  slug: "turfs-in-tathawade-pune",
  title: "Turfs in Tathawade, Pune: 10 Listed, Prices and Hours",
  description:
    "TapTurf data, 28 Oct 2026: 10 turfs in Tathawade, Pune. What an hour costs, why no venue lists over ₹1,000, cheaper afternoons, late hours and what to check.",
  hook: "10 turfs, a ₹900 typical weekday evening rate, and not one priced venue above ₹1,000 an hour. Here is Tathawade venue by venue, with the data's limits.",
  category: "Pune",
  city: "pune",
  readMinutes: 6,
  publishedAt: "2026-10-28",
  coverEmoji: "🏏",
  heroImage: {
    url: "/blog/art/turfs-in-tathawade-pune.svg",
    og: "https://www.tapturf.in/blog/art/turfs-in-tathawade-pune.png",
    alt: "Summary card for turfs in Tathawade, Pune: 10 listed, a ₹900 typical weekday evening rate, ₹1,000 highest listed hour, 4 open to midnight or later, and a bar chart of weekday evening prices by venue",
  },
  keywords: [
    "turf in tathawade",
    "turfs in tathawade pune",
    "box cricket tathawade",
    "football turf tathawade",
    "turf price tathawade",
    "turf near dange chowk",
    "turf near punawale",
    "24 hour turf tathawade",
  ],
  cta: { href: "/pune/box-cricket", label: "See box cricket turfs in Pune" },
  blocks: [
    {
      type: "p",
      text: "As of 28 October 2026, TapTurf lists 10 active turfs in Tathawade, Pune. Nine offer box cricket and six offer football. Where a price is listed, the typical weekday evening rate is ₹900 an hour, and none of the seven priced venues lists any slot above ₹1,000. Across all listed slots, Tathawade's median of ₹800 sits below Pune's ₹1,000, so on listed prices Tathawade comes in below the Pune average.",
    },
    {
      type: "callout",
      title: "Read this first",
      text: "These figures describe turfs listed on TapTurf, not every turf in Tathawade. Listings are compiled from Google Maps and other public sources. Prices and hours are as listed and have not been confirmed by owners, so check the rate and the slot with the venue before you book.",
    },
    {
      type: "stat-grid",
      items: [
        { value: "10", label: "Turfs listed in Tathawade", hint: "TapTurf database, 28 Oct 2026" },
        { value: "₹900", label: "Typical weekday evening rate", hint: "median of 7 priced venues" },
        { value: "₹1,000", label: "Highest listed hourly rate", hint: "no priced venue lists more" },
        { value: "4", label: "Open to midnight or later", hint: "1 of them lists 24 hours" },
      ],
    },

    { type: "h2", text: "How many turfs are there in Tathawade?" },
    {
      type: "p",
      text: "We counted every active Pune listing whose area is Tathawade, which gives 10 venues. No listing filed under another area mentions Tathawade in its name or address, so nothing was added from the edges. Two listings need a note. SP Sports Academy and Turf is filed under Tathawade but calls itself SP's Sports Academy Wakad in its address, so it also appears in our Wakad guide. Sarai Sports Academy is filed under Tathawade, but its address only says Punawale, so check the pin before you go.",
    },
    {
      type: "table",
      caption: "Turfs in Tathawade at a glance (TapTurf database, 28 Oct 2026)",
      columns: ["Turf", "Where in Tathawade", "Listed hours"],
      rows: [
        ["Adhiraj Sports Turf", "Ram Nagar", "24 hours"],
        ["Vedant Sports Academy", "Tathawade, no street given", "5 am to midnight"],
        ["UJ Turf", "Mumbai-Bangalore highway, near Sagar Stationary", "5 am to midnight"],
        ["SP Sports Academy and Turf", "Wakad side of Tathawade", "6 am to midnight"],
        ["Neton Sports", "Aundh-Ravet BRTS Road, behind Kohinoor Sapphire", "6 am to 11 pm"],
        ["Sahyadri Turf", "Life Republic 2, Jambe", "6 am to 11 pm"],
        ["TurfX Sports Arena", "Indira High School Road, Shiv Malhar Colony", "6 am to 11 pm"],
        ["Sarai Sports Academy", "Punawale", "6 am to 10 pm (9 am on Sundays)"],
        ["Sportscity", "Dange Chowk, The Academy School grounds", "3 pm to 10 pm on weekdays, see below"],
        ["Ace Sports Arena (GGIS Tathawade)", "GGIS campus", "6 am to 8 pm (8:30 pm Saturdays)"],
      ],
    },
    {
      type: "p",
      text: "Box cricket is listed at nine venues, and four of them (Adhiraj Sports Turf, Neton Sports, SP Sports Academy and Turf and TurfX Sports Arena) list no football. Football is listed at six. Sportscity is the odd one out: it lists cricket, cricket nets, football, basketball and pickleball, but not box cricket. Badminton is listed at Neton Sports and Ace Sports Arena, and basketball at Ace Sports Arena and Sportscity. TurfX Sports Arena also lists cricket nets, and UJ Turf lists pool and snooker alongside its turf.",
    },

    { type: "h2", text: "What does a turf in Tathawade cost per hour?" },
    {
      type: "p",
      text: "Seven of the 10 venues have a listed hourly price. Weekday evening rates run from ₹400 to ₹1,000, with a median of ₹900. For a 7-a-side game, ₹900 split 14 ways is about ₹64 a head. Weekend evenings have a ₹1,000 median across the six venues that list one. Taking every listed rate together (morning, afternoon and evening, weekday and weekend), the Tathawade median is ₹800 an hour, against ₹1,000 for Pune as a whole in our price map and in Wakad next door.",
    },
    {
      type: "table",
      caption: "Listed hourly prices, Tathawade turfs with a price (TapTurf database, 28 Oct 2026)",
      columns: ["Turf", "Weekday morning", "Weekday afternoon", "Weekday evening", "Weekend evening"],
      rows: [
        ["Ace Sports Arena (GGIS Tathawade)", "₹400", "₹400", "₹400", "Not listed"],
        ["Neton Sports", "₹600", "₹550", "₹550", "₹699"],
        ["Sarai Sports Academy", "₹900", "₹900", "₹900", "₹900"],
        ["TurfX Sports Arena", "₹700", "₹500", "₹900", "₹1,000"],
        ["Sportscity", "Not listed", "₹1,000", "₹1,000", "₹1,000"],
        ["UJ Turf", "₹800", "₹600", "₹1,000", "₹1,000"],
        ["Vedant Sports Academy", "₹750", "₹750", "₹1,000", "₹1,000"],
      ],
    },
    {
      type: "p",
      text: "Two notes on the table. Ace Sports Arena's ₹400 is the lowest listed rate in Tathawade, but it is weekdays only on our records, it closes at 8 pm, it has no rating yet, and it sits on the GGIS campus, so ask how outside bookings work before you plan around it. Neton Sports is the only venue that lists a higher weekday morning rate (₹600) than its evening rate (₹550), and its weekend rate is ₹699 for every slot. That is what the listings say, so confirm with the venue.",
    },
    {
      type: "cta",
      text: "Listed hourly prices across 14 Indian cities.",
      href: "/blog/india-turf-price-map-2026",
      label: "Read: India's turf price map",
    },

    { type: "h2", text: "Is it cheaper to play in the afternoon in Tathawade?" },
    {
      type: "p",
      text: "At some venues, yes. Three of the seven priced venues list a lower weekday afternoon rate than their evening rate: TurfX Sports Arena (₹500 against ₹900), UJ Turf (₹600 against ₹1,000) and Vedant Sports Academy (₹750 against ₹1,000). The same three also charge less on weekday mornings than in the evening. Ace Sports Arena, Sarai Sports Academy and Sportscity list one rate for every weekday slot they price. So unlike Undri, where nearly every venue is cheaper by day, in Tathawade the daytime saving depends on which venue you pick.",
    },
    {
      type: "cta",
      text: "Peak and off-peak slots, and how to pick one.",
      href: "/blog/best-time-to-book-a-turf",
      label: "Read: the best time to book a turf",
    },

    { type: "h2", text: "Which Tathawade turfs are open late or 24 hours?" },
    {
      type: "p",
      text: "Hours are listed for all 10 venues, and four stay open to midnight or later. Adhiraj Sports Turf in Ram Nagar is the only one that lists 24 hours. Vedant Sports Academy, UJ Turf and SP Sports Academy and Turf list closing at midnight, and Vedant and UJ also list opening at 5 am, the earliest in the area apart from Adhiraj. Neton Sports, Sahyadri Turf and TurfX Sports Arena close at 11 pm. Sportscity's hours are unusual: 3 pm to 10 pm on weekdays, 6 am to 10 pm on Saturdays and only 6 am to 11 am on Sundays, so do not plan a Sunday evening game there.",
    },
    {
      type: "cta",
      text: "Which Pune and Nashik turfs stay open past midnight.",
      href: "/blog/late-night-turfs-pune-nashik",
      label: "Read: late-night turfs in Pune and Nashik",
    },
    {
      type: "turf",
      id: "vedant-sports-academy-tathawade",
      name: "Vedant Sports Academy",
      area: "Tathawade, Pune",
      rating: 4.8,
      reviews: 134,
      note: "Football and box cricket on a 7-a-side ground, 5 am to midnight. ₹750 an hour by day and ₹1,000 in the evening. The only Tathawade venue that lists a changing room, plus a cafeteria, drinking water and coaching.",
    },
    {
      type: "turf",
      id: "uj-turf-tathawade",
      name: "UJ Turf",
      area: "Mumbai-Bangalore highway, Tathawade, Pune",
      rating: 4.4,
      reviews: 410,
      note: "The most reviewed venue in Tathawade. Box cricket and football, 5 am to midnight. ₹600 an hour on weekday afternoons and ₹1,000 in the evening. Lists floodlights, a cafeteria, and pool and snooker.",
    },
    {
      type: "turf",
      id: "turfx-sports-arena-tathawade",
      name: "TurfX Sports Arena",
      area: "Indira High School Road, Tathawade, Pune",
      rating: 4.5,
      reviews: 8,
      note: "Box cricket and cricket nets, 6 am to 11 pm. The only Tathawade venue marked as covered. ₹500 an hour on weekday afternoons, the cheapest priced afternoon slot here apart from Ace Sports Arena. Its 4.5 rating comes from only 8 reviews.",
    },
    {
      type: "turf",
      id: "neton-sports-tathawade",
      name: "Neton Sports",
      area: "Aundh-Ravet BRTS Road, Ram Nagar, Tathawade, Pune",
      rating: 4.6,
      reviews: 23,
      note: "Box cricket and badminton, 6 am to 11 pm. ₹550 an hour on weekday afternoons and evenings, the lowest listed evening rate among Tathawade venues with a weekend price. Lists floodlights and a washroom.",
    },

    { type: "h2", text: "Can you play pickleball or badminton in Tathawade?" },
    {
      type: "p",
      text: "Pickleball, at one listed venue: Sportscity at Dange Chowk, which also lists football, cricket nets and basketball. Given its short Sunday hours, check the pickleball slot times before you go, and ask whether paddles and balls are provided. Badminton is listed at Neton Sports on the Aundh-Ravet BRTS Road and at Ace Sports Arena on the GGIS campus.",
    },
    {
      type: "turf",
      id: "sportscity-tathawade",
      name: "Sportscity",
      area: "Dange Chowk, Ram Nagar, Tathawade, Pune",
      rating: 4.2,
      reviews: 108,
      note: "Football, cricket, cricket nets, basketball and pickleball on The Academy School grounds. ₹1,000 an hour where a price is listed. Weekday hours start at 3 pm and Sunday hours end at 11 am.",
    },
    {
      type: "cta",
      text: "New to the game? Rules, kit and where to start in Pune.",
      href: "/blog/pickleball-pune-beginners-guide",
      label: "Read: pickleball in Pune for beginners",
    },

    { type: "h2", text: "What facilities do Tathawade turfs list?" },
    {
      type: "p",
      text: "Parking is listed at eight venues, and for the other two (Adhiraj Sports Turf and SP Sports Academy and Turf) we do not have the detail. Washrooms are listed at seven, and Ace Sports Arena says it has none. Changing rooms are the gap: only Vedant Sports Academy lists one, three venues say they do not have one, and the rest are unknown. Floodlights are marked at four venues and a cafeteria at four. Sarai Sports Academy, TurfX Sports Arena and Vedant Sports Academy list coaching. Blank does not mean missing, it means we do not have the detail yet.",
    },

    { type: "h2", text: "What should you check before booking in Tathawade?" },
    {
      type: "ol",
      items: [
        "Confirm the exact slot and rate. Listed prices are not owner-confirmed, and at TurfX Sports Arena and UJ Turf the rate changes by ₹400 between afternoon and evening.",
        "Compare venues rather than waiting for an off-peak rate. Only three of the seven priced venues list a cheaper daytime slot.",
        "Check the map pin. Venues run from Ram Nagar and Dange Chowk to the highway, Life Republic and Punawale, and one listing names Wakad in its address.",
        "Check the hours for your day. Sportscity closes at 11 am on Sundays and Ace Sports Arena closes at 8 pm.",
        "If you are coming straight from work, ask about a changing room. Only one venue here lists one.",
      ],
    },
    {
      type: "p",
      text: "Agree on how to split the bill before the game. For other parts of Pune, our area guides to Wakad, Hinjewadi, Kothrud and Undri use the same data and method.",
    },
    {
      type: "cta",
      text: "12 turfs in Wakad next door, where most venues list one rate all day.",
      href: "/blog/turfs-in-wakad-pune",
      label: "Read: turfs in Wakad, Pune",
    },
    {
      type: "cta",
      text: "15 turfs across Hinjewadi Phases 1 to 3, Maan and Marunji.",
      href: "/blog/turfs-in-hinjewadi-pune",
      label: "Read: turfs in Hinjewadi, Pune",
    },
    {
      type: "cta",
      text: "10 turfs in Undri, where daytime slots are cheaper at 7 of 8 priced venues.",
      href: "/blog/turfs-in-undri-pune",
      label: "Read: turfs in Undri, Pune",
    },

    {
      type: "faq",
      items: [
        {
          q: "How many turfs are there in Tathawade?",
          a: "TapTurf lists 10 active turfs in Tathawade, Pune, as of 28 October 2026. This covers turfs listed on TapTurf, not necessarily every turf in the area.",
        },
        {
          q: "What is the price of a turf in Tathawade per hour?",
          a: "Among the 7 Tathawade turfs with a listed price, weekday evening rates range from ₹400 to ₹1,000, with a median of ₹900. No priced venue lists any slot above ₹1,000 an hour. Confirm current rates with the venue.",
        },
        {
          q: "Is there a 24-hour turf in Tathawade?",
          a: "One, on listed hours: Adhiraj Sports Turf in Ram Nagar, which lists box cricket. Vedant Sports Academy, UJ Turf and SP Sports Academy and Turf list closing at midnight. Message the venue before a very late slot.",
        },
        {
          q: "Is it cheaper to book a Tathawade turf in the afternoon?",
          a: "At three venues, yes: TurfX Sports Arena (₹500 against ₹900 in the evening), UJ Turf (₹600 against ₹1,000) and Vedant Sports Academy (₹750 against ₹1,000). Most other priced venues list one weekday rate.",
        },
        {
          q: "Is there a pickleball court in Tathawade?",
          a: "One listed venue offers pickleball: Sportscity at Dange Chowk, Tathawade. Check slot times, as its listed Sunday hours end at 11 am.",
        },
      ],
    },

    { type: "h2", text: "About this data" },
    {
      type: "ul",
      items: [
        "Source: TapTurf database, 28 October 2026 (queried the same day, read-only).",
        "Scope: the 10 active Pune listings with Tathawade as the area. No listing in another area mentions Tathawade in its name or address. SP Sports Academy and Turf names Wakad in its address and is also counted in our Wakad guide. Sarai Sports Academy's address says Punawale.",
        "Prices: 7 venues have a listed hourly price. Each can list up to six rates (morning, afternoon and evening, weekday and weekend). Prices are compiled from public sources and are not owner-confirmed.",
        "The all-rates median of ₹800 uses all 37 listed rates across the 7 venues, the same method as our India turf price map, whose Pune-wide median is ₹1,000 (172 priced Pune venues, 23 October 2026).",
        "Hours: listed for all 10 venues, mainly from Google Maps. Not confirmed by owners.",
        "Ratings and review counts are as shown on TapTurf on 28 October 2026. TurfX Sports Arena's 4.5 comes from 8 reviews and Adhiraj Sports Turf's 4.2 from 11. Ace Sports Arena has no rating yet.",
        "Facilities count only venues where the field is filled in. Blank fields are unknown, not 'no'.",
      ],
    },
  ],
};
