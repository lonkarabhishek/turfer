import type { Post } from "../types";

// Tool post: how to do a fair cricket toss, and how the TapTurf toss tool works.
// Tool facts checked against components/tools/CricketToss.tsx and the live
// /tools/cricket-toss page on 27 Oct 2026. Toss law facts from MCC Law 13.4
// and 13.5 and ICC Men's T20I Playing Conditions 13.4 and 13.5.

export const post: Post = {
  slug: "how-to-do-a-cricket-toss-online",
  title: "How to Do a Cricket Toss Online: 3 Steps for a Fair Toss",
  description:
    "No coin at the turf? Call heads or tails, flip and pick bat or bowl in three taps. How a fair cricket toss works, what the Laws say, and a free online toss tool.",
  seoDescription:
    "No coin at the turf? Call heads or tails, flip and pick bat or bowl in three taps. How a fair toss works, what the Laws say, and a free toss tool.",
  hook: "No coin, two captains, one argument. Here is how to settle the toss in three taps, and what the Laws of Cricket say about it.",
  category: "Guides",
  city: null,
  readMinutes: 4,
  publishedAt: "2026-10-27",
  coverEmoji: "🪙",
  heroImage: {
    url: "/blog/art/how-to-do-a-cricket-toss-online.svg",
    og: "https://www.tapturf.in/blog/art/how-to-do-a-cricket-toss-online.png",
    alt: "Card showing a coin with heads and tails and three steps for an online cricket toss: call it, flip it, pick bat or bowl",
  },
  keywords: [
    "cricket toss online",
    "online toss for cricket",
    "how to do a cricket toss",
    "coin toss online heads or tails",
    "toss coin for box cricket",
    "cricket toss rules",
    "who chooses bat or bowl after toss",
  ],
  cta: { href: "/tools/cricket-toss", label: "Open the cricket toss" },
  blocks: [
    {
      type: "p",
      text: "To do a fair cricket toss online, open the TapTurf cricket toss, let one captain call heads or tails, tap Flip coin, and the captain who wins chooses to bat or bowl. It is free, works on a phone, and needs no sign-up or app.",
    },
    {
      type: "p",
      text: "Most box cricket and turf games start the same way: ten players ready, the slot clock running, and nobody has a coin. Someone flips a bottle cap, someone else says it did not count, and five minutes of your paid hour are gone. A toss on a phone that both captains can watch ends that.",
    },
    {
      type: "cta",
      text: "Call it, flip it, pick bat or bowl. Works one-handed at the ground.",
      href: "/tools/cricket-toss",
      label: "Open the cricket toss",
    },

    { type: "h2", text: "How to toss online in 3 steps" },
    {
      type: "ol",
      items: [
        "Call it. The calling captain taps Heads or Tails. If you tap Flip coin before calling, the page asks you to call first.",
        "Flip it. Tap Flip coin and the coin spins and lands. The result says plainly whether the call won or lost.",
        "Pick bat or bowl. If the call won, tap Bat or Bowl and the screen shows the choice, so there is no argument later. If it lost, the other side decides.",
      ],
    },
    {
      type: "p",
      text: "Show the screen to the other captain before and after the flip. Tap New toss for the next match. Nothing is saved and nobody needs an account. There is an optional coin sound, off by default, behind the speaker button.",
    },

    { type: "h2", text: "Is an online toss fair?" },
    {
      type: "p",
      text: "Yes, if the result is random and both captains see it. The TapTurf toss picks heads or tails using the browser's cryptographic random number generator where it is available, and falls back to the standard browser random function otherwise. The result is decided before the coin animation starts, and each flip is independent of the last, so a run of three heads says nothing about the next one.",
    },
    {
      type: "callout",
      title: "A simple rule for fairness",
      text: "Agree who calls before anyone touches the phone. A common habit is that the home or booking side flips and the visiting side calls. That is custom, not a Law, so settle it in the group chat if it matters.",
    },

    { type: "h2", text: "What the Laws of Cricket say about the toss" },
    {
      type: "p",
      text: "Law 13.4 of the MCC Laws of Cricket says the captains toss a coin for the choice of innings, on the field of play, in the presence of one or both umpires, not earlier than 30 minutes and not later than 15 minutes before the scheduled start. Law 13.5 says the captain who wins decides whether to bat or field, tells the other captain and the umpires, and cannot change that decision once notified.",
    },
    {
      type: "p",
      text: "The ICC Men's T20I Playing Conditions use the same 30 to 15 minute window, with the toss supervised by the ICC Match Referee, and the same rule that the decision cannot be changed. Your Sunday turf game has no referee, but two habits carry over well: toss a few minutes before your slot starts so you do not waste paid time, and treat the winner's bat or bowl choice as final.",
    },
    {
      type: "table",
      caption: "The toss: international cricket compared with a turf game",
      columns: ["", "Laws and ICC conditions", "On a turf"],
      rows: [
        ["When", "30 to 15 minutes before start", "Just before your slot, while teams warm up"],
        ["Who watches", "Umpire or ICC Match Referee", "Both captains look at the same screen"],
        ["Who decides", "Captain who wins the toss", "Captain who wins the toss"],
        ["Can it change", "No, once notified", "Agree it is final before you flip"],
      ],
    },

    { type: "h2", text: "Bat or bowl first on a turf?" },
    {
      type: "p",
      text: "There is no single right answer. Batting second lets you chase a known target, which helps in short games where every over counts. Batting first under lights can be easier before evening dew makes the ball wet. Look at the surface, the light and your own side, then decide.",
    },

    { type: "h2", text: "Before the toss: make the teams" },
    {
      type: "p",
      text: "If you are splitting a group of friends, sort the sides first. The cricket team generator takes a list of names and splits them into 2, 3 or 4 teams at random, or balanced by a quick 1 to 5 rating. After the match, the cricket scorecard maker at /tools/cricket-scorecard-maker turns your score into a card you can share in the group.",
    },
    {
      type: "cta",
      text: "Split your group into fair sides before the toss.",
      href: "/tools/cricket-team-generator",
      label: "Open the team generator",
    },
    {
      type: "cta",
      text: "Make a shareable scorecard after the match, or see every free tool.",
      href: "/tools",
      label: "See all TapTurf tools",
    },
    {
      type: "cta",
      text: "Teams ready and captains at the crease? Settle it in one tap.",
      href: "/tools/cricket-toss",
      label: "Flip the coin now",
    },
    {
      type: "faq",
      items: [
        {
          q: "Is an online cricket toss fair?",
          a: "Yes, if the result is random and both captains watch it. The TapTurf toss picks heads or tails with the browser's cryptographic random number generator where available, decides the result before the coin animation starts, and each flip is independent of the last.",
        },
        {
          q: "When should the toss happen?",
          a: "Under MCC Law 13.4, between 30 and 15 minutes before the scheduled start. On a turf, toss just before your slot so you do not lose paid time.",
        },
        {
          q: "Who chooses to bat or bowl, and is it better to bat first?",
          a: "The captain who wins the toss chooses, and under MCC Law 13.5 the decision cannot be changed once announced. There is no single right answer: batting second gives you a known target, and batting first under lights can be easier before evening dew.",
        },
        {
          q: "Do I need an account or an app?",
          a: "No. The toss works in your phone's browser with no sign-up and no install. Nothing is saved.",
        },
        {
          q: "Can I share the toss result?",
          a: "The toss has no share button. Show the screen to the other captain, or take a screenshot and post it in your group chat.",
        },
      ],
    },
    {
      type: "sources",
      items: [
        { label: "MCC, Laws of Cricket 2017 Code, 4th Edition (2026), Law 13: Innings", url: "https://www.lords.org/mcc/the-laws/innings" },
        { label: "ICC Men's Twenty20 International Playing Conditions, clauses 13.4 and 13.5 (October 2026)", url: "https://www.icc-cricket.com/about/cricket/rules-and-regulations/playing-conditions" },
        { label: "ICC, Men's ODI Match Clause 13: Innings", url: "https://www.icc-cricket.com/news/mens-odi-match-clause-13-innings" },
      ],
      note: "Tool behaviour checked on the live TapTurf cricket toss page on 27 October 2026.",
    },
  ],
};
