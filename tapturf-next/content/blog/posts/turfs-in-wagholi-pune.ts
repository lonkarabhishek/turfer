import type { Post } from "../types";

// Data post: turfs listed in Wagholi, Pune.
// Source: TapTurf database (public.turfs), queried read-only on 10 Nov 2026.
// Scope: active Pune listings whose area is Wagholi (8 venues). One more
// listing, Run 360 Turf, has no area set and a Lohegaon address on Lohagaon
// Wagholi Road; it is mentioned in the text but not counted. Sportygen Sports
// Club Kharadi is filed under Wagholi, so it is counted here (the Kharadi
// guide mentions it but leaves it out of its counts). PlayOrbit lists
// 2,500 to 3,000 an hour (per_hour), far above the other five priced venues;
// the text says so and tells readers to confirm it.
// Prices and hours are as listed (mostly from Google Maps and other public
// listings), not owner-verified.

export const post: Post = {
  slug: "turfs-in-wagholi-pune",
  title: "Turfs in Wagholi, Pune: 8 Listed, Prices and Hours",
  description:
    "TapTurf data, 10 Nov 2026: 8 turfs in Wagholi, Pune. What an hour costs, which venues are open 24 hours, cheaper afternoons and what to check.",
  hook: "8 turfs, a ₹900 typical weekday evening rate, and 3 venues that list 24 hours. Here is Wagholi venue by venue, with the data's limits.",
  category: "Pune",
  city: "pune",
  readMinutes: 6,
  publishedAt: "2026-11-10",
  coverEmoji: "⚽",
  heroImage: {
    url: "/blog/art/turfs-in-wagholi-pune.svg",
    og: "https://www.tapturf.in/blog/art/turfs-in-wagholi-pune.png",
    alt: "Summary card for turfs in Wagholi, Pune: 8 listed, a ₹900 typical weekday evening rate, ₹3,000 highest weekday evening, 3 open 24 hours, and a bar chart of weekday evening prices by venue",
  },
  keywords: [
    "turf in wagholi",
    "turfs in wagholi pune",
    "box cricket wagholi",
    "football turf wagholi",
    "turf price wagholi",
    "24 hour turf wagholi",
    "turf wagholi pune",
    "pickleball wagholi",
  ],
  cta: { href: "/pune/box-cricket", label: "See box cricket turfs in Pune" },
  blocks: [
    {
      type: "p",
      text: "As of 10 November 2026, TapTurf lists 8 active turfs in Wagholi, Pune. All 8 offer box cricket and 7 offer football. Where a price is listed, the typical weekday evening rate is ₹900 an hour, ₹100 below Pune's ₹1,000 median, and 3 venues list being open 24 hours. Six of the 8 list a price, and one of them, PlayOrbit at ₹3,000, sits far above the other five.",
    },
    {
      type: "callout",
      title: "Read this first",
      text: "These figures describe turfs listed on TapTurf, not every turf in Wagholi. Listings are compiled from Google Maps and other public sources. Prices and hours are as listed and have not been confirmed by owners, so check the rate and the slot with the venue before you book.",
    },
    {
      type: "stat-grid",
      items: [
        { value: "8", label: "Turfs listed in Wagholi", hint: "TapTurf database, 10 Nov 2026" },
        { value: "₹900", label: "Typical weekday evening rate", hint: "median of 6 priced venues" },
        { value: "₹3,000", label: "Highest weekday evening rate", hint: "PlayOrbit, far above the rest" },
        { value: "3", label: "Open 24 hours", hint: "of 8 listed venues" },
      ],
    },

    { type: "h2", text: "How many turfs are there in Wagholi?" },
    {
      type: "p",
      text: "We counted every active Pune listing whose area is Wagholi, which gives 8 venues. Two edge cases. Sportygen Sports Club Kharadi has Kharadi in its name and an address on Upper Kharadi Main Road, but it is filed under Wagholi, so it is counted here (our Kharadi guide mentions it without counting it). Run 360 Turf, on Lohagaon Wagholi Road with a Lohegaon address, has no area set, so we mention it below but leave it out of the counts. Boundary Bliss Sports and PlayOrbit both give Ubale Nagar addresses, a name that also appears in two Kharadi listings.",
    },
    {
      type: "table",
      caption: "Turfs in Wagholi at a glance (TapTurf database, 10 Nov 2026)",
      columns: ["Turf", "Where in Wagholi", "Listed hours"],
      rows: [
        ["Arya Sports Complex", "Kalubai Nagar", "24 hours"],
        ["Boundary Bliss Sports", "Ubale Nagar, behind Hotel Shivsagar", "6 am to 11:30 pm daily"],
        ["MAHI SPORT", "Raisoni College Rd, near GS fitness club", "24 hours"],
        ["PlayOrbit", "TopPlay ground, Main road, Ubale Nagar", "6 am to 11 pm daily"],
        ["Sarvadnya Sports Club/Turf", "Bakori Rd, near BJS college", "Mornings on weekdays, see below"],
        ["SATAV PATIL SPORTS", "Baif Rd, Domkhel", "5 am to 11 pm or later, varies by day"],
        ["Sportygen Sports Club Kharadi", "Upper Kharadi Main Rd", "6 am to 2 am daily"],
        ["What-A-Shot Turf Grounds", "Keshnand Road, opposite Nivaan Meadows", "24 hours"],
      ],
    },
    {
      type: "p",
      text: "Box cricket is listed at all 8 venues and football at 7; Sarvadnya Sports Club/Turf lists box cricket only. Badminton is listed at 4 venues (Arya Sports Complex, MAHI SPORT, SATAV PATIL SPORTS and Sportygen), and pickleball at 3 (Arya Sports Complex, Boundary Bliss Sports and Sportygen). Arya Sports Complex also lists futsal and cricket nets, What-A-Shot lists cricket nets, SATAV PATIL SPORTS lists swimming and Sportygen lists table tennis. What-A-Shot is the only venue that gives its ground detail: 1 ground, 7-a-side.",
    },
    {
      type: "cta",
      text: "Wagholi is one corner of the city. See every listed turf in Pune, with timings and photos.",
      href: "/pune",
      label: "All turfs in Pune",
    },

    { type: "h2", text: "What does a turf in Wagholi cost per hour?" },
    {
      type: "p",
      text: "Six of the 8 venues have a listed hourly price, and MAHI SPORT and Sarvadnya Sports Club/Turf have none. Weekday evening rates run from ₹700 to ₹3,000, with a median of ₹900. PlayOrbit's ₹3,000 is more than double the next highest, Sportygen at ₹1,300, so treat it with care; without it the range is ₹700 to ₹1,300 and the median is still ₹900. For a 7-a-side game, ₹900 split 14 ways is about ₹64 a head. The weekend evening median is also ₹900. Pune's median is ₹1,000 across 172 priced venues in our database today, so Wagholi is about ₹100 cheaper on a typical evening. Among the areas we have covered, that is below Kharadi (₹1,200), Wakad (₹1,100), Hadapsar (₹1,000) and Undri (₹950), and level with Tathawade (₹900).",
    },
    {
      type: "table",
      caption: "Listed hourly prices, Wagholi turfs with a price (TapTurf database, 10 Nov 2026)",
      columns: ["Turf", "Weekday morning", "Weekday afternoon", "Weekday evening", "Weekend evening"],
      rows: [
        ["Arya Sports Complex", "₹600", "₹600", "₹700", "₹800"],
        ["SATAV PATIL SPORTS", "₹800", "₹800", "₹800", "₹800"],
        ["Boundary Bliss Sports", "₹500", "₹500", "₹900", "₹900"],
        ["What-A-Shot Turf Grounds", "₹900", "₹900", "₹900", "₹900"],
        ["Sportygen Sports Club Kharadi", "₹1,100", "₹800", "₹1,300", "₹1,200"],
        ["PlayOrbit", "₹2,500", "₹2,500", "₹3,000", "₹3,000"],
      ],
    },
    {
      type: "p",
      text: "Three notes on the table. PlayOrbit lists ₹2,500 for mornings and afternoons and ₹3,000 for evenings, with the unit given as per hour; it has only 5 reviews, so confirm what the rate covers before you plan around it. SATAV PATIL SPORTS lists a flat ₹800 for every slot, weekday and weekend, and What-A-Shot a flat ₹900. Arya Sports Complex is the cheapest priced evening hour at ₹700 on weekdays, rising to ₹800 on weekends.",
    },
    {
      type: "cta",
      text: "Listed hourly prices across 14 Indian cities.",
      href: "/blog/india-turf-price-map-2026",
      label: "Read: India's turf price map",
    },

    { type: "h2", text: "Is it cheaper to play in the afternoon in Wagholi?" },
    {
      type: "p",
      text: "At four of the six priced venues, yes, on weekdays. Boundary Bliss Sports lists ₹500 in the afternoon against ₹900 in the evening, and Sportygen ₹800 against ₹1,300. Arya Sports Complex lists ₹600 against ₹700, and PlayOrbit ₹2,500 against ₹3,000. SATAV PATIL SPORTS and What-A-Shot list one rate for every slot, so the time of day does not change the price there. Weekends remove the afternoon discount at two venues: Arya lists ₹800 for every weekend slot, and Sportygen lists ₹1,200 for every weekend slot, so its ₹800 weekday afternoon does not carry over. Boundary Bliss keeps ₹500 for weekend mornings and afternoons.",
    },
    {
      type: "cta",
      text: "Peak and off-peak slots, and how to pick one.",
      href: "/blog/best-time-to-book-a-turf",
      label: "Read: the best time to book a turf",
    },

    { type: "h2", text: "Which Wagholi turfs are open late or 24 hours?" },
    {
      type: "p",
      text: "Hours are listed for all 8 venues, and three mark themselves as open 24 hours: Arya Sports Complex, MAHI SPORT and What-A-Shot Turf Grounds. Sportygen is the latest of the rest, listing 6 am to 2 am every day. SATAV PATIL SPORTS lists 5 am to 12 am on Mondays, 11:30 pm on Tuesdays, Fridays, Saturdays and Sundays, and 11 pm on Wednesdays and Thursdays. Boundary Bliss Sports closes at 11:30 pm and PlayOrbit at 11 pm. Sarvadnya Sports Club/Turf lists short windows rather than full days: 4:30 to 10 am on Mondays and Tuesdays, 4:30 to 10:30 am from Wednesday to Friday, and 4 am to 10 pm on Saturdays and Sundays, so call before planning an evening game there. Just outside the Wagholi count, Run 360 Turf on Lohagaon Wagholi Road (no area set, Lohegaon address) also lists 24 hours, at ₹1,400 an hour for every slot.",
    },
    {
      type: "cta",
      text: "Which Pune and Nashik turfs stay open past midnight.",
      href: "/blog/late-night-turfs-pune-nashik",
      label: "Read: late-night turfs in Pune and Nashik",
    },
    {
      type: "turf",
      id: "satav-patil-sports-wagholi",
      name: "SATAV PATIL SPORTS",
      area: "Baif Rd, Domkhel, Wagholi, Pune",
      rating: 4.7,
      reviews: 473,
      note: "The most reviewed Wagholi venue on TapTurf, with 473 reviews. Box cricket, football, badminton and swimming. A flat ₹800 an hour for every weekday and weekend slot. Lists parking, a washroom and drinking water.",
    },
    {
      type: "turf",
      id: "boundary-bliss-sports-wagholi",
      name: "Boundary Bliss Sports",
      area: "Ubale Nagar, behind Hotel Shivsagar, Wagholi, Pune",
      rating: 4.8,
      reviews: 53,
      note: "The best-rated Wagholi venue with more than 50 reviews. Box cricket, football and pickleball, 6 am to 11:30 pm. ₹500 an hour in the morning and afternoon, ₹900 in the evening, on weekdays and weekends alike. Lists parking, floodlights and a sitting area.",
    },
    {
      type: "turf",
      id: "arya-sports-complex-wagholi",
      name: "Arya Sports Complex",
      area: "Kalubai Nagar, Wagholi, Pune",
      rating: 4.2,
      reviews: 143,
      note: "Box cricket, football, futsal, badminton, pickleball and cricket nets, open 24 hours. The cheapest priced evening hour in Wagholi at ₹700 on weekdays, and ₹800 on weekends. Lists parking, floodlights, a washroom and drinking water.",
    },
    {
      type: "turf",
      id: "sportygen-sports-club-kharadi-wagholi",
      name: "Sportygen Sports Club Kharadi",
      area: "Upper Kharadi Main Rd, Wagholi, Pune",
      rating: 4.6,
      reviews: 47,
      note: "Box cricket, football, badminton, pickleball and table tennis, 6 am to 2 am daily, the latest closing time of any Wagholi venue that is not open 24 hours. ₹800 on weekday afternoons, ₹1,300 on weekday evenings and ₹1,200 on every weekend slot. Lists parking, a washroom, drinking water and a cafeteria.",
    },

    { type: "h2", text: "What do Wagholi turf ratings tell you?" },
    {
      type: "p",
      text: "Ratings here run from 4.0 to 5.0, but half the venues have too few reviews for the score to mean much. SATAV PATIL SPORTS has by far the most reviews at 473 (rating 4.7), followed by Arya Sports Complex at 143 (4.2), Boundary Bliss Sports at 53 (4.8) and Sportygen at 47 (4.6). The other four have fewer than 10 reviews each: PlayOrbit shows 5.0 from 5, MAHI SPORT 4.8 from 6, What-A-Shot 4.0 from 8 and Sarvadnya Sports Club/Turf 4.3 from 3. Read recent reviews for those four before you lean on the score.",
    },

    { type: "h2", text: "What facilities do Wagholi turfs list?" },
    {
      type: "p",
      text: "Parking is listed at 7 of the 8 venues; Sarvadnya Sports Club/Turf has no detail. Washrooms are listed at five (Arya Sports Complex, PlayOrbit, SATAV PATIL SPORTS, Sportygen and What-A-Shot) and drinking water at four (Arya, MAHI SPORT, SATAV PATIL SPORTS and Sportygen). Floodlights are marked at two (Arya and Boundary Bliss), a cafeteria at two (PlayOrbit and Sportygen), and a changing room only at What-A-Shot. Boundary Bliss lists a sitting area, and What-A-Shot marks it as not available. Blank does not mean missing, it means we do not have the detail yet.",
    },

    { type: "h2", text: "Can you play pickleball in Wagholi?" },
    {
      type: "p",
      text: "Three listed venues include pickleball: Arya Sports Complex, Boundary Bliss Sports and Sportygen Sports Club Kharadi. Arya lists it with box cricket, football, futsal, badminton and cricket nets, and is open 24 hours at ₹600 to ₹800 an hour. Ask whether paddles and balls are provided before you go.",
    },
    {
      type: "cta",
      text: "Rules, scoring and where to play in Pune.",
      href: "/blog/pickleball-pune-beginners-guide",
      label: "Read: pickleball for beginners in Pune",
    },

    { type: "h2", text: "What should you check before booking in Wagholi?" },
    {
      type: "ol",
      items: [
        "Confirm the exact slot and rate. Listed prices are not owner-confirmed, and two venues (MAHI SPORT and Sarvadnya Sports Club/Turf) have no listed price at all.",
        "Ask what PlayOrbit's ₹3,000 covers. It is more than double any other listed Wagholi rate and rests on 5 reviews.",
        "Book a weekday afternoon if you can. Boundary Bliss Sports lists ₹500 against ₹900 in the evening, and Sportygen ₹800 against ₹1,300.",
        "Check the hours for your day. Sarvadnya Sports Club/Turf lists only short morning windows on weekdays, and SATAV PATIL SPORTS, Boundary Bliss Sports and PlayOrbit close between 11 pm and midnight.",
        "Read recent reviews where the review count is low. Four venues have fewer than 10.",
        "Ask about unit and format. All priced venues list per_hour, but confirm whether the rate is for the whole ground or per person.",
      ],
    },
    {
      type: "p",
      text: "Agree on how to split the bill before the game. For other parts of Pune, our area guides to Kharadi, Hadapsar, Wakad, Hinjewadi, Undri and Tathawade use the same data and method.",
    },
    {
      type: "cta",
      text: "Split the turf fee fairly, including no-shows.",
      href: "/blog/split-turf-costs-with-squad",
      label: "Read: how to split turf costs with your squad",
    },
    {
      type: "cta",
      text: "9 turfs in Kharadi, next door, where the typical weekday evening rate is ₹1,200.",
      href: "/blog/turfs-in-kharadi-pune",
      label: "Read: turfs in Kharadi, Pune",
    },
    {
      type: "cta",
      text: "9 turfs in Hadapsar, where the typical weekday evening rate is ₹1,000 and 7 list 24 hours.",
      href: "/blog/turfs-in-hadapsar-pune",
      label: "Read: turfs in Hadapsar, Pune",
    },

    {
      type: "faq",
      items: [
        {
          q: "How many turfs are there in Wagholi?",
          a: "TapTurf lists 8 active turfs in Wagholi, Pune, as of 10 November 2026. This covers turfs listed on TapTurf, not necessarily every turf in the area. Run 360 Turf on Lohagaon Wagholi Road has no area set and is not counted.",
        },
        {
          q: "What is the price of a turf in Wagholi per hour?",
          a: "Among Wagholi turfs with a listed hourly price, weekday evening rates range from ₹700 to ₹3,000, with a median of ₹900. Five of the six priced venues list ₹1,300 or less. Confirm current rates with the venue.",
        },
        {
          q: "Is there a 24-hour turf in Wagholi?",
          a: "Three list 24 hours: Arya Sports Complex, MAHI SPORT and What-A-Shot Turf Grounds. Sportygen Sports Club Kharadi lists 6 am to 2 am every day.",
        },
        {
          q: "Is it cheaper to book a Wagholi turf in the afternoon?",
          a: "At four of the six priced venues, yes, on weekdays. The biggest gaps are Boundary Bliss Sports (₹500 against ₹900 in the evening) and Sportygen (₹800 against ₹1,300). SATAV PATIL SPORTS and What-A-Shot list one rate for every slot.",
        },
        {
          q: "Which Wagholi turf has the most reviews?",
          a: "SATAV PATIL SPORTS has 473 reviews on TapTurf, followed by Arya Sports Complex with 143 and Boundary Bliss Sports with 53.",
        },
        {
          q: "Is there a pickleball court in Wagholi?",
          a: "Three listed venues include pickleball: Arya Sports Complex, Boundary Bliss Sports and Sportygen Sports Club Kharadi. Ask the venue whether equipment is provided.",
        },
      ],
    },

    { type: "h2", text: "About this data" },
    {
      type: "ul",
      items: [
        "Source: TapTurf database, 10 November 2026 (queried the same day, read-only).",
        "Scope: the 8 active Pune listings with Wagholi as the area. Run 360 Turf has no area set and is mentioned but not counted. Sportygen Sports Club Kharadi is filed under Wagholi and is counted.",
        "Prices: 6 venues have a listed hourly price. Each can list up to six rates (morning, afternoon and evening, weekday and weekend). Prices are compiled from public sources and are not owner-confirmed.",
        "The weekday evening median of ₹900 uses the 6 priced venues (₹700, ₹800, ₹900, ₹900, ₹1,300, ₹3,000). Without PlayOrbit's ₹3,000 the median is still ₹900. The weekday afternoon median is ₹800 and the weekend evening median ₹900, from the same six. The Pune-wide median of ₹1,000 uses 172 priced Pune venues in the database on 10 November 2026.",
        "Hours: listed for all 8 venues, mainly from Google Maps and opening_hours. Not confirmed by owners.",
        "Ratings and review counts are as shown on TapTurf on 10 November 2026.",
        "Facilities count only venues where the field is filled in. Blank fields are unknown, not 'no'.",
      ],
    },
  ],
};
