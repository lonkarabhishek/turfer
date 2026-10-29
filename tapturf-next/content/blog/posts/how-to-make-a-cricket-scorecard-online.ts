import type { Post } from "../types";

// Tool post: how to make a shareable cricket scorecard with the TapTurf
// scorecard maker. Chosen because Search Console (last 7 days to 28 Oct 2026)
// showed /tools/cricket-scorecard-maker with 145 impressions and no dedicated
// post. Tool facts checked against components/tools/ScorecardMaker.tsx,
// lib/cricket/nrr.ts (describeResult), lib/cricket/overs.ts and the live
// /tools/cricket-scorecard-maker page on 29 Oct 2026. Result wording from
// MCC Law 16.5.1 and 16.7.

export const post: Post = {
  slug: "how-to-make-a-cricket-scorecard-online",
  title: "How to Make a Cricket Scorecard Online, Free, in 3 Steps",
  description:
    "Enter both scores, check the result line and download a 1080 x 1080 PNG for the group chat. How the free TapTurf cricket scorecard maker works, step by step.",
  seoDescription:
    "Enter both scores, check the result line, download a 1080 x 1080 PNG for WhatsApp. How the free TapTurf cricket scorecard maker works, step by step.",
  hook: "Match over, group chat waiting. Turn the final score into a clean result card in under a minute.",
  category: "Guides",
  city: null,
  readMinutes: 4,
  publishedAt: "2026-10-29",
  coverEmoji: "🏏",
  heroImage: {
    url: "/blog/art/how-to-make-a-cricket-scorecard-online.svg",
    og: "https://www.tapturf.in/blog/art/how-to-make-a-cricket-scorecard-online.png",
    alt: "A square cricket result card reading Titans 71/5 in 6 overs against Strikers 63/4 in 6 overs, Titans won by 8 runs, next to three steps: enter scores, check the result, download or share",
  },
  keywords: [
    "cricket scorecard maker",
    "make cricket scorecard online",
    "cricket scorecard creator free",
    "cricket match result card",
    "box cricket scorecard",
    "share cricket score on whatsapp",
    "won by runs or wickets",
  ],
  cta: { href: "/tools/cricket-scorecard-maker", label: "Open the scorecard maker" },
  blocks: [
    {
      type: "p",
      text: "To make a cricket scorecard online, open the TapTurf cricket scorecard maker, type both team names with their runs, wickets and overs, pick who batted first, and tap Download PNG. The result line is worked out for you, and the card is a 1080 x 1080 image ready for WhatsApp. It is free, runs in your browser and needs no sign-up.",
    },
    {
      type: "p",
      text: "This is the short, shareable kind of scorecard: the one you post in the group after a box cricket game, not a ball-by-ball sheet. If you want every ball recorded, score the match live and let the scorer fill this card in at the end (more on that below).",
    },
    {
      type: "cta",
      text: "Type the scores, check the result, share the card.",
      href: "/tools/cricket-scorecard-maker",
      label: "Open the scorecard maker",
    },

    { type: "h2", text: "How do I make a cricket scorecard in 3 steps?" },
    {
      type: "ol",
      items: [
        "Enter both scores. For each team, type the name, then Runs, Wickets and Overs. Overs take the usual cricket form: 6 for six full overs, 5.3 for five overs and three balls. The digit after the point must be 0 to 5, because an over has six balls, and the page flags anything else.",
        "Check the result line. Pick who batted first, and the Result box fills in by itself, for example Titans won by 8 runs. Type over it if you want different wording.",
        "Download or share. Tap Download PNG to save the card. On phones that support it, a Share button sends the image straight to WhatsApp or any other app. Both buttons switch on once both team names and both scores are in.",
      ],
    },
    {
      type: "p",
      text: "There is also an optional Tournament or series field (for example Sunday Box League) that prints at the top of the card. Tap Add player of the match, venue and more to add up to four extra lines: Player of the match, Top scorer, Best bowler and Venue. The preview updates as you type, so what you see is what downloads.",
    },

    { type: "h2", text: "How does the scorecard maker work out the result?" },
    {
      type: "p",
      text: "It compares the two totals and uses who batted first. If the side batting first scored more, it won by the run difference. If the chasing side scored more, it won by wickets in hand, counted as 10 minus the wickets it lost. Equal totals show as Match tied.",
    },
    {
      type: "table",
      caption: "What the result line says for a few sample scores",
      columns: ["Batted first", "Chasing side", "Suggested result"],
      rows: [
        ["Titans 71/5 (6 ov)", "Strikers 63/4 (6 ov)", "Titans won by 8 runs"],
        ["Strikers 63/4 (6 ov)", "Titans 64/3 (5.2 ov)", "Titans won by 7 wickets"],
        ["Titans 58/6 (6 ov)", "Strikers 58/5 (6 ov)", "Match tied"],
      ],
    },
    {
      type: "p",
      text: "This follows the way the Laws of Cricket state a result. MCC Law 16.7 says a side batting last that wins without losing all its wickets wins by the number of wickets still to fall, and a side fielding last that wins, wins by runs. Law 16.5.1 says a match is a tie when all innings are complete and the scores are equal.",
    },
    {
      type: "callout",
      title: "Playing six or eight a side? Check the wickets margin",
      text: "The suggested line counts wickets in hand out of 10, as in an eleven-a-side game. In box cricket with fewer players, fewer wickets can fall, so a side that loses 3 wickets in a six-a-side chase has 2 left, not 7. Type the correct margin into the Result box before you download. If the chasing side lost no wickets, the line just says the team won, so add the margin yourself.",
    },

    { type: "h2", text: "What does the finished card look like?" },
    {
      type: "p",
      text: "The card is square and dark, with both teams and scores at the top, the result in a green band, and any extras you added listed underneath. It renders at 1080 by 1080 pixels so it stays readable after WhatsApp compresses it. The only branding is a small Made with TapTurf.in line at the bottom, and nothing you type is uploaded anywhere. The downloaded file is named after the match, for example titans-vs-strikers-scorecard.png.",
    },

    { type: "h2", text: "Can I make the card from a live-scored match?" },
    {
      type: "p",
      text: "Yes. If you scored the game ball by ball in the free live cricket scorer, tap Make the result card when the match is done. The scorecard maker opens with the teams, scores and result already filled in. Check it, change anything you like, then download or share. If your phone reloads the page after sharing, the card fills in again for up to an hour.",
    },
    {
      type: "p",
      text: "For the full walkthrough of live scoring and live links for friends who are not at the ground, read our guide to the free live cricket scorer and live scoreboard.",
    },
    {
      type: "cta",
      text: "Score every ball, then make the card in one tap.",
      href: "/blog/free-cricket-live-scorer-and-live-scoreboard",
      label: "Read the live scorer guide",
    },

    { type: "h2", text: "Which other free tools help on match day?" },
    {
      type: "ul",
      items: [
        "Before the game: split the group into fair sides with the cricket team generator, then settle bat or bowl with the online toss. Our online toss guide covers what the Laws say about the toss.",
        "During a league: enter each match in the cricket tournament scorer and the points table and net run rate update by themselves.",
        "After the game: make the result card here and post it in the group.",
      ],
    },
    {
      type: "cta",
      text: "Sort the teams before the toss.",
      href: "/tools/cricket-team-generator",
      label: "Open the team generator",
    },
    {
      type: "cta",
      text: "No coin at the ground? Settle bat or bowl in three taps.",
      href: "/blog/how-to-do-a-cricket-toss-online",
      label: "Read the online toss guide",
    },
    {
      type: "cta",
      text: "Need a ground for the next match?",
      href: "/sport/box-cricket",
      label: "Find a box cricket turf",
    },
    {
      type: "faq",
      items: [
        {
          q: "Is the TapTurf cricket scorecard maker free?",
          a: "Yes. It is free, runs in your phone or laptop browser, needs no account or app, and nothing you type is uploaded. The card carries a small Made with TapTurf.in line.",
        },
        {
          q: "How do I enter overs like five and a half?",
          a: "Cricket overs count balls, not decimals. Five overs and three balls is 5.3. The digit after the point must be 0 to 5, because an over has six balls.",
        },
        {
          q: "Why does the result say won by 7 wickets in a six-a-side game?",
          a: "The suggested line counts wickets in hand out of 10. With fewer players, fewer wickets can fall, so type the correct margin into the Result box before downloading.",
        },
        {
          q: "What size is the downloaded scorecard?",
          a: "A square PNG of 1080 by 1080 pixels, which stays sharp on WhatsApp, Instagram and group chats.",
        },
        {
          q: "Can the card be filled in automatically?",
          a: "Yes, if you score the match in the TapTurf live cricket scorer. Tap Make the result card at the end and the teams, scores and result carry over.",
        },
      ],
    },
    { type: "h2", text: "Sources" },
    {
      type: "sources",
      items: [
        { label: "MCC, Laws of Cricket, Law 16: The result (16.5.1 A Tie, 16.7 Statement of result)", url: "https://www.lords.org/mcc/the-laws/the-result" },
        { label: "TapTurf, Cricket Scorecard Maker (tool page, checked 29 October 2026)", url: "https://www.tapturf.in/tools/cricket-scorecard-maker" },
      ],
      note: "Tool behaviour checked on the live TapTurf scorecard maker page and its source on 29 October 2026.",
    },
  ],
};
