import type { Post } from "../types";

// Tool post: how to split players into fair cricket teams with the TapTurf
// team generator. Chosen because Search Console (export to 28 Oct 2026)
// showed /tools/cricket-team-generator with 101 impressions, 10 clicks at
// about position 6 and no dedicated post. Tool facts checked against
// components/tools/TeamGenerator.tsx (splitTeams, name parsing, copy text)
// and the live /tools/cricket-team-generator page on 30 Oct 2026.

export const post: Post = {
  slug: "how-to-split-cricket-teams-fairly",
  title: "How to Split Cricket Teams Fairly: Random or Balanced, Free",
  description:
    "Paste the names, pick 2, 3 or 4 teams, and split them at random or balanced by a 1 to 5 rating. How the free TapTurf cricket team generator works, step by step.",
  seoDescription:
    "Paste names, pick 2, 3 or 4 teams, split at random or balanced by a 1 to 5 rating, then copy to WhatsApp. How the free TapTurf team generator works.",
  hook: "Ten players at the turf, two captains arguing. Split the sides in under a minute and get on with the game.",
  category: "Guides",
  city: null,
  readMinutes: 4,
  publishedAt: "2026-10-30",
  coverEmoji: "🏏",
  heroImage: {
    url: "/blog/art/how-to-split-cricket-teams-fairly.svg",
    og: "https://www.tapturf.in/blog/art/how-to-split-cricket-teams-fairly.png",
    alt: "Two team cards from the TapTurf cricket team generator, Team 1 and Team 2 with five players each and 16 points each, next to three steps: paste names, pick teams and mode, generate and copy",
  },
  keywords: [
    "cricket team generator",
    "split cricket teams",
    "random team generator cricket",
    "balanced team generator",
    "how to divide players into teams",
    "box cricket teams",
    "team picker for turf match",
  ],
  cta: { href: "/tools/cricket-team-generator", label: "Open the team generator" },
  blocks: [
    {
      type: "p",
      text: "To split cricket teams fairly, open the TapTurf cricket team generator, paste the player names one per line, choose 2, 3 or 4 teams, and tap Generate teams. Random mode shuffles everyone and deals them out evenly. Balanced mode lets you rate each player from 1 to 5 and spreads the strong and the new across the sides. It is free, runs in your browser and needs no sign-up.",
    },
    {
      type: "p",
      text: "It is built for the usual turf problem: the same two friends always end up together, captains take ten minutes to pick, and the match is over in four overs. A neutral split settles that before the toss.",
    },
    {
      type: "cta",
      text: "Paste the names, pick the teams, copy them to the group.",
      href: "/tools/cricket-team-generator",
      label: "Open the team generator",
    },

    { type: "h2", text: "How do I split players into teams in 3 steps?" },
    {
      type: "ol",
      items: [
        "Paste the names. Type or paste the players, one per line. Commas also work, so a list copied from WhatsApp like Rohan, Omkar, Akash is fine. Repeated names are dropped (Rohan and rohan count once), and the list takes up to 40 players.",
        "Pick the number of teams and the mode. Choose 2, 3 or 4 teams, then Random or Balanced. You need at least as many players as teams, and the counter under the box tells you if you are short.",
        "Generate and copy. Tap Generate teams to see the sides, Regenerate for a fresh split, and Copy teams to put them on your clipboard as Team 1: names, Team 2: names, ready to paste into the group.",
      ],
    },
    {
      type: "p",
      text: "If the box is empty, Try the sample fills it with ten names so you can see how it works before typing your own squad.",
    },

    { type: "h2", text: "Should I use Random or Balanced mode?" },
    {
      type: "p",
      text: "Use Random for a casual game where nobody wants to be judged. Every name is shuffled and dealt out in turn, so no captain picked the sides. Use Balanced when the same lopsided match keeps happening. You give each player a quick rating from 1 to 5 (everyone starts at 3), and the generator sorts the players strongest first and deals them in snake order: 1, 2, then 2, 1, then 1, 2 for two teams. Each team card shows its total so you can see the sides are close.",
    },
    {
      type: "table",
      caption: "A sample Balanced split: 10 players, 2 teams, ratings 5, 5, 4, 4, 3, 3, 3, 2, 2, 1",
      columns: ["Pick order", "Rating goes to", "Running total"],
      rows: [
        ["Picks 1 and 2", "5 to Team 1, 5 to Team 2", "5 and 5"],
        ["Picks 3 and 4", "4 to Team 2, 4 to Team 1", "9 and 9"],
        ["Picks 5 and 6", "3 to Team 1, 3 to Team 2", "12 and 12"],
        ["Picks 7 and 8", "3 to Team 2, 2 to Team 1", "14 and 15"],
        ["Picks 9 and 10", "2 to Team 1, 1 to Team 2", "16 and 16"],
      ],
    },
    {
      type: "p",
      text: "Players with the same rating are shuffled before the deal, so tapping Regenerate in Balanced mode changes who plays with whom while the team totals stay the same. In Random mode, every Regenerate is a completely new shuffle.",
    },
    {
      type: "callout",
      title: "Ratings are a rough guide, not a ranking",
      text: "A 1 to 5 rating cannot tell a strong bowler from a strong batter. If one side ends up with all the bowlers, swap a pair by hand after copying, or simply tap Regenerate. Nobody else sees the ratings unless you show them.",
    },

    { type: "h2", text: "What happens with an odd number of players?" },
    {
      type: "p",
      text: "The generator never leaves anyone out. With an uneven count, some teams get one extra player: 9 players into 2 teams gives 5 and 4, and 10 players into 3 teams gives 4, 3 and 3. In Random mode the extra player goes to the first team. In Balanced mode the snake order decides which team gets the extra player, so check the player count shown on each team card. If the sides end up uneven, agree before the toss how the smaller side will bat and field.",
    },

    { type: "h2", text: "Does the team generator save my players?" },
    {
      type: "p",
      text: "No. The names stay on your phone or laptop and nothing is stored, so you paste the list again next time. Keeping the squad in a pinned WhatsApp message makes that quick.",
    },

    { type: "h2", text: "What should I do after the teams are set?" },
    {
      type: "ul",
      items: [
        "Settle bat or bowl with the online cricket toss. Our toss guide covers what the Laws say about it.",
        "Score the match ball by ball in the free live cricket scorer, and share a live link with friends who are not at the ground.",
        "Post the final result in the group with the cricket scorecard maker.",
        "Playing a series between three or four teams? Enter each match in the cricket tournament scorer and the points table and net run rate update by themselves.",
      ],
    },
    {
      type: "cta",
      text: "Teams sorted? Settle bat or bowl in three taps.",
      href: "/blog/how-to-do-a-cricket-toss-online",
      label: "Read the online toss guide",
    },
    {
      type: "cta",
      text: "Turn the final score into a result card for the group.",
      href: "/blog/how-to-make-a-cricket-scorecard-online",
      label: "Read the scorecard guide",
    },
    {
      type: "cta",
      text: "Need a ground for the match?",
      href: "/sport/box-cricket",
      label: "Find a box cricket turf",
    },
    {
      type: "faq",
      items: [
        {
          q: "Is the TapTurf cricket team generator free?",
          a: "Yes. It is free, runs in your phone or laptop browser, and needs no account or app. Nothing you type is stored.",
        },
        {
          q: "How many players and teams can it handle?",
          a: "Up to 40 player names, split into 2, 3 or 4 teams. You need at least as many players as teams.",
        },
        {
          q: "How does Balanced mode make teams fair?",
          a: "You rate each player from 1 to 5. Players are sorted strongest first and dealt in snake order, so each team gets a similar total, which is shown on its card.",
        },
        {
          q: "Can I paste names copied from WhatsApp?",
          a: "Yes. Put one name per line or separate them with commas. Repeated names are counted once, ignoring capital letters.",
        },
        {
          q: "Can I use it for football or other sports?",
          a: "Yes. The split works for any sport where you divide a group into 2 to 4 sides, such as a five-a-side football game on a turf.",
        },
      ],
    },
    { type: "h2", text: "Sources" },
    {
      type: "sources",
      items: [
        { label: "TapTurf, Cricket Team Generator (tool page, checked 30 October 2026)", url: "https://www.tapturf.in/tools/cricket-team-generator" },
        { label: "Wikipedia, Fisher-Yates shuffle (the unbiased shuffle Random mode is based on)", url: "https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle" },
      ],
      note: "Tool behaviour checked on the live TapTurf team generator page and its source on 30 October 2026.",
    },
  ],
};
