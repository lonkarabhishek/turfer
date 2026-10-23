import type { Post } from "../types";

// Data post: turfs listed in and around Hinjewadi, Pune.
// Source: TapTurf database (public.turfs), queried read-only on 23 Oct 2026.
// Scope: active Pune listings whose area or address places them in Hinjewadi
// (Phases 1 to 3), Maan or Marunji. 15 venues. Prices and hours are as listed
// (mostly from Google Maps and booking-app listings), not owner-verified.

export const post: Post = {
  slug: "turfs-in-hinjewadi-pune",
  title: "Turfs in Hinjewadi, Pune: 15 Listed, Prices and Late Hours",
  description:
    "TapTurf data, 23 Oct 2026: 15 turfs in and around Hinjewadi, Pune. Where they are by phase, what an hour costs, which open 24 hours, and what to check first.",
  hook: "15 turfs, 9 listing 24-hour hours, and a ₹1,000 typical evening rate. Here is Hinjewadi by phase, with the data's limits.",
  category: "Pune",
  city: "pune",
  readMinutes: 6,
  publishedAt: "2026-10-23",
  coverEmoji: "🏏",
  heroImage: {
    url: "/blog/art/turfs-in-hinjewadi-pune.svg",
    og: "https://www.tapturf.in/blog/art/turfs-in-hinjewadi-pune.png",
    alt: "Summary card for turfs in Hinjewadi, Pune: 15 listed, 9 listing 24-hour hours, a ₹1,000 typical weekday evening rate, and a bar chart of venues by phase",
  },
  keywords: [
    "turf in hinjewadi",
    "turfs in hinjewadi pune",
    "box cricket hinjewadi",
    "football turf hinjewadi",
    "turf near hinjewadi phase 1",
    "24 hour turf hinjewadi",
    "turf price hinjewadi",
    "turf in hinjawadi",
  ],
  cta: { href: "/pune/box-cricket", label: "See box cricket turfs in Pune" },
  blocks: [
    {
      type: "p",
      text: "As of 23 October 2026, TapTurf lists 15 active turfs in and around Hinjewadi, across Phases 1 to 3, Maan and Marunji. Box cricket and football are each offered at 13 of them, 9 list 'Open 24 hours', and where a price is listed the typical weekday evening rate is ₹1,000 an hour, the same as the Pune-wide median in our price map.",
    },
    {
      type: "callout",
      title: "Read this first",
      text: "These figures describe turfs listed on TapTurf, not every turf in Hinjewadi. Listings are compiled mainly from Google Maps and booking-app pages. Prices and hours are as listed and have not been confirmed by owners, so check the rate and the slot with the venue before you book.",
    },
    {
      type: "stat-grid",
      items: [
        { value: "15", label: "Turfs listed in and around Hinjewadi", hint: "TapTurf database, 23 Oct 2026" },
        { value: "9", label: "List 'Open 24 hours'", hint: "of 14 with listed hours" },
        { value: "₹1,000", label: "Typical weekday evening rate", hint: "median of 6 priced venues" },
        { value: "₹500", label: "Lowest listed hourly rate", hint: "weekday morning, one venue" },
      ],
    },

    { type: "h2", text: "How many turfs are there in Hinjewadi?" },
    {
      type: "p",
      text: "We counted every active Pune listing whose area or address puts it in Hinjewadi or its edges. Our data uses two spellings, Hinjewadi and Hinjawadi, and some venues list Maan or Marunji instead, so we combined them. One listing that only mentions Hinjewadi in a long list of nearby roads, but is in Rahatani, is left out. That gives 15 venues.",
    },
    {
      type: "table",
      caption: "Turfs in and around Hinjewadi by location (TapTurf database, 23 Oct 2026)",
      columns: ["Location in the address", "Turfs", "Examples"],
      rows: [
        ["Phase 1 (Laxmi Chowk, Mukai Nagar)", 5, "Reboot Sports Arena, SK Sports Club, Turf 21"],
        ["Phase 2", 1, "Turf Up - Hinjewadi"],
        ["Phase 3 and Maan", 5, "Gamesquare, Highland Multisports Turf, Sangria Box Turf"],
        ["Marunji", 2, "Shantai Club Golden Turf, Alard Sports - 4Lions"],
        ["No phase in the address", 2, "Krick-Adda, Forma Sports Avenue"],
      ],
    },
    {
      type: "p",
      text: "Box cricket and football dominate. 13 venues list box cricket and 13 list football. Infinity Cricket Ground near Phase 3 and Alard Sports in Marunji list cricket. For other sports the choice is thin: Reboot Sports Arena lists badminton and table tennis, and Amrit Sports Village in Mukai Nagar lists pickleball and cricket nets.",
    },

    { type: "h2", text: "What does a turf in Hinjewadi cost per hour?" },
    {
      type: "p",
      text: "Six of the 15 venues have a listed hourly price. Their weekday evening rates run from ₹900 to ₹1,200, and four of the six list exactly ₹1,000. The cheapest listed slot is ₹500 an hour on weekday mornings and afternoons at Krick-Adda. For a 7-a-side game, ₹1,000 split 14 ways is about ₹71 a head.",
    },
    {
      type: "table",
      caption: "Listed hourly prices, Hinjewadi turfs with a price (TapTurf database, 23 Oct 2026)",
      columns: ["Turf", "Weekday day", "Weekday evening", "Weekend evening"],
      rows: [
        ["Krick-Adda The Multisports Turf", "₹500", "₹900", "₹1,000"],
        ["Turf Up - Hinjewadi", "₹800", "₹1,000", "₹1,100"],
        ["SK Sports Club", "₹1,000", "₹1,000", "₹1,000"],
        ["Sportz Square Arena", "₹1,000", "₹1,000", "₹1,000"],
        ["Forma Sports Avenue", "₹1,000", "₹1,000", "₹1,000"],
        ["Gamesquare", "₹1,000", "₹1,200", "₹1,200"],
      ],
    },
    {
      type: "p",
      text: "Only two of the six list a different weekend rate, so for most of them the day you play matters less than the time. Turf Up's listed rate steps up from ₹800 to ₹1,000 at 6 pm on weekdays. Six venues is a small sample, so treat the median as a guide rather than a market rate. For how Hinjewadi compares with the rest of the country, see our India turf price map.",
    },
    {
      type: "cta",
      text: "Listed hourly prices across 14 Indian cities.",
      href: "/blog/india-turf-price-map-2026",
      label: "Read: India's turf price map",
    },

    { type: "h2", text: "Which Hinjewadi turfs are open late or 24 hours?" },
    {
      type: "p",
      text: "Hours are listed for 14 of the 15 venues. Nine list 'Open 24 hours' every day, and three more (Forma Sports Avenue, Amrit Sports Village and Shantai Club Golden Turf) list closing at midnight. That leaves Sangria Box Turf, listed until 10 pm, and Infinity Cricket Ground, listed from 7 am to 5 pm. For a city-wide view, our late-night turfs post covers Pune and Nashik.",
    },
    {
      type: "cta",
      text: "Which Pune and Nashik turfs stay open past midnight.",
      href: "/blog/late-night-turfs-pune-nashik",
      label: "Read: late-night turfs in Pune and Nashik",
    },
    {
      type: "turf",
      id: "reboot-sports-arena-hinjewadi",
      name: "Reboot Sports Arena",
      area: "Laxmi Chowk, Hinjewadi, Pune",
      rating: 4.1,
      reviews: 1442,
      note: "The most-reviewed venue in this list. Listed as open 24 hours. Box cricket, football, badminton and table tennis. No price listed.",
    },
    {
      type: "turf",
      id: "turf-up-hinjewadi",
      name: "Turf Up - Hinjewadi",
      area: "Phase 2, Hinjewadi, Pune",
      rating: 4.47,
      reviews: 789,
      note: "Listed as open 24 hours, with two grounds. 6-a-side football and box cricket. Listed ₹800 an hour on weekdays, ₹1,000 from 6 pm.",
    },
    {
      type: "turf",
      id: "krick-adda-the-multisports-turf-hinjewadi",
      name: "Krick-Adda The Multisports Turf",
      area: "Hinjewadi, Pune",
      rating: 4.2,
      reviews: 55,
      note: "Listed as open 24 hours. The lowest listed rate here, ₹500 an hour on weekday mornings and afternoons.",
    },
    {
      type: "turf",
      id: "gamesquare-hinjewadi",
      name: "Gamesquare",
      area: "Phase 3, Hinjewadi, Pune",
      rating: 4.9,
      reviews: 14,
      note: "Listed as open 24 hours and covered. Box cricket and football. Listed ₹1,000 an hour by day, ₹1,200 in the evening.",
    },
    {
      type: "cta",
      text: "Every listed Pune football turf, with hours, photos and ratings.",
      href: "/pune/football",
      label: "Football turfs in Pune",
    },

    { type: "h2", text: "What facilities do Hinjewadi turfs list?" },
    {
      type: "p",
      text: "Parking is listed at 12 of the 15 venues and washrooms at 9. Changing rooms are split: 5 venues list one and 5 say they do not, with the rest unknown. Floodlights are marked at 8 venues and the field is blank for the others. Blank does not mean missing, it means we do not have the detail yet, so ask the venue or check its page.",
    },

    { type: "h2", text: "What should you check before booking in Hinjewadi?" },
    {
      type: "ol",
      items: [
        "Confirm the exact slot and rate. Listed prices are not owner-confirmed, and half of the priced venues here list a higher evening rate.",
        "Ask which phase. Venues here are spread across Phases 1 to 3, Maan and Marunji, so check the map pin, not just the word Hinjewadi.",
        "For 24-hour turfs, ask whether a very late or early slot needs advance booking and whether all floodlights stay on.",
        "Check the format. Turf Up, for example, lists 6-a-side football, so make sure the ground suits your squad size.",
        "Ask about a changing room if you are coming straight from the office. Only 5 venues here list one.",
      ],
    },
    {
      type: "p",
      text: "Splitting the bill fairly is easier if you agree before the game. Our guide to splitting turf costs with your squad has a simple method.",
    },
    {
      type: "cta",
      text: "How to split the bill without the follow-up messages.",
      href: "/blog/split-turf-costs-with-squad",
      label: "Read: split turf costs with your squad",
    },

    {
      type: "faq",
      items: [
        {
          q: "How many turfs are there in Hinjewadi?",
          a: "TapTurf lists 15 active turfs in and around Hinjewadi, Pune, as of 23 October 2026, counting Phases 1 to 3, Maan and Marunji. This covers turfs listed on TapTurf, not necessarily every turf in the area.",
        },
        {
          q: "What is the price of a turf in Hinjewadi per hour?",
          a: "Among the six Hinjewadi turfs with a listed price, weekday evening rates range from ₹900 to ₹1,200, and ₹1,000 is the most common. The lowest listed slot is ₹500 an hour on weekday mornings at Krick-Adda. Confirm current rates with the venue.",
        },
        {
          q: "Are there 24-hour turfs in Hinjewadi?",
          a: "Yes, on listed hours. 9 of the 14 Hinjewadi turfs with listed hours say 'Open 24 hours', including Reboot Sports Arena, Turf Up and Gamesquare. Message the venue before a very late slot.",
        },
        {
          q: "Can I play box cricket in Hinjewadi?",
          a: "Yes. 13 of the 15 listed venues offer box cricket, in Phase 1, Phase 2, Phase 3, Maan and Marunji.",
        },
        {
          q: "Is there pickleball or badminton in Hinjewadi?",
          a: "Options are limited on TapTurf's listings. Amrit Sports Village in Mukai Nagar lists pickleball, and Reboot Sports Arena lists badminton and table tennis.",
        },
      ],
    },

    { type: "h2", text: "About this data" },
    {
      type: "ul",
      items: [
        "Source: TapTurf database, 23 October 2026 (queried the same day, read-only).",
        "Scope: 15 active Pune listings whose area or address places them in Hinjewadi (either spelling), Maan or Marunji. One Rahatani listing that names Hinjewadi only among nearby roads is excluded.",
        "Prices: 6 venues have a listed hourly price. 'Weekday day' is the listed morning or afternoon rate. Prices are compiled from public listings and booking-app pages and are not owner-confirmed.",
        "Hours: listed for 14 venues, mainly from Google Maps. Not confirmed by owners.",
        "Ratings and review counts are as shown on TapTurf on 23 October 2026.",
        "Facilities count only venues where the field is filled in. Blank fields are unknown, not 'no'.",
        "The Pune-wide ₹1,000 median comes from our India turf price map (172 priced Pune venues, 23 October 2026).",
      ],
    },
  ],
};
