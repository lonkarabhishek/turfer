import type { Post } from "../types";

// Product update: TapTurf's free live scoring tools.
// Every feature below is taken from the live tool pages and their source
// (app/tools/cricket-live-scorer, app/tools/live-scoreboard), checked 21 Oct 2026.

export const post: Post = {
  slug: "free-cricket-live-scorer-and-live-scoreboard",
  title: "Free Live Cricket Scorer and Scoreboard for Turf Games",
  description:
    "Score box cricket ball by ball, or football, badminton, basketball and more point by point, on your phone for free. Share a live link so friends can follow the match.",
  seoDescription:
    "Score box cricket ball by ball, or football, badminton, basketball and more point by point, free on your phone. Share a live link so friends can follow.",
  hook: "Score your turf match on your phone for free, and send a live link so everyone not on the ground can follow it.",
  category: "Guides",
  city: null,
  readMinutes: 5,
  publishedAt: "2026-10-21",
  updatedAt: "2026-10-22",
  coverEmoji: "📲",
  keywords: [
    "free cricket live scorer",
    "box cricket scoring app",
    "live cricket score link",
    "turf cricket scorer",
    "live scoreboard app",
    "football live score app",
    "badminton score counter",
    "free scoreboard online",
  ],
  cta: { href: "/tools/cricket-live-scorer", label: "Open the live cricket scorer" },
  blocks: [
    {
      type: "p",
      text: "TapTurf now has two free scoring tools that run in your phone's browser: a Live Cricket Scorer for ball by ball box cricket scoring, and a Live Scoreboard for football, basketball, badminton, pickleball, tennis, table tennis, padel, volleyball and other games. Both can give you a live link, so friends who are not at the turf can follow the match as it happens.",
    },
    {
      type: "callout",
      title: "TLDR",
      text: "Both tools are free, need no app download, and you do not need an account to score. Cricket: one tap a ball, full scorecard, graphs and commentary. Other sports: one tap a point or goal, with each sport's rules built in. Turn on a live link (one login with Google or your phone) and send it on WhatsApp so others can watch the score update.",
    },
    {
      type: "stat-grid",
      items: [
        { value: "₹0", label: "Cost to use either tool", hint: "Free, no sign-up to score" },
        { value: "1 tap", label: "Per ball or point", hint: "Big, high contrast buttons" },
        { value: "8+", label: "Sports on the Live Scoreboard", hint: "Plus a custom mode for any game" },
        { value: "Live link", label: "For people watching", hint: "Shared on WhatsApp, no app needed" },
      ],
    },

    { type: "h2", text: "Live Cricket Scorer: box cricket, ball by ball", id: "live-cricket-scorer" },
    {
      type: "p",
      text: "Set the teams, overs and players, tap Start match, and score each ball with one tap on 0, 1, 2, 3, 4 or 6. Wides, no-balls, byes and leg byes take one more tap for the runs. When a wicket falls it asks how they got out and who comes in next. At the end of an over it asks who bowls next. Player names are optional, so you can start with Batter 1 and Bowler 1 and rename people later.",
    },
    {
      type: "ul",
      items: [
        "Live view: score, current and required run rate, batters with runs and balls, the bowler's figures, this over and the partnership.",
        "Full scorecard: dismissals, extras, fall of wickets, partnerships and bowling figures with maidens, wides and no-balls.",
        "Over by over list, a Manhattan chart, a worm chart comparing both innings, and ball by ball commentary.",
        "End of match: result, top scorer, best bowler and player of the match, plus a result card image for your group.",
        "House rules for box cricket: wide worth 0 or 1, no-ball worth 1 or 2, free hits on or off, overs per bowler limit, last man stands and a retire-at score.",
        "Undo and Redo for wrong taps, and every ball is saved in your browser, so a reload or a dead screen does not lose the match.",
      ],
    },
    {
      type: "cta",
      text: "Playing box cricket this week? Score it on your phone.",
      href: "/tools/cricket-live-scorer",
      label: "Try the Live Cricket Scorer",
    },

    { type: "h2", text: "Live Scoreboard: football, badminton, basketball and more", id: "live-scoreboard" },
    {
      type: "p",
      text: "The Live Scoreboard is for every other game you play at a turf or court. You tap once for each point or goal, and it follows the current rules of each sport, with common turf and club options a tap away.",
    },
    {
      type: "ul",
      items: [
        "Football and futsal: a match clock from kick off, goals with the minute recorded, penalties, own goals, optional yellow and red cards, and a penalty shootout if it is level.",
        "Badminton, table tennis, volleyball, pickleball, tennis and padel: tap the side that won the rally, and it tracks game and set points, deuce, who serves next and when to change ends.",
        "Basketball: quarters or halves on a countdown clock, or pickup games to 21, or 3x3, with team fouls, timeouts and the bonus.",
        "Any other game, such as kabaddi, frisbee or carrom: name it, choose the buttons, and play to a score or in halves.",
        "Undo and Redo, and every tap is saved in your browser.",
      ],
    },
    {
      type: "cta",
      text: "Football, badminton or a game your group made up? Keep score here.",
      href: "/tools/live-scoreboard",
      label: "Try the Live Scoreboard",
    },

    { type: "h2", text: "How friends can follow a match live", id: "follow-live" },
    {
      type: "p",
      text: "This is the part that helps the people who are not on the ground. The person scoring turns on a live link and sends it to the group. Others open it in their browser, with no app to install.",
    },
    {
      type: "ol",
      items: [
        "The scorer turns on a live link while setting up the match, or later from Share live score. This needs one login, with Google or a phone number.",
        "The scorer sends the link to the group, for example on WhatsApp.",
        "Anyone with the link sees the score as soon as they open it. A quick login keeps it updating as the scorer taps.",
        "Cricket followers can see the score, scorecard, overs, graphs and commentary. On the Live Scoreboard, followers see the score, clock, sets, timeline and stats, and an eye icon next to LIVE shows how many people are watching.",
        "The scorer can turn the link off any time. Only that match is uploaded.",
      ],
    },
    {
      type: "p",
      text: "If you do not want a live link, Share live score also sends a WhatsApp-ready text update with the current score. Without a live link, the match stays on the phone you scored on. The TapTurf privacy policy explains what a live link shares and for how long.",
    },

    {
      type: "cta",
      text: "Coming from CricHeroes? See how the two compare for casual turf cricket, and where CricHeroes is better.",
      href: "/blog/ad-free-cricket-scorer-cricheroes-alternative",
      label: "Read: ad-free scorer vs CricHeroes",
    },

    { type: "h2", text: "Who it is for", id: "who-it-is-for" },
    {
      type: "p",
      text: "Weekend box cricket groups who argue about the score, organisers running a small turf tournament, parents and friends who could not make it to the ground, and anyone who wants a proper scorecard at the end of a game. It is built for turf games in Nashik, Pune and anywhere else in India, and works in bright sunlight with large buttons.",
    },
    {
      type: "faq",
      items: [
        {
          q: "Are the TapTurf scoring tools really free?",
          a: "Yes. Both the Live Cricket Scorer and the Live Scoreboard are free to use, and you do not need an account to score a match.",
        },
        {
          q: "Do I need to download an app?",
          a: "No. Both tools work in your phone's browser, and people following a live link also open it in the browser.",
        },
        {
          q: "Can people watch the match without being at the turf?",
          a: "Yes, if the scorer turns on a live link and shares it. Followers see the score when they open the link, and a quick login keeps it updating as the match goes on.",
        },
        {
          q: "What happens if my phone dies mid-match?",
          a: "Every ball or point is saved in your browser as you score. Open the page again on the same phone and the match carries on.",
        },
      ],
    },
    {
      type: "cta",
      text: "Booked a turf for the weekend? Find one near you, then score the match on TapTurf.",
      href: "/turfs",
      label: "Find a turf",
    },
  ],
};
