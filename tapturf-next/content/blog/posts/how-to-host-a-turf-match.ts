import type { Post } from "../types";

export const post: Post = {
  slug: "how-to-host-a-turf-match",
  title: "How to Host a Cricket Match at a Turf: A Captain's Playbook",
  description:
    "The complete captain's playbook for hosting a cricket match at a turf, squad sizing, splitting cost, running the game, and how to make sure everyone comes back next week.",
  hook: "You booked the turf. Now here's how to actually run the match.",
  category: "Playbook",
  city: null,
  readMinutes: 7,
  publishedAt: "2026-08-05",
  coverEmoji: "🎯",
  keywords: [
    "how to host cricket match",
    "cricket captain playbook",
    "organise cricket turf",
    "cricket squad organisation",
    "turf match hosting",
  ],
  blocks: [
    {
      type: "p",
      text: "Anyone can book a turf. The hard part is making 12 people actually show up, play a proper match, split the money without drama, and want to come back. That's captaincy. Here's the playbook.",
    },

    { type: "h2", text: "1. Book once. Publish once." },
    {
      type: "p",
      text: "Send one clean message with venue name, address, exact time, cost per head, and who's confirmed. Post it once in the squad group. Don't send updates in 6 separate messages, you'll lose people to information fatigue.",
    },

    { type: "h2", text: "2. Get money up front" },
    {
      type: "p",
      text: "The single biggest source of squad drama is collecting money after the match. Fix it: everyone UPI's you the exact cost per head at least 12 hours before the game, or their spot goes to the reserve list. Sounds harsh, saves your friendships.",
    },

    {
      type: "callout",
      title: "TapTurf handles the reminders",
      text: "Any game you host through TapTurf gets automatic squad reminders + join requests, so you're not the WhatsApp herder.",
    },

    { type: "h2", text: "3. Size the squad for the format" },
    {
      type: "ul",
      items: [
        "Box cricket 6-a-side: aim for 14 confirmed, you'll have 12 show up.",
        "Full-turf 8-a-side: aim for 18 confirmed, you'll have 16 show up.",
        "Never over-book by more than 20%. Turning up 4 spares over is worse than 1 short.",
      ],
    },

    { type: "h2", text: "4. Have a reserve list" },
    {
      type: "p",
      text: "You WILL get last-minute drops. Keep a reserve of 3–4 people who've said yes to short-notice games. When someone drops at 4pm for a 7pm slot, you have a proven backup, not a scramble.",
    },

    { type: "h2", text: "5. Confirm the venue 3 hours out" },
    {
      type: "p",
      text: "One WhatsApp to the turf: 'Confirming our 7pm slot for 14 people at [ground name]. See you then.' Any last-minute mess-up surfaces now, not when your squad is standing at the gate.",
    },

    { type: "h2", text: "6. Show up 15 minutes early" },
    {
      type: "p",
      text: "As captain, you're on-site first. Check the pitch, collect the equipment kit, walk the perimeter for boundary rules, agree with the turf staff on any special rules (wall bounces, one-tip-one-hand). Your squad walks on ready to play.",
    },

    { type: "h2", text: "7. Toss and teams, do them off the pitch" },
    {
      type: "p",
      text: "Pick captains on the way to the venue and let them draft teams during warm-up outside the pitch. Team selection during the paid slot is time you're literally burning.",
    },

    { type: "h2", text: "8. Someone else keeps score" },
    {
      type: "p",
      text: "Not you. As captain, you're already managing rotation, umpiring calls, and timekeeping. Hand the phone to the batsman who's out, they've got nothing else to do and it keeps them engaged.",
    },

    { type: "h2", text: "9. Run a tight rotation" },
    {
      type: "p",
      text: "One over per bowler, every batter faces at least 6 balls, rolling subs on the field. These three rules keep everyone playing instead of standing around, which is the single biggest driver of 'was that even worth ₹200'.",
    },

    { type: "h2", text: "10. Wrap in time" },
    {
      type: "p",
      text: "The turf staff will remind you 10 minutes before the end. Wind down the match at the 5-minute mark so you leave the pitch clean and on time. Overshooting cost me ₹500 once for a 15-minute overrun.",
    },

    { type: "h2", text: "11. Post-match, one photo, one message" },
    {
      type: "p",
      text: "Photo of the squad, a short 'good game everyone, MVP was X' message in the group, and the next date pinned. This is how squads become weekly rituals.",
    },

    { type: "h2", text: "12. Track who plays. Reward regulars." },
    {
      type: "p",
      text: "Keep a running note of who's played in the last 6 games. Regulars get first refusal on the next booking. This creates a self-reinforcing squad, the people who show up get more games, and the group gets tighter.",
    },

    {
      type: "cta",
      text: "Host your next match on TapTurf, auto-reminders, join requests, no chasing.",
      href: "/game/create",
      label: "Host a game",
    },

    {
      type: "callout",
      title: "The captain's mantra",
      text: "Book, collect, confirm, show up, wrap clean. Do these five things every week and your squad will be still playing together in three years.",
    },
  ],
};
