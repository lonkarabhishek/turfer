import type { Post } from "../types";

// Guide: what the DLS target on a broadcast means.
// Facts checked on 1 Nov 2026 against:
// - ICC, Duckworth Lewis Stern page
// - ICC playing-conditions note, "Duckworth-Lewis methodology for re-calculating the target score" (Stern edition via the ICC calculator; the written sum below is the Standard Edition backup for the case R2 < R1)
// - Stern, Journal of the Operational Research Society, 2016 (abstract)
// - Cricbuzz, "Introducing Duckworth-Lewis-Stern method" (2015 World Cup coverage), for the November 2014 revision
// No official resource table is included. The 73% in the example is invented.

export const post: Post = {
  slug: "what-is-dls-method-cricket",
  title: "What Is the DLS Method in Cricket?",
  description:
    "The DLS target on TV resets a rain-hit chase using overs left and wickets in hand. A plain guide, one made-up example, and why turf games usually skip it.",
  hook: "Rain stops play and the chase changes. Here is what the DLS target on TV is actually using.",
  category: "Guides",
  city: null,
  readMinutes: 4,
  publishedAt: "2026-11-01",
  coverEmoji: "🌧️",
  heroImage: {
    url: "/blog/art/what-is-dls-method-cricket.svg",
    og: "https://www.tapturf.in/blog/art/what-is-dls-method-cricket.png",
    alt: "Card titled What is the DLS method, with a partly filled resources bar, 20 overs still to bat and 10 wickets in hand, labelled as a lesson picture and not a target",
  },
  keywords: [
    "what is dls method in cricket",
    "dls target meaning",
    "duckworth lewis stern method explained",
    "dls method for beginners",
    "why dls target changes",
    "dls overs and wickets",
    "does box cricket use dls",
  ],
  cta: { href: "/tools/cricket-nrr-calculator", label: "Work out net run rate" },
  blocks: [
    {
      type: "p",
      text: "The DLS method resets the target in a limited-overs match when rain or another stoppage cuts the game short. DLS stands for Duckworth-Lewis-Stern. The DLS target on the TV graphic is the score the chasing side needs to win, worked out from the overs and wickets each side had left, not from the overs alone.",
    },
    {
      type: "p",
      text: "Frank Duckworth and Tony Lewis built the original method. It was first used in international cricket in early 1997. In November 2014 it was revised under Professor Steven Stern and took his name. His 2016 paper describes that revision as a way to handle the very high scoring rates now common in limited-overs cricket, especially in T20. ICC playing conditions call this the Stern edition, and say the revised target is computed with the ICC Duckworth-Lewis-Stern calculator.",
    },
    {
      type: "p",
      text: "The number on your screen is that calculator's output. This page explains the idea in a few minutes. It does not include the official resource table, and it will not give you a target for a real match.",
    },

    { type: "h2", text: "What does the DLS target mean?" },
    {
      type: "p",
      text: "In a full match the chasing side must score one more run than the side that batted first. When overs are lost, that simple total is no longer a fair comparison, because the two sides did not have the same chance to score. The DLS target is the revised score the chasing side needs in the match that is actually left.",
    },
    {
      type: "callout",
      title: "Two resources, not just the clock",
      text: "A batting side has overs still to play, and wickets in hand. The ICC's note on the method says these resources are not in direct proportion to the number of overs, which is what an old average-run-rate cut assumed. They depend on how many overs are left and how many wickets are down when play stops.",
    },
    {
      type: "p",
      text: "Ten overs with all ten wickets is a different chance from ten overs with two wickets left, because a side that still has wickets can attack. A full 50-over innings starts at 100% of the resources. That is the scale in the ICC note. A match that was always shorter, such as a T20, starts below 100% on that same scale. The exact percentages used on TV are not printed here.",
    },
    {
      type: "dls-resources",
      caption: "Drag either slider. More overs left, or more wickets in hand, means more resources.",
      defaults: { oversLeft: 20, wicketsInHand: 10 },
    },

    { type: "h2", text: "How is the revised target worked out?" },
    {
      type: "p",
      text: "The usual picture on TV is a chase that has lost overs, so the chasing side has fewer resources than the side that batted first. For that case, the shape of the sum is:",
    },
    {
      type: "callout",
      title: "The teaching sum",
      text: "Revised target ≈ Team 1 score × (R2 ÷ R1) + 1. Team 1 is the side that batted first. R1 is the resource percentage they had. R2 is the resource percentage the chasing side has. Multiply, ignore anything after the decimal point, then add 1. That added run is the one needed to win. One run short of the target is a tie.",
    },
    {
      type: "p",
      text: "That is the teaching version of the sum in the ICC's written note, for the older Standard Edition, when R2 is less than R1. The Stern edition on television is done by the calculator, including a stoppage in the middle of an innings. Read the sum so the graphic makes sense. It is not a way to set a real target.",
    },

    { type: "h3", text: "A worked example with made-up numbers" },
    {
      type: "p",
      text: "Suppose Team 1 scored 180 in a full 50-over innings. A full 50-over innings starts at 100%, so R1 is 100. Pretend the stoppage leaves the chase with 73% of a full 50-over innings, so R2 is 73. The 73 is invented for this lesson. It is not a DLS figure, and it is not from any official table.",
    },
    {
      type: "p",
      text: "180 × (73 ÷ 100) = 131.4. Ignore the decimal and you have 131. Add 1. The teaching target is 132. One run short of that, 131, would be the tie score in this lesson.",
    },
    {
      type: "table",
      caption: "Made-up numbers for this lesson only. Not a DLS table, and not a target you can use.",
      columns: ["Step", "Figure"],
      rows: [
        ["Team 1 score", "180"],
        ["R1, a full 50-over innings", "100%"],
        ["R2, invented for this lesson", "73%"],
        ["180 × 73/100, decimal dropped", "131"],
        ["Teaching target, this lesson only", "132"],
      ],
    },
    {
      type: "p",
      text: "If rain ends the match during the chase, the score is compared with a par score. In the ICC's written method, par is the same sum without the added run. In this lesson that is 131. More than par and the chasing side is ahead, level is a tie, and less than par means they are behind. The par on a broadcast comes from the calculator too.",
    },
    {
      type: "p",
      text: "Sometimes the target goes up. That happens when the first innings was cut short, so the chasing side has more resources than Team 1 had. The chasing side knew the length of the innings and could bat for that length. The calculator sets the higher target. This page stays with the common case: the chase has fewer resources, and the target comes down.",
    },

    { type: "h2", text: "Why is cutting the target by overs wrong?" },
    {
      type: "p",
      text: "An overs-only cut is the old average run rate method. Lose 10 overs from a 50-over chase and take four-fifths of the score. The ICC note says the resources are not in that direct proportion. Overs later in an innings are not worth the same as overs at the start, and the wickets still in hand change what the remaining overs are worth.",
    },
    {
      type: "p",
      text: "Wickets matter more late. One wicket lost in the first over still leaves a long innings in which to rebuild. The same wicket with a few overs left takes away the chance to score quickly with wickets in hand, which is the part of the innings modern sides use hardest. Stern's revision was aimed at those high scoring rates, especially in T20. Keeping wickets late in a rain-affected chase changes the resources more than the same loss at the start.",
    },

    { type: "h2", text: "Does turf or box cricket use DLS?" },
    {
      type: "p",
      text: "Usually, no. A turf or box-cricket game is a booked slot with an agreed number of overs. If rain stops it, the group shortens the match, moves the slot, or splits what is left of the booking. You do not reset a target with DLS. Some formal matches on a full ground do, when their playing conditions say so. A Sunday cage game almost never does.",
    },
    {
      type: "p",
      text: "TapTurf's scorecard maker, tournament scorer and net run rate calculator do not apply DLS. They use the scores you type in. When two sides in a league finish level on points, those tools separate them with net run rate, which is a different sum from a DLS target.",
    },
    {
      type: "cta",
      text: "Level on points after a turf league? Net run rate is the separator, not DLS.",
      href: "/tools/cricket-nrr-calculator",
      label: "Open the NRR calculator",
    },
    {
      type: "cta",
      text: "After the match, turn the score into a card for the group.",
      href: "/tools/cricket-scorecard-maker",
      label: "Make a scorecard",
    },
    {
      type: "cta",
      text: "Running a small league on a turf? Keep the table here. It does not do DLS.",
      href: "/tools/cricket-tournament-scorer",
      label: "Open the tournament scorer",
    },

    {
      type: "faq",
      items: [
        {
          q: "What does DLS stand for?",
          a: "Duckworth-Lewis-Stern. Frank Duckworth and Tony Lewis built the original method, first used in international cricket in early 1997. Professor Steven Stern revised it in November 2014, and it took his name. International matches use that Stern edition.",
        },
        {
          q: "What is the DLS target on TV?",
          a: "It is the score the chasing side needs to win after a stoppage has cut the match. The official figure comes from the ICC Duckworth-Lewis-Stern calculator. It uses the overs and wickets each side had left, not the overs alone.",
        },
        {
          q: "Why not just reduce the score in proportion to the overs lost?",
          a: "Because the overs are not all worth the same, and wickets in hand change what the remaining overs are worth. The ICC's note on the method says the resources are not in direct proportion to the number of overs. An overs-only cut is the older average run rate method.",
        },
        {
          q: "Can a DLS target be higher than the first innings score?",
          a: "Yes. If the first innings was cut short, the chasing side can have more resources than the side that batted first, and the calculator can set a higher target. The common case on TV is the other way: the chase loses overs and the target comes down.",
        },
        {
          q: "Can I calculate a DLS target with this page?",
          a: "No. The bar is a lesson picture: more overs left, or more wickets in hand, means more of the innings is left. The 73% in the example is made up. This page has no official table and does not give a target. Real matches use the ICC calculator.",
        },
        {
          q: "Does box cricket or turf cricket use DLS?",
          a: "Usually not. A booked turf or box-cricket game uses the overs you agreed. If rain stops play, shorten the game, move it or split the slot. TapTurf's scorecard, tournament scorer and net run rate calculator do not apply DLS.",
        },
      ],
    },
    { type: "h2", text: "Sources" },
    {
      type: "sources",
      items: [
        {
          label: "ICC, Duckworth Lewis Stern",
          url: "https://www.icc-cricket.com/about/cricket/rules-and-regulations/duckworth-lewis-stern",
        },
        {
          label: "ICC playing conditions, Duckworth-Lewis methodology for re-calculating the target score in an interrupted match (Stern edition by calculator; written sum is the Standard Edition)",
          url: "https://images.icc-cricket.com/image/upload/prd/orlbya4cqyhqaceje3b2.pdf",
        },
        {
          label: "Steven E. Stern, The Duckworth-Lewis-Stern method: extending the Duckworth-Lewis methodology to deal with modern scoring rates, Journal of the Operational Research Society, 2016",
          url: "https://doi.org/10.1057/jors.2016.30",
        },
        {
          label: "Cricbuzz, Introducing Duckworth-Lewis-Stern method (2015 World Cup coverage)",
          url: "https://www.cricbuzz.com/cricket-news/69983/icc-cricket-world-cup-2015-introducing-duckworth-lewis-stern-method",
        },
      ],
      note: "The 73% in the example is made up for teaching. It is not an ICC resource percentage. No official DLS table is printed here. TapTurf's scorecard maker, tournament scorer and net run rate calculator were checked in the site code on 1 November 2026: none of them applies DLS.",
    },
  ],
};
