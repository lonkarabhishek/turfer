import type { Post } from "../types";

export const post: Post = {
  slug: "split-turf-costs-with-squad",
  title: "How to Split Turf Costs With Your Squad Without Any Drama",
  description:
    "A no-nonsense system for collecting turf money from your squad every week, no chasing, no awkwardness, no 'I'll UPI you tomorrow'.",
  hook: "The one small system that ends 'I'll pay you back' forever.",
  category: "Playbook",
  city: null,
  readMinutes: 5,
  publishedAt: "2026-08-08",
  coverEmoji: "💸",
  keywords: [
    "split turf cost",
    "collect money for cricket",
    "squad payment system",
    "upi turf payment",
    "how to split sports cost",
  ],
  blocks: [
    {
      type: "p",
      text: "Every squad captain knows the pain. You've booked the turf. It's ₹1,600 for the hour. Split 12 ways is ₹135 per head. But somehow it's Thursday, you've been ghosted by four people, and you're ₹500 out of pocket. Here's the small system that fixes it forever.",
    },

    { type: "h2", text: "Rule 1. Money moves before the match" },
    {
      type: "p",
      text: "Not after. Not during. Before. 12 hours before kickoff, everyone's UPI'd their share. No UPI, no spot. The moment you take payment at the venue you've entered the 'I'll transfer tomorrow' loop, and half of tomorrow's transfers never happen.",
    },

    { type: "h2", text: "Rule 2. Round up, refund never" },
    {
      type: "p",
      text: "If the turf is ₹1,600 for 12 people, don't charge ₹133.33. Charge ₹150. The ₹200 buffer covers late arrivals wanting to join, the kit hire, the water bottles. If there's leftover, it goes into a squad kitty for next week. Nobody chases a refund.",
    },

    { type: "h2", text: "Rule 3. One UPI number, one QR code" },
    {
      type: "p",
      text: "The captain (or a rotating treasurer) is the single collector. Post the UPI ID and QR in the group with the exact amount. Not 'settle among yourselves', that's how splits go wrong.",
    },

    {
      type: "callout",
      title: "Squad kitty > per-game splits",
      text: "The best-run squads have a shared kitty. Everyone puts in ₹500–₹1,000 at the start of the month. Games get paid from the kitty. Balance shown in the group at month-end. Zero per-game admin.",
    },

    { type: "h2", text: "Rule 4. Late confirms pay more" },
    {
      type: "p",
      text: "If someone confirms inside 6 hours, they pay a small premium (₹20–₹50 extra). It's not punitive, it just gently pushes people to confirm early. And it covers the risk you took holding their spot.",
    },

    { type: "h2", text: "Rule 5. Drops don't get refunded (unless a replacement plays)" },
    {
      type: "p",
      text: "Fair to the squad, fair to the dropper. If they find their own replacement, that replacement pays them directly. If they don't, the money's kept, the turf isn't refunding you because someone bailed.",
    },

    { type: "h2", text: "Rule 6. Publish the split, always" },
    {
      type: "p",
      text: "One short message in the group at the end of the week: 'Turf ₹1,600, 12 players, ₹135 each, ₹180 in kitty from rounding.' Transparency kills every future 'wait, why did I pay ₹150?' question.",
    },

    { type: "h2", text: "The one drama that ends squads" },
    {
      type: "p",
      text: "It's not injuries. It's not scheduling. It's the 'you still owe me ₹135 from three weeks ago' conversation. Get money out of the way and you're free to actually enjoy playing with your friends.",
    },

    { type: "h2", text: "A copy-paste template that works" },
    {
      type: "quote",
      text: "🏏 Sunday 7pm turf booked at [venue]. Cost ₹150/head, 12 slots. Confirm your slot by UPIng ₹150 to [UPI ID] by Saturday 7pm. Late confirms ₹170. Reserves list open after 12.",
    },

    {
      type: "cta",
      text: "TapTurf handles the confirmation flow automatically. Host once, chase nobody.",
      href: "/game/create",
      label: "Host a game",
    },
  ],
};
