import type { Post } from "../types";

export const post: Post = {
  slug: "turf-booking-mistakes",
  title: "9 Turf Booking Mistakes That Ruin Your Weekend",
  description:
    "The nine most common turf-booking mistakes, and how to avoid them so your Saturday plans don't fall apart at the last second.",
  hook: "The nine mistakes that turn a fun Saturday into a ₹1,800 lesson.",
  category: "Guides",
  city: null,
  readMinutes: 5,
  publishedAt: "2026-08-08",
  coverEmoji: "⚠️",
  keywords: [
    "turf booking mistakes",
    "avoid turf booking problems",
    "cricket booking tips",
    "football turf booking",
    "turf booking guide",
  ],
  blocks: [
    {
      type: "p",
      text: "Every one of these mistakes has cost me or a friend a game, money, or both. Skip the tuition fee, read this before your next booking.",
    },

    { type: "h2", text: "1. Not confirming the address" },
    {
      type: "p",
      text: "Turfs share compounds. 'XYZ Sports Complex' has three different turfs in it. Half your squad shows up at the wrong gate, loses 20 minutes finding you. Ask for the exact Google Maps pin, not just the name.",
    },

    { type: "h2", text: "2. Booking for the wrong number of players" },
    {
      type: "p",
      text: "You RSVP'd 12. You have 14 by Friday. The turf allows max 12 per box slot. Now two friends drive across town to sit out. Confirm max-headcount when you book and RSVP with a slight buffer.",
    },

    { type: "h2", text: "3. Not checking the cancellation policy" },
    {
      type: "p",
      text: "Something comes up. You cancel 8 hours out. The turf's policy was 12-hour full refund, less than that is zero. You've just paid ₹1,600 for a match that didn't happen.",
    },

    { type: "h2", text: "4. Assuming equipment is included" },
    {
      type: "p",
      text: "Most turfs include bat, wickets, tape ball. Some charge ₹100–₹200 extra for premium kits. A few (mostly smaller ones) don't include anything. Ask when you book. Bring your own gear as a backup for anywhere new.",
    },

    { type: "h2", text: "5. Booking the wrong sport for the pitch" },
    {
      type: "p",
      text: "'Multi-sport turf' often means the pitch is bad at everything. A cricket-first turf with football goals dumped on is a bad football pitch. A football turf with a pitch mat rolled out is a bad cricket pitch. Book turfs that specialise, especially for a serious game.",
    },

    { type: "h2", text: "6. Ignoring the weather forecast" },
    {
      type: "p",
      text: "Open-air turfs get cancelled in rain. If there's rain forecast, book covered or netted, or have a backup plan. Especially in Pune and Nashik during monsoon.",
    },

    {
      type: "callout",
      title: "Two words: covered turf",
      text: "During June–September, book covered turfs even if they cost 20% more. The insurance against a washout is worth it.",
    },

    { type: "h2", text: "7. Not confirming price in writing" },
    {
      type: "p",
      text: "Verbal quote: ₹1,200. Invoice at pickup: ₹1,500 ('you played 15 minutes over, sir'). Every price should be in a WhatsApp message before you pay a rupee. That message is the contract.",
    },

    { type: "h2", text: "8. Booking a 60-minute slot for 14 people" },
    {
      type: "p",
      text: "60 minutes and 14 people means everyone bats for 2 minutes and bowls one ball. You'll drive an hour each way for an experience that's not worth ₹100. Match the slot length to the format: 12+ people needs 90+ minutes.",
    },

    { type: "h2", text: "9. Not accounting for peak-hour traffic" },
    {
      type: "p",
      text: "You booked for 7pm. It's 6:30 and you're 12km away. Nashik and Pune weekend traffic will eat 30 minutes easy. Add 20 minutes of buffer for every slot in peak hours. Being late means playing 40 minutes of a 60-minute slot.",
    },

    {
      type: "cta",
      text: "TapTurf shows every turf's real pricing, amenities, and cancellation policy before you book.",
      href: "/turfs",
      label: "Browse turfs",
    },

    {
      type: "callout",
      title: "One rule fixes half of these",
      text: "Get everything, address, headcount, price, cancellation, equipment, in writing before you pay. WhatsApp is fine. Verbal is not.",
    },
  ],
};
