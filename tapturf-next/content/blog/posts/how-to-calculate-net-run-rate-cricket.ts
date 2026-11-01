import type { Post } from "../types";

// Tool post: how net run rate works and how to work it out with the
// TapTurf NRR calculator and tournament scorer. Chosen because Search
// Console (export to 21 Oct 2026) showed /tools/cricket-nrr-calculator with
// 17 impressions, 0 clicks at about position 7 and no dedicated post.
// Formula and all-out rule checked against the ICC Men's T20I Playing
// Conditions (effective October 2026, clause 16.10.2) and the ICC Men's T20
// World Cup 2026 Playing Conditions (clause 16.10.7), both opened on
// 1 Nov 2026. Worked example computed with lib/cricket/nrr.ts
// (computeStandings, oversPerSide 6), the code behind both tools.

export const post: Post = {
  slug: "how-to-calculate-net-run-rate-cricket",
  title: "How to Calculate Net Run Rate in Cricket, With Examples",
  description:
    "NRR is runs scored per over minus runs conceded per over, totalled across the tournament. The ICC formula, the all-out rule and a worked turf league example.",
  seoDescription:
    "NRR is runs per over scored minus runs per over conceded, totalled across the tournament. The ICC formula, the all-out rule and a worked 6-over example.",
  hook: "Two teams level on points and one place in the final. Work out net run rate correctly before the argument starts.",
  category: "Guides",
  city: null,
  readMinutes: 5,
  publishedAt: "2026-11-01",
  coverEmoji: "🏏",
  heroImage: {
    url: "/blog/art/how-to-calculate-net-run-rate-cricket.svg",
    og: "https://www.tapturf.in/blog/art/how-to-calculate-net-run-rate-cricket.png",
    alt: "Net run rate formula, runs scored divided by overs faced minus runs conceded divided by overs bowled, next to a 6-over tri-series table: Warriors 4 points +1.321, Titans 2 points +0.226, Strikers 0 points -1.530",
  },
  keywords: [
    "how to calculate net run rate",
    "net run rate formula",
    "nrr calculator",
    "how to calculate nrr in cricket",
    "net run rate all out rule",
    "box cricket points table",
    "cricket tournament nrr",
  ],
  cta: { href: "/tools/cricket-nrr-calculator", label: "Open the NRR calculator" },
  blocks: [
    {
      type: "p",
      text: "To calculate net run rate (NRR), divide the total runs a team has scored by the total overs it has faced, then subtract the total runs scored against it divided by the total overs it has bowled. Add up runs and overs across every counted match first and divide once. If a team is bowled out, count the full quota of overs it was entitled to, not the overs it lasted. The free TapTurf NRR calculator does the sum for one match, and the tournament scorer keeps it for a whole league.",
    },
    {
      type: "p",
      text: "That is how the ICC defines it in its current playing conditions, and most local tournaments copy the same rule. The two places people go wrong at the turf are overs like 5.3 and teams that were all out early. Both are covered below with real numbers.",
    },
    {
      type: "cta",
      text: "Enter runs and overs for both sides and get NRR straight away.",
      href: "/tools/cricket-nrr-calculator",
      label: "Open the NRR calculator",
    },

    { type: "h2", text: "What is the net run rate formula?" },
    {
      type: "p",
      text: "NRR = (total runs scored / total overs faced) minus (total runs conceded / total overs bowled). The ICC Men's T20I Playing Conditions put it as the average runs per over scored by a team throughout the competition, minus the average runs per over scored against it. A positive number means the team has scored faster than its opponents. NRR is usually shown to three decimal places, like +1.321.",
    },
    {
      type: "p",
      text: "For one match, take the tool page example: your team makes 63 in 6 overs (10.50 an over) and the opponent makes 54 in 6 overs (9.00 an over). Your NRR from that match is +1.500 and theirs is -1.500.",
    },

    { type: "h2", text: "How do I count overs like 5.3 in NRR?" },
    {
      type: "p",
      text: "Convert overs to balls first. 5.3 overs means five overs and three balls, which is 33 balls, or 5.5 overs of six. So 55 runs in 5.3 overs is a run rate of 10.00, not 10.38 as a plain decimal division would suggest. The digit after the point can only be 0 to 5, so 5.6 is not a valid overs figure. The TapTurf calculator reads overs the cricket way and rejects invalid entries.",
    },

    { type: "h2", text: "What happens to NRR when a team is all out?" },
    {
      type: "p",
      text: "If a team is bowled out before its overs run out, its NRR uses the full quota of overs it was entitled to, not the overs in which it was dismissed. Both the ICC Men's T20I Playing Conditions and the T20 World Cup 2026 Playing Conditions say this in the same words. In a 6-over turf match, a side bowled out for 48 in 4.2 overs counts as 48 in 6 overs. The rule works both ways: it lowers that team's own run rate and lowers the run rate conceded by the side that bowled it out.",
    },
    {
      type: "callout",
      title: "Set the overs a side before you start",
      text: "In the TapTurf tournament scorer, open Points and overs settings and fill in Overs a side. Only then does each innings show an All out tick box that counts the full quota for NRR. Leave it blank and the scorer uses the overs actually faced.",
    },

    { type: "h2", text: "How is NRR worked out over a whole tournament?" },
    {
      type: "p",
      text: "Here is a made-up 6-over tri-series between three turf teams, with 2 points for a win. Match 1: Titans 63/4 in 6 overs beat Strikers 54/7 in 6. Match 2: Strikers 48 all out in 4.2 overs, Warriors 49/3 in 5.1 overs. Match 3: Titans 58/5 in 6 overs, Warriors 61/2 in 5.4 overs.",
    },
    {
      type: "table",
      caption: "Totals across all three matches, with Strikers' all-out innings counted as 6 overs",
      columns: ["Team", "Pts", "Runs scored / overs faced", "Runs conceded / overs bowled", "NRR"],
      rows: [
        ["Warriors", 4, "110 / 10.5 (10.154)", "106 / 12.0 (8.833)", "+1.321"],
        ["Titans", 2, "121 / 12.0 (10.083)", "115 / 11.4 (9.857)", "+0.226"],
        ["Strikers", 0, "102 / 12.0 (8.500)", "112 / 11.1 (10.030)", "-1.530"],
      ],
    },
    {
      type: "p",
      text: "Overs in the table are in cricket notation: 10.5 is ten overs and five balls (65 balls), 11.4 is 70 balls and 11.1 is 67 balls. The run rates in brackets come from dividing by balls and multiplying by six.",
    },
    {
      type: "p",
      text: "Two shortcuts give the wrong answer. Averaging each match's NRR gives Warriors +1.291, Titans +0.201 and Strikers -1.492, close but not the same, and the gap grows when matches are of different lengths. Ignoring the all-out rule is far worse: count Strikers' 4.2 overs as faced and Warriors drop from +1.321 to -0.104, which could flip a tie on points.",
    },

    { type: "h2", text: "Which matches are left out of NRR?" },
    {
      type: "ul",
      items: [
        "No result. Under ICC rules only matches with a result count, so a washed-out game adds nothing to either side's NRR. The TapTurf tournament scorer leaves no-result matches out and gives both teams the no-result points.",
        "Super Overs. The T20 World Cup 2026 Playing Conditions say the Super Over is not included in NRR, so only the main innings count.",
        "Rain-shortened games. Under the ICC conditions, a result reached with Duckworth/Lewis/Stern is entered using par or target scores from the official calculation. Local turf leagues rarely use DLS, so agree a simple rule before the first match.",
      ],
    },
    {
      type: "p",
      text: "The TapTurf tournament scorer counts a tied match, where both sides make the same score, in NRR like any other game. If your league has its own rules, follow them; organisers can and do set different ones.",
    },

    { type: "h2", text: "How do I keep a points table with NRR for my league?" },
    {
      type: "ol",
      items: [
        "Open the cricket tournament scorer and pick Bilateral series, Tri-series or Round robin (up to ten teams).",
        "Name the teams, then open Points and overs settings to set points for a win, tie and no result, and the overs a side.",
        "After each game, enter runs, wickets and overs for both sides, tick All out where needed, and save. The table sorts by points, then NRR, then wins.",
      ],
    },
    {
      type: "cta",
      text: "Running a league this weekend? Let the table and NRR update by themselves.",
      href: "/tools/cricket-tournament-scorer",
      label: "Open the tournament scorer",
    },
    {
      type: "cta",
      text: "Score each match ball by ball and send the result card to the group.",
      href: "/blog/how-to-make-a-cricket-scorecard-online",
      label: "Read the scorecard guide",
    },
    {
      type: "cta",
      text: "Splitting players for a league? Make the sides fair first.",
      href: "/blog/how-to-split-cricket-teams-fairly",
      label: "Read the team split guide",
    },
    {
      type: "cta",
      text: "Need a ground for the matches?",
      href: "/sport/box-cricket",
      label: "Find a box cricket turf",
    },
    {
      type: "faq",
      items: [
        {
          q: "What is a good net run rate?",
          a: "Anything above zero means a team has scored faster than its opponents. In a short turf league, a margin of a few runs an over in one match can move NRR by more than 1, so one big win can settle a tie on points.",
        },
        {
          q: "Is NRR the average of each match's net run rate?",
          a: "No. Add up all runs and overs across the counted matches first, then divide once. Averaging match NRRs gives a slightly different and wrong figure.",
        },
        {
          q: "Do I use overs faced or the full overs when a team is all out?",
          a: "The full quota. Under the ICC playing conditions, a team bowled out early is counted as having faced all the overs it was entitled to, for example 6 overs in a 6-over match.",
        },
        {
          q: "Does a chasing team that wins early get the full overs?",
          a: "No. The all-out rule only applies to a side that is bowled out. A team that reaches its target in 5.1 overs is counted at 5.1 overs, which helps its run rate.",
        },
        {
          q: "Is the TapTurf NRR calculator free?",
          a: "Yes. It is free, runs in your browser and needs no sign-up. It handles cricket overs like 5.3 correctly.",
        },
      ],
    },
    { type: "h2", text: "Sources" },
    {
      type: "sources",
      items: [
        { label: "ICC, Men's T20I Playing Conditions, effective October 2026, clause 16.10.2 Net run rate (confirmed, opened 1 November 2026)", url: "https://images.icc-cricket.com/image/upload/prd/bsxcho7ufe2pjban0wjp.pdf" },
        { label: "ICC, Men's T20 World Cup 2026 Playing Conditions, clause 16.10.7 Net run rate (confirmed, opened 1 November 2026)", url: "https://images.icc-cricket.com/image/upload/prd/yyt7m8uh9c1uehrbvuwb.pdf" },
        { label: "TapTurf, Cricket NRR Calculator (tool page, checked 1 November 2026)", url: "https://www.tapturf.in/tools/cricket-nrr-calculator" },
        { label: "TapTurf, Cricket Tournament Scorer (tool page, checked 1 November 2026)", url: "https://www.tapturf.in/tools/cricket-tournament-scorer" },
      ],
      note: "The formula, the all-out rule, the no-result rule and the Super Over exclusion are quoted from the ICC documents above. The tri-series is a made-up example, worked out with the same code that runs the TapTurf tools.",
    },
  ],
};
