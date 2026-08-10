import type { Post } from "../types";

export const post: Post = {
  slug: "beginners-guide-box-cricket",
  title: "A Beginner's Guide to Box Cricket in India",
  description:
    "Everything a first-timer needs to know about box cricket in India, format, gear, rules, how to book, and how to not embarrass yourself in the first over.",
  hook: "First box cricket game? Here's how to walk in like you've done this a hundred times.",
  category: "Guides",
  city: null,
  readMinutes: 6,
  publishedAt: "2026-08-08",
  coverEmoji: "📦",
  keywords: [
    "box cricket beginners",
    "box cricket rules india",
    "box cricket how to play",
    "box cricket format",
    "first time box cricket",
  ],
  blocks: [
    {
      type: "p",
      text: "Box cricket is the format that's quietly taken over India's weekends. Compact, fast, floodlit, walkable-to for most city players. If your first invite has just landed in your WhatsApp, here's the friendly walkthrough.",
    },

    { type: "h2", text: "What actually is box cricket" },
    {
      type: "p",
      text: "Cricket played on a small synthetic-turf pitch, roughly 60x30 metres, enclosed by walls or high nets on all four sides. 6-a-side is standard, 5–6 overs per innings, whole match wraps in 60–90 minutes. The compact space and enclosed boundaries make for a fast, high-scoring game with much less standing around than full-format cricket.",
    },

    { type: "h2", text: "The basic rules" },
    {
      type: "ul",
      items: [
        "6 players a side. Some turfs allow 7 or 8; agree before you start.",
        "5–6 overs per innings. Every bowler bowls one over max.",
        "Ball off the back wall = 1 run. Side walls = 2. Straight boundary hit = 4. Over the roof / netting on the full = 6.",
        "One-tip-one-hand catches are usually valid, a fielder catching the ball after one bounce with one hand counts.",
        "No LBW. Pitch is too short and there's no umpire making that call.",
        "Wide and no-ball same as regular cricket. Free hit after a no-ball.",
      ],
    },

    { type: "h2", text: "The gear you actually need" },
    {
      type: "ul",
      items: [
        "Flat-sole trainers, no metal studs. Regular running shoes are fine for beginners.",
        "Comfortable athletic clothes. Not jeans, not football boots.",
        "That's it. The turf provides bat, wickets, tape balls, and gloves.",
      ],
    },

    {
      type: "callout",
      title: "Don't overthink the gear",
      text: "Box cricket is designed to be low-friction. Every kit item you'd need is provided. Turn up in shorts and a t-shirt.",
    },

    { type: "h2", text: "What ball you're playing with" },
    {
      type: "p",
      text: "Almost always a tennis ball wrapped in electrical tape (called a 'tape ball' or 'tennis-with-tape'). The tape adds weight and swing without the pain of a leather cricket ball. Beginner-friendly, still challenging.",
    },

    { type: "h2", text: "First-time batting tips" },
    {
      type: "ol",
      items: [
        "Stay in the crease. On a short pitch, moving forward too much means you're already at the bowler by the time the ball arrives.",
        "Play straight. The tape ball swings, play too across the line and you'll edge every ball.",
        "Don't try to hit sixes. Ones and twos off the walls score you the same as lofted shots on a full pitch, with much less risk.",
        "Look for gaps in the field, not power. The fielders are 10 metres away, placement wins.",
      ],
    },

    { type: "h2", text: "First-time bowling tips" },
    {
      type: "ol",
      items: [
        "Keep it full. On a short pitch, short balls sit up and get smashed.",
        "Slower is better than faster for beginners. Pace comes off the ball, batter has to make the pace themselves.",
        "Change your line, not just your length. Batters get comfortable quickly on a small pitch.",
        "You bowl 6 balls. That's it. Make them count instead of trying to bowl fast.",
      ],
    },

    { type: "h2", text: "Fielding, the underrated part" },
    {
      type: "p",
      text: "In box cricket, half the game is fielding. Balls come off walls at weird angles. Stay on your toes, back up every throw, and communicate loudly about who's taking a catch. The best fielders in box cricket score more indirectly than the best batters.",
    },

    { type: "h2", text: "How the match usually flows" },
    {
      type: "ol",
      items: [
        "Toss. Winner bats or bowls.",
        "First innings. 5 or 6 overs. Both teams field.",
        "Break. 5 minutes for water and swap.",
        "Second innings, chasing team bats. Same overs.",
        "Result. Photo. Split the cost. Leave the pitch clean.",
      ],
    },

    {
      type: "cta",
      text: "Find box cricket turfs near you.",
      href: "/sport/cricket",
      label: "Browse cricket turfs",
    },

    {
      type: "callout",
      title: "The one thing to remember",
      text: "Box cricket is meant to be fun. Nobody's Sourav Ganguly. Play straight, run everything, and don't be the person shouting at teammates for a dropped catch.",
    },
  ],
};
