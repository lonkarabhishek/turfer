import type { Post } from "../types";

// Owner's guide built from the TapTurf turf business report (Oct 2026).
// Working files: /workspace/tapturf/turf-business-report/ on the agent box.
// Lease only: buying land is not analysed.

export const post: Post = {
  slug: "how-to-start-a-turf-business-nashik-pune-lease-guide",
  title: "How to Start a Turf Business on Leased Land: A Nashik and Pune Guide",
  description:
    "What a turf costs to build and run on leased land, how much rent you can afford, the hours you must sell to break even, and what to put in the lease.",
  hook: "At Nashik prices, a Rs 60,000 rent means selling about 44% of your hours just to break even. Here is the maths before you sign a lease.",
  category: "Guides",
  city: null,
  readMinutes: 12,
  publishedAt: "2026-10-21",
  coverEmoji: "🏗️",
  heroImage: {
    url: "/blog/art/turf-business/rent-vs-breakeven.png",
    og: "https://www.tapturf.in/blog/art/turf-business/rent-vs-breakeven.png",
    alt: "Line chart showing that break-even occupancy for a turf rises as monthly land rent rises, faster at Nashik prices than at Pune prices",
  },
  keywords: [
    "how to start a turf business",
    "turf business in india",
    "box cricket turf business",
    "turf business profit",
    "turf on lease land",
    "turf business nashik",
    "turf business pune",
    "box cricket setup cost",
    "football turf cost india",
  ],
  cta: { href: "/turfs", label: "See turfs near your plot" },
  blocks: [
    {
      type: "p",
      text: "To start a turf business on leased land, you need ₹7.5 lakh to ₹60 lakh for the build depending on size, a security deposit, and a rent low enough that you break even at the 30 to 50% occupancy most new turfs actually see. In Nashik, where an hour sells for about ₹600, that means rent well under ₹1 lakh a month.",
    },
    {
      type: "callout",
      title: "TLDR",
      text: "A turf can work as a small business, but it is a property and operations business, not passive income. Most owners lease the land. Keep rent low compared with what your area pays per hour, sign a lease of five years or more with capped rent rises, and plan for 30 to 35% of hours booked, not 70%. In our illustrative numbers, a Nashik-priced turf on Rs 60,000 rent needs about 44% of its hours sold just to break even; on Rs 2 lakh rent it cannot work.",
    },
    {
      type: "stat-grid",
      items: [
        { value: "₹600", label: "Median listed hourly price, Nashik", hint: "TapTurf database, 21 Oct 2026 (22 priced venues)" },
        { value: "₹1,000", label: "Median listed hourly price, Pune", hint: "TapTurf database, 21 Oct 2026 (172 priced venues)" },
        { value: "₹7.5L to ₹60L", label: "Reported build cost, land excluded", hint: "Small box court to Kerala 7-a-side" },
        { value: "129 of 1,235", label: "Kerala turfs shut in five years", hint: "Turf Owners Association Kerala, Feb 2025" },
      ],
    },
    {
      type: "p",
      text: "This guide is for anyone thinking of opening a box cricket or football turf, especially in Nashik or Pune. It covers leasing only, because most small owners rent the plot rather than buy it. Every figure below comes from a named, dated source listed at the end, or from the TapTurf database. Profit and payback figures are illustrative scenarios built from those inputs, not forecasts for any real site. This is general information, not legal, tax or investment advice.",
    },

    { type: "h2", text: "How a turf makes money", id: "how-a-turf-makes-money" },
    {
      type: "p",
      text: "Almost all the income comes from selling hours. Groups book a slot, usually in the evening after work or college, and pay for the hour. On TapTurf, the median listed price is ₹600 an hour in Nashik and ₹1,000 in Pune (TapTurf database, 21 Oct 2026). These are listed prices, not verified with owners, and only some venues show a price: 22 of 63 active Nashik listings and 172 of 291 active Pune listings.",
    },
    {
      type: "ul",
      items: [
        "Evenings carry the business. A contractor estimates weekend evenings can run 70 to 80% full while weekday mornings often sit under 15% (Stark Sports).",
        "Off-peak hours can be filled with tournaments, coaching camps and fixed weekly slots for regular groups (GHAR.tv Research).",
        "Corporate tournaments are quoted at ₹15,000 to ₹40,000 each in Tier-2 cities (ChampCourts, a contractor).",
        "A modest cafe is estimated to add ₹10,000 to ₹30,000 a month (GHAR.tv Research). We found no reliable figure for coaching income.",
      ],
    },
    {
      type: "p",
      text: "The one number that decides everything is occupancy: the share of your bookable hours that are actually sold. In this guide we assume 16 bookable hours a day (6 am to 10 pm), which is 480 hours a month. Selling half of them at ₹600 brings in ₹1,44,000 a month; selling a third brings in ₹96,000.",
    },

    { type: "h2", text: "What it costs to start", id: "what-it-costs" },
    {
      type: "image",
      src: "/blog/art/turf-business/turf-build-cost.png",
      alt: "Bar chart of reported turf build costs: Rs 7.5 to 10.5 lakh for a small box court, Rs 12 to 15 lakh for a 5,000 sq ft box cricket turf, Rs 14 to 20 lakh for 5-a-side football, Rs 30 to 35 lakh for 7-a-side and Rs 50 to 60 lakh for a Kerala 7-a-side",
      caption: "Reported build costs, land not included. Size, grass quality, lights and washrooms explain most of the spread. Contractor figures have a commercial interest.",
    },
    {
      type: "table",
      caption: "What sources report for the build (land excluded)",
      columns: ["Item", "Reported cost", "Source"],
      rows: [
        ["Single 60 x 30 ft box cricket court, turnkey", "₹7.5 to 10.5 lakh", "ChampCourts (contractor)"],
        ["Box cricket, about 5,000 sq ft", "₹12 to 15 lakh", "A.S Sports and Infra (contractor)"],
        ["5-a-side football turf, all-in", "₹14 to 20 lakh", "ChampCourts (contractor)"],
        ["5-a-side turf, Kerala", "About ₹25 lakh", "Turf Owners Association Kerala, via Mathrubhumi, 9 Feb 2025"],
        ["7-a-side turf, Kerala", "₹50 to 60 lakh", "Turf Owners Association Kerala, via Mathrubhumi, 9 Feb 2025"],
        ["LED floodlights, 5-a-side", "₹3 to 8 lakh", "ChampCourts (contractor)"],
      ],
    },
    {
      type: "p",
      text: "On leased land you also need cash for the security deposit. Two Nashik plot listings we checked ask ₹5 lakh and ₹10 lakh as deposit, and one adds a month's rent as brokerage (Magicbricks listings, Jul and Sep 2026). That money sits on top of the build cost.",
    },
    {
      type: "p",
      text: "Running costs, before rent, in our scenarios come to about ₹54,300 a month: two attendants at the Maharashtra Zone I unskilled minimum wage (₹14,155 each), floodlight electricity of about ₹3,500 at the MSEDCL commercial tariff, ₹12,500 for maintenance, and ₹10,000 set aside to replace the grass after about six years. We also take 10% of slot revenue for booking platform and payment costs. One contractor puts all-in running costs much higher, at ₹1.5 to 3.5 lakh a month (Stark Sports), so treat our number as the lean case.",
    },

    {
      type: "cta",
      text: "See what turfs charge in each city, with the limits of the data.",
      href: "/blog/nashik-vs-pune-turfs-listed-prices-2026",
      label: "Nashik vs Pune turf prices",
    },

    { type: "h2", text: "Where to start", id: "where-to-start" },
    {
      type: "ul",
      items: [
        "Players within a short drive. GHAR.tv Research suggests a dense residential or office area within a 10 to 15 minute drive, and parking for about 20 vehicles at peak.",
        "Near colleges and offices. Students and young professionals are the core customers. Pune Pulse (19 May 2026) names Undri, Baner, Wakad, Kharadi, Hinjawadi and Viman Nagar as Pune turf hubs.",
        "Away from bedroom windows. Late evenings are the best-selling hours, and a proposal in Mumbai would have turfs in residential areas shut by 10 pm while those in commercial and industrial areas run later (Mumbai Mirror, 4 Aug 2026).",
        "Count competitors within 3 to 5 km before you sign. Several venues close by shows demand, but also price pressure.",
      ],
    },
    {
      type: "p",
      text: "Nashik and Pune are different markets. Each hour sells for about 40% less in Nashik, so a Nashik turf needs a cheaper build and much lower rent to work. On the other hand, fewer Nashik listings on TapTurf mention floodlights, so a well-lit venue with clean washrooms may stand out there.",
    },
    {
      type: "image",
      src: "/blog/art/turf-business/kerala-turf-closures.png",
      alt: "Bar chart showing Kerala turf closures: 129 of 1,235 registered turfs statewide, 8 of 300 in Kozhikode, 40 of 300 in Malappuram and 25 of 120 in Thrissur",
      caption: "Oversupply is a real risk. The Turf Owners Association Kerala says 129 of 1,235 registered turfs shut in five years, citing electricity and upkeep costs, fewer bookings and night-play limits (Mathrubhumi English, 9 Feb 2025).",
    },

    { type: "h2", text: "Leasing: how much rent can a turf afford?", id: "rent-vs-break-even" },
    {
      type: "p",
      text: "Rent is the biggest fixed cost you negotiate, and you negotiate it only once. We found no published survey of turf land rents in Nashik or Pune, so the rents below are one national range (GHAR.tv Research: ₹3 to 8 lakh a year on peri-urban plots) and asking rents for open plots listed on Magicbricks and RealEstateIndia. Listings are asking prices, not agreed turf leases.",
    },
    {
      type: "table",
      caption: "Illustrative: share of hours you must sell to cover all monthly costs",
      columns: ["Monthly rent", "Where this rent comes from", "Nashik-type turf (₹600/hr)", "Pune-type turf (₹1,000/hr)"],
      rows: [
        ["₹25,000", "Low end of GHAR.tv national range", "31%", "18%"],
        ["₹60,000", "Chandsi, Nashik plot listing", "44%", "27%"],
        ["₹1,00,000", "Sus, Pune plot listing", "60%", "36%"],
        ["₹1,50,000", "Pashan-Sus Road, Pune plot listing", "79%", "47%"],
        ["₹2,00,000", "Panchvati, Nashik plot listing", "98%", "59%"],
      ],
    },
    {
      type: "image",
      src: "/blog/art/turf-business/rent-vs-breakeven.png",
      alt: "Line chart of break-even occupancy against monthly rent for Nashik-type and Pune-type turfs, with a shaded band at 35 to 50 percent occupancy",
      caption: "Illustrative. The shaded band is the 35 to 50% year-one occupancy a contractor says to plan for (Stark Sports). Above the band, the plan relies on unusually busy hours.",
    },
    {
      type: "callout",
      title: "Rule of thumb for your own plot",
      text: "Break-even occupancy = (monthly rent + about ₹54,300) / (480 x your average hourly price x 0.9). Each extra ₹10,000 of rent adds about 4 points of break-even at ₹600 an hour, and about 2.3 points at ₹1,000.",
    },

    { type: "h2", text: "Lease length vs payback", id: "lease-length-vs-payback" },
    {
      type: "p",
      text: "Grass, base and steel frame cannot be moved cheaply, so the build cost must come back before the lease ends. GHAR.tv Research reports that most turfs sit on 3 to 5 year leases, and warns that a landlord who sees a busy turf may raise the rent at renewal. The table below assumes a ₹12 lakh build for the Nashik-type turf and ₹25 lakh for the Pune-type turf.",
    },
    {
      type: "table",
      caption: "Illustrative: months to earn back the build cost (security deposit not included)",
      columns: ["Monthly rent", "Nashik-type at 50% booked", "Nashik-type at 60% booked", "Pune-type at 50% booked", "Pune-type at 60% booked"],
      rows: [
        ["₹25,000", "24", "16", "18", "14"],
        ["₹60,000", "79", "29", "25", "17"],
        ["₹1,00,000", "Loss", "Over 120", "41", "24"],
        ["₹1,50,000", "Loss", "Loss", "Over 120", "46"],
        ["₹2,00,000", "Loss", "Loss", "Loss", "Over 120"],
      ],
    },
    {
      type: "image",
      src: "/blog/art/turf-business/payback-vs-lease-length.png",
      alt: "Heat map of months to recover the build cost by monthly rent and occupancy, coloured by whether payback fits within 3 years, 3 to 5 years, or takes longer",
      caption: "Illustrative. Green fits inside a 3-year lease, amber inside 5 years, red takes longer or loses money.",
    },
    {
      type: "p",
      text: "What this means: at Nashik prices, a 3-year lease only works with low rent and a busy turf. At ₹60,000 rent, 50% occupancy takes about six and a half years to pay back, longer than most leases. At Pune prices there is more room, but at ₹1 lakh rent and above you need 60% or more booked to recover the build inside five years.",
    },

    { type: "h2", text: "Deal checklist before you sign a lease", id: "lease-checklist" },
    {
      type: "ol",
      items: [
        "Lock-in and length: at least five years, with a written renewal option, signed before you spend on construction (GHAR.tv Research, Jul 2026).",
        "Rent cap: agree a fixed yearly increase in writing. We found no benchmark for private turf leases; one public example, the Sports Authority of India's Gandhinagar operator contract, raises its fee by 5% a year (SAI tender, 16 May 2023).",
        "Deposit and brokerage: budget the deposit as extra cash on top of the build. Nashik listings ask ₹5 to 10 lakh.",
        "Land use: confirm the plot's zoning allows a sports turf, and ask the municipal corporation in writing which permissions an open-air turf needs on that plot. Surat sealed three box cricket venues for running without approvals (DeshGujarat, 24 Jul 2025).",
        "Landlord paperwork: GST registration needs a landlord NOC, a common friction point (GHAR.tv Research).",
        "End of lease: agree in writing who owns the grass, frame and lights when the lease ends, and whether you can remove them.",
        "Drainage: plan for the monsoon before you lay grass. Poor drainage leaves fields waterlogged after heavy rain (Stark Sports).",
      ],
    },

    {
      type: "faq",
      items: [
        {
          q: "How much does it cost to start a turf on leased land?",
          a: "Reported build costs range from about ₹7.5 lakh for a single small box cricket court to ₹50 to 60 lakh for a 7-a-side field in Kerala, land excluded. On top of that you need the security deposit, which two Nashik plot listings put at ₹5 lakh and ₹10 lakh.",
        },
        {
          q: "How much rent can a turf in Nashik afford?",
          a: "In our illustrative scenario at ₹600 an hour, break-even occupancy is about 31% at ₹25,000 rent, 44% at ₹60,000 and 60% at ₹1 lakh. Contractors suggest planning for 35 to 50% occupancy in year one, so rents much above ₹60,000 leave little margin.",
        },
        {
          q: "How long does a turf take to pay back?",
          a: "It depends mostly on rent and occupancy. In our scenarios, a Pune-type turf with ₹25 lakh build and ₹60,000 rent pays back in about 25 months at 50% occupancy; a Nashik-type turf with ₹12 lakh build and the same rent takes about 79 months. Faster payback claims from contractors and analysts, such as 12 to 24 months, assume higher occupancy.",
        },
        {
          q: "Is a turf business risky?",
          a: "Yes, it can be. In Kerala, 129 of 1,235 registered turfs shut in five years. The main risks are permissions, noise and floodlight complaints, monsoon drainage, too many turfs nearby, and short leases.",
        },
      ],
    },

    {
      type: "cta",
      text: "Check which turfs already operate near a plot you are considering, and what they charge.",
      href: "/turfs",
      label: "Browse turfs on TapTurf",
    },

    { type: "h2", text: "What we could not find", id: "data-gaps" },
    {
      type: "ul",
      items: [
        "No survey of turf land rents in Nashik or Pune. Our rents come from one national range and asking rents for open plots.",
        "No audited or surveyed occupancy data for turfs. Occupancy figures come from contractors, analysts and individual owners.",
        "No reliable figure for the total revenue of India's pay-and-play turf market.",
        "No Nashik or Pune data on how much bookings drop in the monsoon.",
        "TapTurf prices are listed prices, not verified with owners, and only some venues list a price.",
      ],
    },
    {
      type: "p",
      text: "How the scenarios work: monthly revenue = 480 hours x occupancy x price; operating profit = revenue x 0.9 minus monthly costs (rent plus about ₹54,300); payback = build cost / monthly operating profit. Profit is before the owner's own salary, loan interest, income tax and GST. Cafe, tournament and coaching income are left out to stay conservative.",
    },

    {
      type: "sources",
      items: [
        { label: "TapTurf database, 21 Oct 2026: active venues and listed hourly prices in Nashik and Pune (internal)", url: "https://www.tapturf.in/turfs" },
        { label: "Mathrubhumi English, \"40 turfs shut down in Malappuram\", 9 Feb 2025", url: "https://english.mathrubhumi.com/sports/football/40-turfs-shut-down-in-malappuram-football-rolling-back-to-fields-amid-looming-crisis-dee21b12" },
        { label: "GHAR.tv Research, \"Indoor Sports and Turf Arena Real Estate Investment India 2026\", Jul 2026", url: "https://www.ghar.tv/intelligence/indoor-sports-turf-arena-real-estate-investment-india-2026/artgi432" },
        { label: "ChampCourts (contractor), \"Box cricket court construction\", accessed 21 Oct 2026", url: "https://champcourts.com/collections/box-cricket-courts" },
        { label: "ChampCourts (contractor), \"Football Turf Cost India (2026)\", updated 2 Aug 2026", url: "https://champcourts.com/blogs/guides/football-turf-construction-cost-india" },
        { label: "A.S Sports and Infra (contractor), \"Box Cricket Setup Cost in India 2026\", accessed 21 Oct 2026", url: "https://assportsandinfra.com/box-cricket-setup-cost/" },
        { label: "Stark Sports (contractor), \"Box Cricket and Cricket Turf Business Model in India\", updated Aug 2026", url: "https://www.starksports.in/blog/box-cricket-turf-business-model-india" },
        { label: "Magicbricks listing, commercial land for rent, Chandsi, Nashik, posted 8 Jul 2026", url: "https://www.magicbricks.com/propertyDetails/867-Sq-m-Commercial-Land-FOR-Rent-Chandsi-in-Nashik&id=4d423833373137333935" },
        { label: "Magicbricks listing, commercial land for rent, Panchvati, Nashik, posted 30 Sep 2026", url: "https://www.magicbricks.com/propertyDetails/1000-Sq-yrd-Commercial-Land-FOR-Rent-Panchvati-in-Nashik&id=4d423831303531333331" },
        { label: "RealEstateIndia, commercial plots for rent in Baner, Pune (Sus and Pashan-Sus Road listings), accessed 21 Oct 2026", url: "https://www.realestateindia.com/pune-property/commercial-lands-for-rent-in-baner.htm" },
        { label: "Pune Pulse, \"From football to box cricket: sports turfs become Pune's new lifestyle trend\", 19 May 2026", url: "https://www.mypunepulse.com/from-football-to-box-cricket-sports-turfs-become-punes-new-lifestyle-trend/" },
        { label: "Mumbai Mirror, \"Turf war\", 4 Aug 2026", url: "https://mumbaimirror.indiatimes.com/mumbai/cover-story/turf-war/articleshow/132838521.html" },
        { label: "DeshGujarat, \"Surat civic body seals three box cricket facilities in Rander\", 24 Jul 2025", url: "https://deshgujarat.com/2025/07/24/surat-civic-body-seals-three-box-cricket-facilities-in-rander/" },
        { label: "Sports Authority of India, RFP for management operator, cricket ground at SAI RC Gandhinagar, 16 May 2023", url: "https://sportsauthorityofindia.nic.in/sai/public/assets/tenders/1684236531_CRICKET.pdf" },
        { label: "Maharashtra Electricity Regulatory Commission, Case No. 75 of 2025, LT tariff FY2025-26", url: "https://www.mahadiscom.in/en/consumer/tariff-details/" },
        { label: "SGCMS, \"Minimum Rate of Wages, Maharashtra (August 2026)\", 6 Aug 2026", url: "https://www.sgcms.com/regulatory-updates/minimum-rate-of-wages-maharashtra-august-2026/" },
      ],
      note: "Scenario figures are illustrative and combine the cited inputs; the 16-hour day, the 6,000 sq ft grass area and the six-year grass replacement are our choices within the cited ranges. Contractor sources have a commercial interest. Property listings are asking rents, not agreed leases; contact details in them are not reproduced. Sources were checked on 21 October 2026.",
    },
  ],
};
