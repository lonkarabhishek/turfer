import type { Post } from "../types";

// Data post: turfs listed in Hadapsar, Pune.
// Source: TapTurf database (public.turfs), queried read-only on 6 Nov 2026.
// Scope: active Pune listings whose area is Hadapsar (9 venues). One more
// listing, Morya 360°Turf, is filed under Saswad with a Hadapsar Saswad Road
// address; it is mentioned in the text but not counted.
// Prices and hours are as listed (mostly from Google Maps and other public
// listings), not owner-verified.

export const post: Post = {
  slug: "turfs-in-hadapsar-pune",
  title: "Turfs in Hadapsar, Pune: 9 Listed, Prices and Hours",
  description:
    "TapTurf data, 6 Nov 2026: 9 turfs in Hadapsar, Pune. What an hour costs, which venues are open 24 hours, cheaper afternoons and what to check.",
  hook: "9 turfs, a ₹1,000 typical weekday evening rate, and 7 venues that list 24 hours. Here is Hadapsar venue by venue, with the data's limits.",
  category: "Pune",
  city: "pune",
  readMinutes: 6,
  publishedAt: "2026-11-06",
  coverEmoji: "⚽",
  heroImage: {
    url: "/blog/art/turfs-in-hadapsar-pune.svg",
    og: "https://www.tapturf.in/blog/art/turfs-in-hadapsar-pune.png",
    alt: "Summary card for turfs in Hadapsar, Pune: 9 listed, a ₹1,000 typical weekday evening rate, ₹1,150 highest weekday evening, 7 open 24 hours, and a bar chart of weekday evening prices by venue",
  },
  keywords: [
    "turf in hadapsar",
    "turfs in hadapsar pune",
    "box cricket hadapsar",
    "football turf hadapsar",
    "turf price hadapsar",
    "24 hour turf hadapsar",
    "turf hadapsar pune",
    "amanora turf",
  ],
  cta: { href: "/pune/box-cricket", label: "See box cricket turfs in Pune" },
  blocks: [
    {
      type: "p",
      text: "As of 6 November 2026, TapTurf lists 9 active turfs in Hadapsar, Pune. All 9 offer football and 7 offer box cricket. Where a price is listed, the typical weekday evening rate is ₹1,000 an hour, matching Pune's city-wide median, and 7 venues list being open 24 hours. Weekday afternoon rates have a median of ₹800, so daytime slots are usually cheaper where a price is listed.",
    },
    {
      type: "callout",
      title: "Read this first",
      text: "These figures describe turfs listed on TapTurf, not every turf in Hadapsar. Listings are compiled from Google Maps and other public sources. Prices and hours are as listed and have not been confirmed by owners, so check the rate and the slot with the venue before you book.",
    },
    {
      type: "stat-grid",
      items: [
        { value: "9", label: "Turfs listed in Hadapsar", hint: "TapTurf database, 6 Nov 2026" },
        { value: "₹1,000", label: "Typical weekday evening rate", hint: "median of 6 priced venues" },
        { value: "₹1,150", label: "Highest weekday evening rate", hint: "Turf 9 Arena" },
        { value: "7", label: "Open 24 hours", hint: "of 9 listed venues" },
      ],
    },

    { type: "h2", text: "How many turfs are there in Hadapsar?" },
    {
      type: "p",
      text: "We counted every active Pune listing whose area is Hadapsar, which gives 9 venues. One more listing sits on Hadapsar Saswad Road: Morya 360°Turf is filed under Saswad, so we mention it below but leave it out of the counts. Several venues cluster around Amanora Park Town and DP Road (Amanora Sports Arena, Ashes Club, Champions Field), and another cluster sits on Sasane Nagar Road (Pandhare Sports Field and Turf 9 Arena).",
    },
    {
      type: "table",
      caption: "Turfs in Hadapsar at a glance (TapTurf database, 6 Nov 2026)",
      columns: ["Turf", "Where in Hadapsar", "Listed hours"],
      rows: [
        ["Amanora Sports Arena", "Amanora Park Town", "6 am to 9:30 pm daily"],
        ["Ashes Club", "DP Rd, Amanora Park Town", "24 hours"],
        ["Champions Field Hadapsar", "DP Road, Bhagirathi Nagar", "24 hours"],
        ["FORTUNE SPORTS CLUB", "Opposite Orchid School, Gopal Patti", "24 hours"],
        ["Kanha Kurukshetra cricket Turf & Football Academy", "Handewadi Rd, near Suyash Nisarg / JSPM", "4 am to 12 am daily"],
        ["Offside turf club", "Tukai Darshan Rd, Bhekrai Nagar", "24 hours"],
        ["Pandhare Sports Field", "Pandhare Farms, Sasane Nagar Rd", "24 hours"],
        ["The Legend's Turf", "Near Gajanan Maharaj Mandir, Kaleborate Nagar", "24 hours"],
        ["Turf 9 Arena", "Sasane Nagar Rd, Hadapsar Gaon", "24 hours"],
      ],
    },
    {
      type: "p",
      text: "Football is listed at all 9 venues. Box cricket is listed at 7; Champions Field lists cricket rather than box cricket, and Offside turf club lists football only. Badminton is listed only at Amanora Sports Arena, cricket nets at Ashes Club, table tennis at Kanha Kurukshetra, and hockey at Pandhare Sports Field. Amanora Sports Arena lists 1 ground and Champions Field lists 1 ground; the rest leave ground count blank.",
    },

    { type: "h2", text: "What does a turf in Hadapsar cost per hour?" },
    {
      type: "p",
      text: "Six of the 9 venues have a listed hourly price, and Amanora Sports Arena, Champions Field Hadapsar and Offside turf club have none. Weekday evening rates run from ₹700 to ₹1,150, with a median of ₹1,000, the same as Pune's city-wide median in our price map. For a 7-a-side game, ₹1,000 split 14 ways is about ₹71 a head. Weekend evenings have a ₹1,000 median across the six venues that list one (Fortune and Kanha at ₹800, Ashes and The Legend's at ₹1,000, Pandhare at ₹1,100, Turf 9 at ₹1,250). On listed weekday evenings, Hadapsar sits below Kharadi (₹1,200) and Wakad (₹1,100), level with Hinjewadi (₹1,000), and above Undri (₹950), Tathawade (₹900) and Wagholi (₹900).",
    },
    {
      type: "table",
      caption: "Listed hourly prices, Hadapsar turfs with a price (TapTurf database, 6 Nov 2026)",
      columns: ["Turf", "Weekday morning", "Weekday afternoon", "Weekday evening", "Weekend evening"],
      rows: [
        ["Kanha Kurukshetra", "₹500", "₹350", "₹700", "₹800"],
        ["FORTUNE SPORTS CLUB", "₹800", "₹800", "₹800", "₹800"],
        ["Ashes Club", "₹800", "₹800", "₹1,000", "₹1,000"],
        ["The Legend's Turf", "₹800", "₹800", "₹1,000", "₹1,000"],
        ["Pandhare Sports Field", "₹1,000", "₹900", "₹1,000", "₹1,100"],
        ["Turf 9 Arena", "₹1,150", "₹1,150", "₹1,150", "₹1,250"],
      ],
    },
    {
      type: "p",
      text: "Two notes on the table. FORTUNE SPORTS CLUB lists a flat ₹800 for every slot, weekday and weekend. Turf 9 Arena lists ₹1,150 for every weekday slot and ₹1,250 for every weekend slot, the highest listed rates in Hadapsar. Kanha Kurukshetra is the cheapest priced evening hour at ₹700 on weekdays, and its weekday afternoon rate of ₹350 is by far the lowest listed slot here.",
    },
    {
      type: "cta",
      text: "Listed hourly prices across 14 Indian cities.",
      href: "/blog/india-turf-price-map-2026",
      label: "Read: India's turf price map",
    },

    { type: "h2", text: "Is it cheaper to play in the afternoon in Hadapsar?" },
    {
      type: "p",
      text: "At most priced venues, yes. Four of the six list a lower weekday afternoon rate than their evening rate: Kanha Kurukshetra (₹350 against ₹700), Ashes Club (₹800 against ₹1,000), The Legend's Turf (₹800 against ₹1,000) and Pandhare Sports Field (₹900 against ₹1,000). The biggest gap is at Kanha, where an afternoon hour costs half the evening rate. FORTUNE SPORTS CLUB and Turf 9 Arena list one rate for every weekday slot, so the time of day does not change the listed price there.",
    },
    {
      type: "cta",
      text: "Peak and off-peak slots, and how to pick one.",
      href: "/blog/best-time-to-book-a-turf",
      label: "Read: the best time to book a turf",
    },

    { type: "h2", text: "Which Hadapsar turfs are open late or 24 hours?" },
    {
      type: "p",
      text: "Hours are listed for all 9 venues, and seven mark themselves as open 24 hours: Ashes Club, Champions Field Hadapsar, FORTUNE SPORTS CLUB, Offside turf club, Pandhare Sports Field, The Legend's Turf and Turf 9 Arena. Kanha Kurukshetra lists 4 am to 12 am every day, so it stays open to midnight without being 24 hours. Amanora Sports Arena is the early closer, listing 6 am to 9:30 pm daily. Just outside the Hadapsar count, Morya 360°Turf on Hadapsar Saswad Road (filed under Saswad) also lists 24 hours.",
    },
    {
      type: "cta",
      text: "Which Pune and Nashik turfs stay open past midnight.",
      href: "/blog/late-night-turfs-pune-nashik",
      label: "Read: late-night turfs in Pune and Nashik",
    },
    {
      type: "turf",
      id: "turf-9-arena-hadapsar",
      name: "Turf 9 Arena",
      area: "Sasane Nagar Rd, Hadapsar Gaon, Pune",
      rating: 4.9,
      reviews: 110,
      note: "The highest-rated Hadapsar venue on TapTurf, with 110 reviews. Box cricket and football, open 24 hours. ₹1,150 an hour on every weekday slot and ₹1,250 on every weekend slot, the highest listed rates here. Lists parking, a washroom and drinking water.",
    },
    {
      type: "turf",
      id: "kanha-kurukshetra-cricket-turf-football-academy-hadapsar",
      name: "Kanha Kurukshetra cricket Turf & Football Academy",
      area: "Handewadi Rd, near Suyash Nisarg / JSPM, Hadapsar, Pune",
      rating: 4.8,
      reviews: 71,
      note: "Box cricket, football and table tennis, 4 am to 12 am daily. The cheapest priced Hadapsar venue: ₹350 an hour on weekday afternoons and ₹700 on weekday evenings. Lists parking, a washroom, a changing room, floodlights and a cafeteria.",
    },
    {
      type: "turf",
      id: "pandhare-sports-field-hadapsar",
      name: "Pandhare Sports Field",
      area: "Pandhare Farms, Sasane Nagar Rd, Hadapsar, Pune",
      rating: 4.3,
      reviews: 248,
      note: "Box cricket, football and hockey on Pandhare Farms, open 24 hours. ₹900 an hour on weekday afternoons and ₹1,000 on weekday evenings; weekends list ₹1,100 for every slot. Lists parking, a washroom and drinking water.",
    },
    {
      type: "turf",
      id: "amanora-sports-arena-hadapsar",
      name: "Amanora Sports Arena",
      area: "Amanora Park Town, Hadapsar, Pune",
      rating: 4.4,
      reviews: 311,
      note: "Football, box cricket and badminton on 1 ground inside Amanora Park Town, 6 am to 9:30 pm. No hourly price is listed on TapTurf. Lists parking, a washroom, a changing room and floodlights. One of the most reviewed Hadapsar venues.",
    },
    {
      type: "turf",
      id: "champions-field-hadapsar",
      name: "Champions Field Hadapsar",
      area: "DP Road, Bhagirathi Nagar, Hadapsar, Pune",
      rating: 4.1,
      reviews: 362,
      note: "Football and cricket on 1 ground, open 24 hours. The most reviewed Hadapsar venue on TapTurf, with 362 reviews. No hourly price is listed. Lists parking, a washroom and a changing room.",
    },

    { type: "h2", text: "What do Hadapsar turf ratings tell you?" },
    {
      type: "p",
      text: "Ratings here run from 3.9 to 4.9. Turf 9 Arena leads at 4.9 from 110 reviews, and Kanha Kurukshetra sits at 4.8 from 71. Champions Field Hadapsar has the most reviews at 362 (rating 4.1), followed by Amanora Sports Arena at 311 (4.4) and Pandhare Sports Field at 248 (4.3). Ashes Club shows 3.9 from only 7 reviews, and The Legend's Turf 4.5 from 11, so both need a look at recent reviews before you lean on the score. Offside turf club (4.6 from 40) and FORTUNE SPORTS CLUB (4.0 from 28) sit in between.",
    },

    { type: "h2", text: "What facilities do Hadapsar turfs list?" },
    {
      type: "p",
      text: "Parking is listed at all 9 venues. Washrooms are listed at seven (Amanora, Ashes Club, Champions Field, FORTUNE SPORTS CLUB, Kanha, Pandhare and Turf 9), and for Offside turf club and The Legend's Turf we do not have the detail. Changing rooms are listed at three (Amanora, Champions Field and Kanha); the rest are unknown. Floodlights are marked at two (Amanora and Kanha), a cafeteria at two (Kanha and The Legend's Turf), and drinking water at two (Pandhare and Turf 9). Blank does not mean missing, it means we do not have the detail yet.",
    },

    { type: "h2", text: "What should you check before booking in Hadapsar?" },
    {
      type: "ol",
      items: [
        "Confirm the exact slot and rate. Listed prices are not owner-confirmed, and three venues (Amanora, Champions Field and Offside) have no listed price at all.",
        "Book a weekday afternoon if you can. Kanha Kurukshetra lists ₹350 against ₹700 in the evening, and Ashes Club and The Legend's Turf list ₹800 against ₹1,000.",
        "Check the hours for your day. Amanora Sports Arena closes at 9:30 pm, and Kanha Kurukshetra lists 4 am to 12 am rather than 24 hours.",
        "Read recent reviews where the review count is low. Ashes Club has 7 reviews and The Legend's Turf has 11.",
        "Ask about unit and format. All priced venues list per_hour, but confirm whether the rate is for the whole ground or per person.",
      ],
    },
    {
      type: "p",
      text: "Agree on how to split the bill before the game. For other parts of Pune, our area guides to Kharadi, Wakad, Hinjewadi, Undri and Tathawade use the same data and method.",
    },
    {
      type: "cta",
      text: "Split the turf fee fairly, including no-shows.",
      href: "/blog/split-turf-costs-with-squad",
      label: "Read: how to split turf costs with your squad",
    },
    {
      type: "cta",
      text: "9 turfs in Kharadi, where the typical weekday evening rate is ₹1,200.",
      href: "/blog/turfs-in-kharadi-pune",
      label: "Read: turfs in Kharadi, Pune",
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
          q: "How many turfs are there in Hadapsar?",
          a: "TapTurf lists 9 active turfs in Hadapsar, Pune, as of 6 November 2026. This covers turfs listed on TapTurf, not necessarily every turf in the area. Morya 360°Turf on Hadapsar Saswad Road is filed under Saswad and is not counted.",
        },
        {
          q: "What is the price of a turf in Hadapsar per hour?",
          a: "Among Hadapsar turfs with a listed hourly price, weekday evening rates range from ₹700 to ₹1,150, with a median of ₹1,000. Confirm current rates with the venue.",
        },
        {
          q: "Is there a 24-hour turf in Hadapsar?",
          a: "Seven list 24 hours: Ashes Club, Champions Field Hadapsar, FORTUNE SPORTS CLUB, Offside turf club, Pandhare Sports Field, The Legend's Turf and Turf 9 Arena. Kanha Kurukshetra lists 4 am to 12 am.",
        },
        {
          q: "Is it cheaper to book a Hadapsar turf in the afternoon?",
          a: "At four of the six priced venues, yes. The biggest gap is Kanha Kurukshetra (₹350 against ₹700 in the evening). Ashes Club and The Legend's Turf list ₹800 in the afternoon against ₹1,000 in the evening, and Pandhare Sports Field lists ₹900 against ₹1,000.",
        },
        {
          q: "Which Hadapsar turf has the most reviews?",
          a: "Champions Field Hadapsar has 362 reviews on TapTurf, followed by Amanora Sports Arena with 311 and Pandhare Sports Field with 248.",
        },
      ],
    },

    { type: "h2", text: "About this data" },
    {
      type: "ul",
      items: [
        "Source: TapTurf database, 6 November 2026 (queried the same day, read-only).",
        "Scope: the 9 active Pune listings with Hadapsar as the area. Morya 360°Turf is filed under Saswad and is mentioned but not counted.",
        "Prices: 6 venues have a listed hourly price. Each can list up to six rates (morning, afternoon and evening, weekday and weekend). Prices are compiled from public sources and are not owner-confirmed.",
        "The weekday evening median of ₹1,000 uses the 6 priced venues (₹700, ₹800, ₹1,000, ₹1,000, ₹1,000, ₹1,150). The weekday afternoon median of ₹800 uses the same six. The Pune-wide median of ₹1,000 comes from our India turf price map (172 priced Pune venues, 23 October 2026).",
        "Hours: listed for all 9 venues, mainly from Google Maps and opening_hours. Not confirmed by owners.",
        "Ratings and review counts are as shown on TapTurf on 6 November 2026.",
        "Facilities count only venues where the field is filled in. Blank fields are unknown, not 'no'.",
      ],
    },
  ],
};
