import type { Post } from "../types";

// Figures and venue data pulled from public.turfs on 2026-10-08.
// Every turf block links to a live TapTurf page. Nagpur venues mostly
// quote on the phone; rates appear only where a venue lists one.

export const post: Post = {
  slug: "best-box-cricket-turfs-nagpur",
  title: "Best Box Cricket Turfs in Nagpur: 12 Grounds Worth Booking in 2026",
  description:
    "The 12 best box cricket turfs in Nagpur ranked by Google rating and review count, from the CC Turf trio to Xciteplay, Run Bhumi and the Jaripatka cluster. Listed rates where venues publish them, 24-hour grounds, and what to ask before you book.",
  hook: "46 cages across 41 neighbourhoods. Nagpur rates its turfs higher than any other city we cover, and these are the reasons why.",
  category: "Best Turfs",
  city: "nagpur",
  readMinutes: 8,
  publishedAt: "2026-10-08",
  coverEmoji: "🍊",
  heroImage: {
    url: "/blog/art/box-cricket-nagpur.svg",
    og: "https://www.tapturf.in/blog/art/box-cricket-nagpur.png",
    alt: "Illustration of a floodlit box cricket cage with Nagpur's Zero Mile pillar behind it and oranges in the foreground",
  },
  keywords: [
    "box cricket Nagpur",
    "best box cricket turf Nagpur",
    "box cricket near me Nagpur",
    "cricket turf Nagpur",
    "CC Turf Nagpur",
    "box cricket Manish Nagar",
    "box cricket Ram Nagar Nagpur",
    "turf booking Nagpur",
  ],
  cta: { href: "/nagpur/box-cricket", label: "All 46 Nagpur cages" },
  blocks: [
    {
      type: "p",
      text: "Nagpur joined TapTurf this month with 46 box cricket turfs, and the first thing the data showed was how much Nagpur likes them. The average rating across venues with 20 or more reviews is 4.49, the highest of the five cities we cover. Three of the top six belong to one operator, and the biggest ground in the city has more Google reviews than most Pune venues. Here is the shortlist.",
    },
    {
      type: "stat-grid",
      items: [
        { value: "46", label: "Box cricket turfs", hint: "Listed on TapTurf, Oct 2026" },
        { value: "4.49", label: "Average rating", hint: "Highest of our five cities" },
        { value: "10", label: "Open 24 hours", hint: "Including four in this list" },
        { value: "41", label: "Neighbourhoods", hint: "Almost one cage per area" },
      ],
    },

    { type: "h2", text: "How this list is ranked" },
    {
      type: "p",
      text: "Google rating first, review count second. Nagpur's market is younger than Pune's or Hyderabad's, so we set the floor at 60 reviews rather than 100, which lets two very highly rated newer cages in. Rates are shown only where the venue lists them; only 8 of the 46 do, so most pages here have a Call button instead of a price. All numbers were checked on 8 October 2026.",
    },

    { type: "h2", text: "The top 12" },
    {
      type: "turf",
      rank: 1,
      id: "2c7244f5-d586-4b8e-b62e-484751ab18fc",
      name: "CC Turf Pardi",
      area: "Pardi",
      rating: "4.9",
      reviews: 186,
      note: "Near the HP petrol pump on the Pardi road, open 24 hours. The best rating in the city with a meaningful number of reviews. Box cricket and football. Call for rates.",
    },
    {
      type: "turf",
      rank: 2,
      id: "aa499603-03ab-409c-9927-8ccaac3ef855",
      name: "TurfGully",
      area: "New Manish Nagar, Beltarodi",
      rating: "4.9",
      reviews: 71,
      note: "A newer cage at Mahalaxmi Nagar with a 4.9 from its first 71 reviews. Box cricket and football. Call for rates and hours.",
    },
    {
      type: "turf",
      rank: 3,
      id: "abaea1dc-0b0c-4f55-b097-5b6b0437a574",
      name: "SS Turf Nagpur",
      area: "Pipla Fata, Outer Ring Road",
      rating: "4.9",
      reviews: 67,
      note: "On the Outer Ring Road at Pipla Fata, handy for the south of the city. 4.9 from 67 reviews. Box cricket and football.",
    },
    {
      type: "turf",
      rank: 4,
      id: "965187d3-e8de-4673-9f02-ae765baf965a",
      name: "CC Turf Ram Nagar Hill Top",
      area: "Ram Nagar, Ambazari Road",
      rating: "4.8",
      reviews: 884,
      note: "884 reviews, the most of any Nagpur venue by a wide margin, and still a 4.8. On Fuke Patil Marg off Ambazari Road, open 24 hours, with badminton alongside the cage. If you only try one ground in Nagpur, this is the safe pick.",
    },
    {
      type: "turf",
      rank: 5,
      id: "a9ad5fa5-4302-45fd-9a78-5a7cda518193",
      name: "CC Turf Manish Nagar",
      area: "Manish Nagar, Besa",
      rating: "4.8",
      reviews: 374,
      note: "The third CC Turf, behind Maxx Sanman near the Shiv Mandir in Besa. 374 reviews at 4.8. Box cricket and football. Call for rates.",
    },
    {
      type: "turf",
      rank: 6,
      id: "61a9c568-2299-4fef-a8e0-dd9ed95bc96e",
      name: "Xciteplay Club Association",
      area: "KT Nagar, Katol Road",
      rating: "4.8",
      reviews: 174,
      note: "The north-Nagpur pick, on Katol Road, and one of the few venues with listed rates: ₹1,500 an hour by day and ₹2,500 in the evening, the top of the Nagpur market. Football and box cricket.",
    },
    {
      type: "turf",
      rank: 7,
      id: "1ed5b7c7-aff6-4358-a024-fd61ebad2f90",
      name: "Run Bhumi Turf",
      area: "Sangharsh Nagar",
      rating: "4.7",
      reviews: 215,
      note: "Open 24 hours, with pickleball as well as box cricket and football. 215 reviews at 4.7. Call for rates.",
    },
    {
      type: "turf",
      rank: 8,
      id: "dbb7daeb-0767-49a2-9e6b-e63246bba13b",
      name: "Legends Sports Club",
      area: "Zingabai Takli, Godhani Road",
      rating: "4.5",
      reviews: 151,
      note: "At the T-point on Godhani Road. Box cricket, football and badminton. 151 reviews at 4.5.",
    },
    {
      type: "turf",
      rank: 9,
      id: "8985dc7a-7301-45d3-aa95-5ac1a12a40c5",
      name: "The Zion - Multisports Turf",
      area: "Jaripatka, Mankapur Ring Road",
      rating: "4.5",
      reviews: 136,
      note: "Jaripatka is the only Nagpur neighbourhood with three cages, and this is the best-rated of them. Listed at ₹800 an hour by day, ₹900 evenings and ₹1,100 on weekend nights, the lowest published rate in this top 12.",
    },
    {
      type: "turf",
      rank: 10,
      id: "2ddd0809-2038-4ece-b830-03e54fc6c0e1",
      name: "Shree Balaji Turf",
      area: "Nandanvan",
      rating: "4.5",
      reviews: 108,
      note: "Venkatesh Nagar, Nandanvan, open 24 hours. Box cricket and football. The east-side option for late slots.",
    },
    {
      type: "turf",
      rank: 11,
      id: "9f1c6c34-5fe8-4928-8303-b5a9696f854d",
      name: "SK Sports Arena",
      area: "Somalwada, Wardha Road",
      rating: "4.5",
      reviews: 96,
      note: "Near the Narendra Nagar flyover on Wardha Road. 96 reviews at 4.5. We don't have a phone number for this one yet; the page has the map.",
    },
    {
      type: "turf",
      rank: 12,
      id: "37dbd368-0803-40dc-997f-9e897a1df18d",
      name: "The Pavilion Sports Arena",
      area: "Anant Nagar, Gorewada Road",
      rating: "4.4",
      reviews: 110,
      note: "On Gorewada Road in the north-west. Box cricket and football, 110 reviews at 4.4.",
    },

    { type: "h2", text: "The CC Turf question" },
    {
      type: "p",
      text: "Three CC Turf grounds make the top five: Pardi, Ram Nagar Hill Top and Manish Nagar. They are in different corners of the city, so pick by distance. Ram Nagar is the central, most-reviewed one and runs 24 hours. Pardi is east and also 24 hours. Manish Nagar covers the south. Ratings are within a tenth of each other, so there is no wrong answer.",
    },
    { type: "related-turfs", title: "The three CC Turfs", ids: ["965187d3-e8de-4673-9f02-ae765baf965a", "2c7244f5-d586-4b8e-b62e-484751ab18fc", "a9ad5fa5-4302-45fd-9a78-5a7cda518193"] },

    { type: "h2", text: "What it costs" },
    {
      type: "p",
      text: "Eight of the 46 Nagpur cages publish a rate. Among them the cheapest off-peak hour is ₹800 and the most expensive evening slot is ₹2,500. The typical listed rate sits around ₹1,200 an hour, which is a little above Pune's and well below Mumbai's. The other 38 venues quote on the phone, and the number is on every TapTurf page.",
    },
    {
      type: "table",
      caption: "Listed hourly rates among the top 12, 8 October 2026.",
      columns: ["Turf", "Day", "Evening", "Weekend eve"],
      rows: [
        ["The Zion, Jaripatka", "₹800", "₹900", "₹1,100"],
        ["Xciteplay, KT Nagar", "₹1,500", "₹2,500", "₹2,500"],
      ],
    },
    { type: "price-calc", defaults: { pricePerHour: 1200, players: 12, hours: 1 }, caption: "₹1,200 split twelve ways is ₹100 a head. Change the numbers to match your slot." },

    { type: "h2", text: "By area" },
    {
      type: "p",
      text: "Nagpur's 46 cages are spread across 41 neighbourhoods, so there is usually one near you and rarely a choice of three. The exception is Jaripatka in the north, with three cages averaging 4.37. Rough guide by direction:",
    },
    {
      type: "ul",
      items: [
        "Central and west: CC Turf Ram Nagar Hill Top.",
        "North: Xciteplay on Katol Road, Legends on Godhani Road, The Zion in Jaripatka, The Pavilion on Gorewada Road.",
        "South: CC Turf Manish Nagar, TurfGully, SS Turf at Pipla Fata, SK Sports Arena on Wardha Road.",
        "East: CC Turf Pardi, Run Bhumi in Sangharsh Nagar, Shree Balaji in Nandanvan.",
      ],
    },

    { type: "h2", text: "Before you book" },
    {
      type: "ul",
      items: [
        "Most Nagpur venues don't publish rates. Ask for the weekday and weekend evening prices separately; they often differ.",
        "Ten cages run 24 hours. In this list that's CC Turf Pardi, CC Turf Ram Nagar, Run Bhumi and Shree Balaji. Confirm staff and lights for slots after midnight.",
        "Check whether the venue supplies the tennis ball and stumps or expects you to bring them.",
        "Summer afternoons in Nagpur are brutal. Morning and night slots are where the regulars play from March to June.",
        "Ratings here are from Google. Read the most recent reviews on the TapTurf page, not just the average.",
      ],
    },

    {
      type: "faq",
      items: [
        {
          q: "Which is the best box cricket turf in Nagpur?",
          a: "By rating, CC Turf Pardi holds a 4.9 from 186 Google reviews. By volume, CC Turf Ram Nagar Hill Top has 884 reviews at 4.8, more than any other venue in the city. Both are open 24 hours.",
        },
        {
          q: "How much does box cricket cost in Nagpur?",
          a: "Only 8 of the 46 listed cages publish a rate. Among those, the cheapest off-peak hour is ₹800 at The Zion in Jaripatka and the most expensive evening hour is ₹2,500 at Xciteplay. A typical listed rate is around ₹1,200 an hour. Most venues quote on the phone.",
        },
        {
          q: "Are there 24-hour box cricket turfs in Nagpur?",
          a: "Yes, 10 of the 46 listed cages are open 24 hours, including CC Turf Pardi, CC Turf Ram Nagar Hill Top, Run Bhumi Turf and Shree Balaji Turf.",
        },
        {
          q: "How many CC Turf grounds are there in Nagpur?",
          a: "Three on TapTurf: Pardi, Ram Nagar Hill Top and Manish Nagar. All three are rated 4.8 or above.",
        },
        {
          q: "Does TapTurf charge a booking fee?",
          a: "No. TapTurf lists the venue's own phone number and WhatsApp. You book directly with the ground.",
        },
      ],
    },

    {
      type: "cta",
      text: "Every Nagpur cage with a live rating, phone number and map.",
      href: "/nagpur/box-cricket",
      label: "Browse all 46 box cricket turfs in Nagpur",
    },
  ],
};
