import type { Post } from "../types";

// Data post: turfs listed in Kharadi, Pune.
// Source: TapTurf database (public.turfs), queried read-only on 31 Oct 2026.
// Scope: active Pune listings whose area is Kharadi (9 venues). One more
// listing, Sportygen Sports Club Kharadi, is filed under Wagholi with an
// Upper Kharadi Main Road address; it is mentioned in the text but not
// counted. Hotfut Kharadi lists ₹200 for every weekday slot with no price
// unit, which looks like it may be a per-person rate (said so in the text).
// Prices and hours are as listed (mostly from Google Maps and other public
// listings), not owner-verified.

export const post: Post = {
  slug: "turfs-in-kharadi-pune",
  title: "Turfs in Kharadi, Pune: 9 Listed, Prices and Hours",
  description:
    "TapTurf data, 31 Oct 2026: 9 turfs in Kharadi, Pune. What an hour costs, which venues are open 24 hours, cheaper afternoons and what to check.",
  hook: "9 turfs, a ₹1,200 typical weekday evening rate, and 4 venues that list 24 hours. Here is Kharadi venue by venue, with the data's limits.",
  category: "Pune",
  city: "pune",
  readMinutes: 6,
  publishedAt: "2026-10-31",
  coverEmoji: "⚽",
  heroImage: {
    url: "/blog/art/turfs-in-kharadi-pune.svg",
    og: "https://www.tapturf.in/blog/art/turfs-in-kharadi-pune.png",
    alt: "Summary card for turfs in Kharadi, Pune: 9 listed, a ₹1,200 typical weekday evening rate, ₹1,500 highest listed hour, 7 open to midnight or later, and a bar chart of weekday evening prices by venue",
  },
  keywords: [
    "turf in kharadi",
    "turfs in kharadi pune",
    "box cricket kharadi",
    "football turf kharadi",
    "turf price kharadi",
    "24 hour turf kharadi",
    "turf up kharadi",
    "pickleball kharadi",
  ],
  cta: { href: "/pune/box-cricket", label: "See box cricket turfs in Pune" },
  blocks: [
    {
      type: "p",
      text: "As of 31 October 2026, TapTurf lists 9 active turfs in Kharadi, Pune. Eight offer box cricket and eight offer football. Where a price is listed, the typical weekday evening rate is ₹1,200 an hour, and four venues list being open 24 hours. Across all listed slots, Kharadi's median of ₹1,150 sits above Pune's ₹1,000, so on listed prices Kharadi is one of the pricier parts of the city.",
    },
    {
      type: "callout",
      title: "Read this first",
      text: "These figures describe turfs listed on TapTurf, not every turf in Kharadi. Listings are compiled from Google Maps and other public sources. Prices and hours are as listed and have not been confirmed by owners, so check the rate and the slot with the venue before you book.",
    },
    {
      type: "stat-grid",
      items: [
        { value: "9", label: "Turfs listed in Kharadi", hint: "TapTurf database, 31 Oct 2026" },
        { value: "₹1,200", label: "Typical weekday evening rate", hint: "median of 7 priced venues" },
        { value: "₹1,500", label: "Highest listed hourly rate", hint: "2 venues list it" },
        { value: "4", label: "Open 24 hours", hint: "7 open to midnight or later" },
      ],
    },

    { type: "h2", text: "How many turfs are there in Kharadi?" },
    {
      type: "p",
      text: "We counted every active Pune listing whose area is Kharadi, which gives 9 venues. One more listing uses Kharadi in its name: Sportygen Sports Club Kharadi is filed under Wagholi and its address is on Upper Kharadi Main Road, so we mention it below but leave it out of the counts. Several venues sit close together. Turf Up and Playshire Sports Club both give addresses behind or beside Podar School near the Jio-bp station, and LSBI turf and Sportagon DPES Turf are both in Vitthal Nagar.",
    },
    {
      type: "table",
      caption: "Turfs in Kharadi at a glance (TapTurf database, 31 Oct 2026)",
      columns: ["Turf", "Where in Kharadi", "Listed hours"],
      rows: [
        ["Turf Up - Kharadi", "Ubale Nagar, behind Podar International School", "24 hours"],
        ["Playshire Sports Club", "Beside Podar School, near Jio-bp Pulse", "24 hours"],
        ["Sportygen x Arya Sports Hub", "Grant Road, Ubale Nagar, near Phoenix School", "24 hours"],
        ["LSBI turf", "Vitthal Nagar, next to Eon Waterfront", "24 hours"],
        ["Sportagon DPES Turf", "Vitthal Nagar, Dhole Patil Education Society", "6 pm to 6 am on weekdays, 24 hours on weekends"],
        ["Arya Sports Club", "Rakshak Nagar", "6 am to midnight"],
        ["Hotfut Kharadi", "Off Gera Commerzone IT Park Road", "6 to 8 am and 4 pm to midnight on weekdays, see below"],
        ["Prime Sports Turf cricket", "Tukaram Nagar", "5:30 am to 11:30 pm"],
        ["Sportsage Turf", "Nagar Road, opposite the old toll plaza", "11 am to 11 pm"],
      ],
    },
    {
      type: "p",
      text: "Box cricket and football are each listed at eight venues. Sportsage Turf is the exception: it lists cricket, badminton, volleyball and tennis rather than box cricket or football, on two 7-a-side grounds. Badminton is listed at five venues (Arya Sports Club, Hotfut Kharadi, Playshire Sports Club, Sportsage Turf and Sportygen x Arya Sports Hub). Turf Up lists four 6-a-side grounds, the most in Kharadi.",
    },

    { type: "h2", text: "What does a turf in Kharadi cost per hour?" },
    {
      type: "p",
      text: "Seven of the 9 venues have a listed hourly price, and Arya Sports Club and Prime Sports Turf have none. Leaving aside Hotfut Kharadi (see the note below), weekday evening rates run from ₹1,000 to ₹1,500, with a median of ₹1,200. For a 7-a-side game, ₹1,200 split 14 ways is about ₹86 a head. Weekend evenings have a ₹1,350 median across the six venues that list one. Taking every listed rate together (morning, afternoon and evening, weekday and weekend), the Kharadi median is ₹1,150 an hour, against ₹1,000 for Pune as a whole in our price map, ₹1,000 in Wakad and ₹800 in Tathawade.",
    },
    {
      type: "table",
      caption: "Listed hourly prices, Kharadi turfs with a price (TapTurf database, 31 Oct 2026)",
      columns: ["Turf", "Weekday morning", "Weekday afternoon", "Weekday evening", "Weekend evening"],
      rows: [
        ["Hotfut Kharadi", "₹200", "₹200", "₹200", "Not listed"],
        ["LSBI turf", "₹800", "₹500", "₹1,000", "₹1,200"],
        ["Sportygen x Arya Sports Hub", "₹1,000", "₹600", "₹1,000", "₹1,000"],
        ["Turf Up - Kharadi", "₹1,000", "₹1,000", "₹1,200", "₹1,300"],
        ["Sportsage Turf", "₹1,000", "₹800", "₹1,200", "₹1,500"],
        ["Sportagon DPES Turf", "₹1,400", "Not listed", "₹1,400", "₹1,400"],
        ["Playshire Sports Club", "₹1,300", "₹1,300", "₹1,500", "₹1,500"],
      ],
    },
    {
      type: "p",
      text: "Two notes on the table. Hotfut Kharadi lists ₹200 for every weekday slot with no unit, which is far below anything else in Kharadi, so it may be a per-person rate. Ask before you plan around it. It also has only 25 reviews. Sportagon DPES Turf lists no weekday afternoon price because, on its listed hours, it is closed from 6 am to 6 pm on weekdays.",
    },
    {
      type: "cta",
      text: "Listed hourly prices across 14 Indian cities.",
      href: "/blog/india-turf-price-map-2026",
      label: "Read: India's turf price map",
    },

    { type: "h2", text: "Is it cheaper to play in the afternoon in Kharadi?" },
    {
      type: "p",
      text: "At most priced venues, yes. Five of the seven list a lower weekday afternoon rate than their evening rate: LSBI turf (₹500 against ₹1,000), Sportygen x Arya Sports Hub (₹600 against ₹1,000), Sportsage Turf (₹800 against ₹1,200), Turf Up (₹1,000 against ₹1,200) and Playshire Sports Club (₹1,300 against ₹1,500). The biggest gaps are at LSBI turf and Sportygen x Arya, where an afternoon hour costs about half or a little over half the evening rate. Hotfut lists one rate for every weekday slot, and Sportagon has no afternoon slot on weekdays.",
    },
    {
      type: "cta",
      text: "Peak and off-peak slots, and how to pick one.",
      href: "/blog/best-time-to-book-a-turf",
      label: "Read: the best time to book a turf",
    },

    { type: "h2", text: "Which Kharadi turfs are open late or 24 hours?" },
    {
      type: "p",
      text: "Hours are listed for all 9 venues, and seven stay open to midnight or later. Turf Up, Playshire Sports Club, Sportygen x Arya Sports Hub and LSBI turf list 24 hours every day. Sportagon DPES Turf is a night venue on weekdays, open 6 pm to 6 am, and lists 24 hours on Saturdays and Sundays. Arya Sports Club lists 6 am to midnight. Hotfut Kharadi lists two windows on weekdays (6 to 8 am and 4 pm to midnight), and its weekend hours read 6 am to 12 pm, which could mean noon or midnight, so ask. Prime Sports Turf closes at 11:30 pm and Sportsage Turf at 11 pm.",
    },
    {
      type: "cta",
      text: "Which Pune and Nashik turfs stay open past midnight.",
      href: "/blog/late-night-turfs-pune-nashik",
      label: "Read: late-night turfs in Pune and Nashik",
    },
    {
      type: "turf",
      id: "turf-up-kharadi",
      name: "Turf Up - Kharadi",
      area: "Ubale Nagar, Kharadi, Pune",
      rating: 3.8,
      reviews: 1915,
      note: "By far the most reviewed venue in Kharadi, with 1,915 reviews. Football and box cricket on four 6-a-side grounds, open 24 hours. ₹1,000 an hour by day and ₹1,200 on weekday evenings. Lists floodlights, a changing room, a cafeteria and drinking water.",
    },
    {
      type: "turf",
      id: "sportygen-x-arya-sports-hub-kharadi",
      name: "Sportygen x Arya Sports Hub",
      area: "Grant Road, Ubale Nagar, Kharadi, Pune",
      rating: 4.2,
      reviews: 49,
      note: "Box cricket, football and badminton, open 24 hours. ₹600 an hour on weekday afternoons and ₹1,000 at every other listed slot, including all weekend slots. Lists floodlights and parking.",
    },
    {
      type: "turf",
      id: "sportagon-dpes-turf-kharadi",
      name: "Sportagon DPES Turf",
      area: "Vitthal Nagar, Kharadi, Pune",
      rating: 4.9,
      reviews: 37,
      note: "Box cricket and football on the Dhole Patil Education Society grounds. Weekdays 6 pm to 6 am, 24 hours on weekends. ₹1,400 an hour on weekday evenings and ₹1,200 on weekend mornings and afternoons. Lists floodlights, parking and a washroom.",
    },
    {
      type: "turf",
      id: "sportsage-turf-kharadi",
      name: "Sportsage Turf",
      area: "Nagar Road, Kharadi, Pune",
      rating: 4.4,
      reviews: 115,
      note: "Cricket, badminton, volleyball and tennis on two 7-a-side grounds near Mahalakshmi Lawns, 11 am to 11 pm. ₹800 an hour on weekday afternoons and ₹1,200 in the evening. One of two Kharadi venues that list a changing room.",
    },

    { type: "h2", text: "Can you play pickleball or padel in Kharadi?" },
    {
      type: "p",
      text: "Yes, at one listed venue: Playshire Sports Club, beside Podar School, lists pickleball and padel alongside box cricket, football, badminton, snooker and pool, and is open 24 hours. It is also the most expensive priced venue here at ₹1,500 on evenings, and its 4.9 rating comes from 235 reviews. Just outside Kharadi, Sportygen Sports Club Kharadi on Upper Kharadi Main Road (filed under Wagholi) lists pickleball and table tennis, from 6 am to 2 am. Ask whether paddles and balls are provided before you go.",
    },
    {
      type: "turf",
      id: "playshire-sports-club-kharadi",
      name: "Playshire Sports Club",
      area: "Beside Podar School, Kharadi, Pune",
      rating: 4.9,
      reviews: 235,
      note: "Box cricket, football, badminton, padel and pickleball, open 24 hours. ₹1,300 an hour by day and ₹1,500 in the evening, every day of the week. Lists floodlights.",
    },
    {
      type: "cta",
      text: "New to the game? Rules, kit and where to start in Pune.",
      href: "/blog/pickleball-pune-beginners-guide",
      label: "Read: pickleball in Pune for beginners",
    },

    { type: "h2", text: "What do Kharadi turf ratings tell you?" },
    {
      type: "p",
      text: "Ratings here vary more than in most areas we have covered. Playshire Sports Club and Sportagon DPES Turf both show 4.9, and Hotfut Kharadi 4.8, though Sportagon and Hotfut have fewer than 40 reviews each. Turf Up and Arya Sports Club both sit at 3.8, from 1,915 and 515 reviews. LSBI turf shows 2.3 from 79 reviews, the lowest in Kharadi on TapTurf, even though it has the cheapest listed afternoon hour. A low price with a low rating is worth a look at recent reviews before you book.",
    },

    { type: "h2", text: "What facilities do Kharadi turfs list?" },
    {
      type: "p",
      text: "Parking is listed at eight venues, and for Playshire Sports Club we do not have the detail. Washrooms are listed at six, and Hotfut Kharadi says it has none. Changing rooms are listed only at Turf Up and Sportsage Turf, Hotfut says it has none, and the rest are unknown. Floodlights are marked at five venues (Playshire, Prime Sports Turf, Sportagon, Sportygen x Arya and Turf Up), and a cafeteria at two (Turf Up and Sportsage). Blank does not mean missing, it means we do not have the detail yet.",
    },

    { type: "h2", text: "What should you check before booking in Kharadi?" },
    {
      type: "ol",
      items: [
        "Confirm the exact slot and rate. Listed prices are not owner-confirmed, and at LSBI turf the rate doubles from ₹500 in the afternoon to ₹1,000 in the evening.",
        "If you see Hotfut Kharadi's ₹200, ask whether it is per hour or per person.",
        "Book a weekday afternoon if you can. Five of the seven priced venues list a cheaper afternoon slot.",
        "Check the hours for your day. Sportagon DPES Turf is closed on weekday daytimes, and Sportsage Turf opens at 11 am.",
        "Read recent reviews where the rating is low. LSBI turf shows 2.3, and Turf Up and Arya Sports Club 3.8.",
      ],
    },
    {
      type: "p",
      text: "Agree on how to split the bill before the game. For other parts of Pune, our area guides to Wakad, Hinjewadi, Kothrud, Undri and Tathawade use the same data and method.",
    },
    {
      type: "cta",
      text: "Split the turf fee fairly, including no-shows.",
      href: "/blog/split-turf-costs-with-squad",
      label: "Read: how to split turf costs with your squad",
    },
    {
      type: "cta",
      text: "10 turfs in Undri, where daytime slots are cheaper at 7 of 8 priced venues.",
      href: "/blog/turfs-in-undri-pune",
      label: "Read: turfs in Undri, Pune",
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
          q: "How many turfs are there in Kharadi?",
          a: "TapTurf lists 9 active turfs in Kharadi, Pune, as of 31 October 2026. This covers turfs listed on TapTurf, not necessarily every turf in the area.",
        },
        {
          q: "What is the price of a turf in Kharadi per hour?",
          a: "Among Kharadi turfs with a listed hourly price, weekday evening rates range from ₹1,000 to ₹1,500, with a median of ₹1,200. Hotfut Kharadi lists ₹200, which may be per person. Confirm current rates with the venue.",
        },
        {
          q: "Is there a 24-hour turf in Kharadi?",
          a: "Four list 24 hours every day: Turf Up, Playshire Sports Club, Sportygen x Arya Sports Hub and LSBI turf. Sportagon DPES Turf lists 24 hours on weekends and 6 pm to 6 am on weekdays.",
        },
        {
          q: "Is it cheaper to book a Kharadi turf in the afternoon?",
          a: "At five of the seven priced venues, yes. The biggest gaps are LSBI turf (₹500 against ₹1,000 in the evening) and Sportygen x Arya Sports Hub (₹600 against ₹1,000).",
        },
        {
          q: "Is there a pickleball court in Kharadi?",
          a: "Playshire Sports Club in Kharadi lists pickleball and padel, open 24 hours. Sportygen Sports Club Kharadi on Upper Kharadi Main Road, filed under Wagholi, also lists pickleball.",
        },
      ],
    },

    { type: "h2", text: "About this data" },
    {
      type: "ul",
      items: [
        "Source: TapTurf database, 31 October 2026 (queried the same day, read-only).",
        "Scope: the 9 active Pune listings with Kharadi as the area. Sportygen Sports Club Kharadi is filed under Wagholi and is mentioned but not counted.",
        "Prices: 7 venues have a listed hourly price. Each can list up to six rates (morning, afternoon and evening, weekday and weekend). Prices are compiled from public sources and are not owner-confirmed.",
        "The weekday evening median of ₹1,200 is the same with or without Hotfut Kharadi's ₹200. The all-rates median of ₹1,150 uses all 38 listed rates across the 7 venues, the same method as our India turf price map, whose Pune-wide median is ₹1,000 (172 priced Pune venues, 23 October 2026).",
        "Hours: listed for all 9 venues, mainly from Google Maps. Not confirmed by owners.",
        "Ratings and review counts are as shown on TapTurf on 31 October 2026.",
        "Facilities count only venues where the field is filled in. Blank fields are unknown, not 'no'.",
      ],
    },
  ],
};
