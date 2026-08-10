import type { Post } from "../types";

export const post: Post = {
  slug: "turf-etiquette",
  title: "Turf Etiquette: 10 Unwritten Rules Nobody Tells You",
  description:
    "The unwritten rules of playing on a sports turf, how to be the squad that turf managers actually want back next week.",
  hook: "The stuff that isn't on the sign at the gate, and matters more.",
  category: "Rules",
  city: null,
  readMinutes: 5,
  publishedAt: "2026-08-07",
  coverEmoji: "🤝",
  keywords: [
    "turf etiquette",
    "sports etiquette",
    "turf behaviour",
    "how to be a good turf regular",
    "turf player rules",
  ],
  blocks: [
    {
      type: "p",
      text: "There are rules on the wall. Then there are the ones no one prints, the ones that decide whether the turf manager remembers you as 'that great squad' or 'the group I'd rather not book again'. Here are the ten that matter.",
    },

    { type: "h2", text: "1. Vacate the pitch on time" },
    {
      type: "p",
      text: "Not one minute after. Not 'just this last over'. Off the pitch when the timer says off. The next squad has paid for their slot exactly like you paid for yours.",
    },

    { type: "h2", text: "2. Return the equipment the way you got it" },
    {
      type: "p",
      text: "Stumps stood back up in the box, bats not caked in mud, balls collected. Two minutes of care saves the next squad from starting their session with broken kit.",
    },

    { type: "h2", text: "3. Keep the trash off the pitch" },
    {
      type: "p",
      text: "Water bottles, tape ball wrappers, energy-drink cans. Take everything out with you. Turf staff shouldn't be picking up your recycling.",
    },

    { type: "h2", text: "4. Don't argue with the manager over rules" },
    {
      type: "p",
      text: "If the turf says 'no metal studs', that's it. Arguing gets you nowhere except onto a mental blacklist. Bring the right kit next time.",
    },

    { type: "h2", text: "5. Tip when the staff go out of their way" },
    {
      type: "p",
      text: "A groundsman who helped set up your stumps, or a manager who unlocked extra lights, gets ₹100–₹200 as a thank-you. Not obligatory, just remembered, and you'll notice the difference on your next booking.",
    },

    { type: "h2", text: "6. Don't hog the good side" },
    {
      type: "p",
      text: "In box cricket, one end is often better-lit or has better bounce. Rotate ends every 2–3 overs so both teams get equal use. Anyone insisting on staying at the better end is the squad member no one wants to invite back.",
    },

    { type: "h2", text: "7. Sledging has a ceiling" },
    {
      type: "p",
      text: "Banter is fine, it's why we play. But swearing loud enough for the family next door to hear? Personal attacks that land? That's the line. Turf managers shut it down before it escalates, and rightly so.",
    },

    { type: "h2", text: "8. Cash-splitting is done before you leave" },
    {
      type: "p",
      text: "Nothing looks worse than 12 grown adults standing at the exit trying to remember who owes what. Split it before you play, or immediately after. Never in the parking lot.",
    },

    { type: "h2", text: "9. Music is your squad's, not the neighbourhood's" },
    {
      type: "p",
      text: "One Bluetooth speaker, kept moderate. Not the JBL Boombox 3 pointed at the next building. Turfs sit next to homes; the noise ordinance is real and getting flagged for it ruins their day and your booking.",
    },

    { type: "h2", text: "10. Say thanks on the way out" },
    {
      type: "p",
      text: "Ten seconds. 'Great pitch today, thanks.' It costs nothing and it's why some squads always seem to get the good slot when they need it last-minute.",
    },

    {
      type: "callout",
      title: "The rule under all the rules",
      text: "You're not just renting a pitch, you're borrowing someone's business for two hours. Treat it accordingly.",
    },

    {
      type: "cta",
      text: "Find a turf where your squad will be welcome for years.",
      href: "/turfs",
      label: "Browse turfs",
    },
  ],
};
