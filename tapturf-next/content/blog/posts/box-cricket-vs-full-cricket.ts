import type { Post } from "../types";

export const post: Post = {
  slug: "box-cricket-vs-full-cricket",
  title: "Box Cricket vs Full Cricket: Which One Is Right for Your Squad?",
  description:
    "Box cricket vs full-format cricket, how they differ in pitch, format, cost, and vibe, and how to pick the right one for your squad size and skill level.",
  hook: "Compact and fast, or full-sized and traditional, the actual differences that matter.",
  category: "Guides",
  city: null,
  readMinutes: 6,
  publishedAt: "2026-08-04",
  coverEmoji: "🏏",
  keywords: [
    "box cricket rules",
    "box cricket vs cricket",
    "box cricket format",
    "box cricket india",
    "cricket format comparison",
  ],
  blocks: [
    {
      type: "p",
      text: "Both formats look like cricket. That's where the similarity ends. If you've been assuming box cricket is 'cricket, but in a box', you're going to have a confusing first game. Here's what actually changes, and how to pick.",
    },

    { type: "h2", text: "Pitch and dimensions" },
    {
      type: "ul",
      items: [
        "Full cricket: 90m x 60m minimum, real 22-yard pitch, boundary rope, deep-field positions.",
        "Box cricket: usually 60x30 or smaller, walled or netted on all four sides, no traditional boundary, walls count.",
      ],
    },

    { type: "h2", text: "Format" },
    {
      type: "p",
      text: "Full cricket at a turf usually plays as 6-a-side or 8-a-side, 6–10 overs a side, 90–120 minutes total. Box cricket runs 6-a-side, 5–6 overs a side, 60–75 minutes. The compressed format is why box cricket has taken over, it fits after work, and everyone actually bats and bowls.",
    },

    { type: "h2", text: "Ball" },
    {
      type: "p",
      text: "Both formats mostly use a tennis ball with tape on it (the tape adds swing). Serious box cricket leagues sometimes use a heavy tennis ball for extra bounce. Leather ball on turf is possible but almost never done in casual bookings, insurance and injury reasons.",
    },

    { type: "h2", text: "Rules that change" },
    {
      type: "ul",
      items: [
        "One-tip-one-hand catch, box cricket often allows a bounce off the wall counted as a catch. Confirm before you start.",
        "Wall runs, a shot off the back wall is usually 1, side walls 2, straight boundary 4, straight over the roof 6. Every turf tweaks this.",
        "No LBW in box cricket, the pitch is too short and the umpiring is one guy on his phone.",
        "One over per bowler, keeps the format inclusive.",
        "Last-man-standing, when 5 are out, the last batter bats alone.",
      ],
    },

    { type: "h2", text: "Cost" },
    {
      type: "p",
      text: "Box cricket is cheaper per person than full cricket. A 60x30 box for 90 minutes at ₹1,200 split 12 ways is ₹100 a head. Full cricket at ₹1,800 for 2 hours split 16 ways is ₹225 a head. The gap widens if you can't fill full-format numbers.",
    },

    { type: "h2", text: "Which format fits which squad" },
    {
      type: "ul",
      items: [
        "6–8 regulars, want an after-work game: box cricket, every time.",
        "12–16 regulars, weekend league: full cricket at a proper turf.",
        "Mixed skill levels, some beginners, some experienced: box cricket is more inclusive because everyone bats and bowls.",
        "Serious cricketers wanting genuine match practice: full cricket on real astroturf.",
      ],
    },

    { type: "h2", text: "The vibe difference" },
    {
      type: "p",
      text: "Box cricket is faster, louder, funnier, walls bounce shots back in weird ways, everyone gets involved, catches are wild. Full cricket at a turf feels more like real cricket, proper spells, field placings, the deep field standing there for 6 balls doing nothing. Both are great; pick by mood.",
    },

    {
      type: "callout",
      title: "The right answer",
      text: "If your squad is under 10 and you want to actually play more than watch, box cricket wins. If your squad is 12+ and you want a real cricket match, book the full turf.",
    },

    {
      type: "cta",
      text: "See every box cricket and full-turf option near you.",
      href: "/sport/cricket",
      label: "Browse cricket turfs",
    },

    { type: "h2", text: "Common rule agreements to make BEFORE the first ball" },
    {
      type: "ol",
      items: [
        "How many overs and how many per bowler.",
        "What counts as out, wall catches yes/no, one-hand-one-bounce yes/no.",
        "How wall bounces are scored (side vs back vs roof).",
        "Powerplay overs, first 2 usually mandatory 4 fielders in the circle.",
        "What happens to the last batter, bats alone, or last-wicket-with-runner.",
      ],
    },

    { type: "h2", text: "One habit that saves every game" },
    {
      type: "p",
      text: "Write the score. Not 'someone tracks it in their head', actually write it on a phone note or scoresheet. Both formats end in ugly disagreements at least once a season because nobody wrote the score down. 30 seconds of admin, hours of peace.",
    },
  ],
};
