import type { Post } from "../types";

export const post: Post = {
  slug: "how-to-win-at-box-cricket",
  title: "How to Win at Box Cricket: Tactics for 6 Overs, 6 Players and Four Walls",
  description:
    "Box cricket is a different sport from the one on TV. Here is how to bat, bowl, field and captain inside a cage: the maths of six overs, playing the walls, the fielding shape that works, and the house rules to agree before the first ball.",
  hook: "Your squad has the talent. It keeps losing to a team that understands the cage. Fix that in one read.",
  category: "Playbook",
  city: null,
  readMinutes: 10,
  publishedAt: "2026-10-08",
  coverEmoji: "🧠",
  heroImage: {
    url: "/blog/art/box-cricket-tactics.svg",
    og: "https://www.tapturf.in/blog/art/box-cricket-tactics.png",
    alt: "Top-down diagram of a box cricket cage showing five fielders and three shot directions",
  },
  keywords: [
    "box cricket tactics",
    "how to play box cricket",
    "box cricket tips",
    "box cricket batting tips",
    "box cricket bowling tips",
    "box cricket fielding positions",
    "box cricket rules",
    "turf cricket strategy",
  ],
  cta: { href: "/turf-near-me", label: "Find a cage to practise in" },
  blocks: [
    {
      type: "p",
      text: "The teams that win at box cricket are rarely the ones with the best cricketers. They are the ones that stopped playing cricket and started playing box cricket, which has different maths, different geometry and a wall where the boundary used to be. This is the playbook: what to do with the bat, the ball, your five fielders and the two minutes before the toss.",
    },
    {
      type: "callout",
      title: "Assumptions",
      text: "Six a side, six overs an innings, a tennis ball, everyone bowls one over, and the back wall is in play. Your venue's house rules may differ, and section 7 is about settling that before you start.",
    },

    { type: "h2", text: "1. The maths of six overs" },
    {
      type: "p",
      text: "Thirty-six balls. That is the whole innings. There is no building a platform, no seeing off the new ball, no settling in. If your opener plays out a maiden, your team has given away one sixth of its innings for nothing. At the same time, six wickets in 36 balls means a collapse is only ever four balls away.",
    },
    {
      type: "stat-grid",
      items: [
        { value: "36", label: "Balls per innings", hint: "Six overs, no extras counted" },
        { value: "~60", label: "A winning score", hint: "At most venues, with a tennis ball" },
        { value: "1.7", label: "Runs needed per ball", hint: "To reach 60" },
        { value: "6", label: "Balls each bowler gets", hint: "One over, no second chance" },
      ],
    },
    {
      type: "p",
      text: "So the target is roughly ten an over, and the real currency is dot balls. A team that scores off 30 of its 36 balls wins most games regardless of how many sixes it hits. Every tactic below is a way to turn a dot into a single.",
    },

    { type: "h2", text: "2. Batting: placement, then power" },
    { type: "h3", text: "Learn the walls before the first over" },
    {
      type: "p",
      text: "Every cage rebounds differently. Side nets are usually soft and kill the ball; a hard back wall or a low side boundary can fire it straight back at the fielders. Spend your warm-up hitting the walls, not the bowler. Know which side gives a safe single on a rebound and which sends it to a waiting hand.",
    },
    { type: "h3", text: "Hit along the ground, hard, into gaps" },
    {
      type: "p",
      text: "A tennis ball sits up and begs to be hit in the air, and the cage ceiling, the back-net rule or a fielder standing at the wall turns most of those into outs. The reliable scoring shot in a cage is the hard push or drive along the turf into the gap between two fielders. It beats the inner ring, reaches the wall, and the rebound gives you time for the second run.",
    },
    { type: "h3", text: "Run everything" },
    {
      type: "p",
      text: "Pitches are short, usually under 50 feet, so a single takes about three seconds. Fielders at the wall need two seconds to pick up and one to throw. Run on every ball that passes the inner fielders. Run on misfields. Run when the keeper has to move. The teams that score 60 are the ones that take 25 singles.",
    },
    { type: "h3", text: "Use the back wall like a slip cordon in reverse" },
    {
      type: "p",
      text: "If the venue plays a direct hit on the back wall as runs (commonly four, sometimes six for a full-toss hit), that is the only reward for a big shot, and only straight. Pick one ball an over to go for it, pick it early and pick it straight. Off-side and leg-side walls almost never pay; the back wall sometimes does.",
    },
    { type: "h3", text: "Order your batters by role" },
    {
      type: "ul",
      items: [
        "Overs 1 and 2: your two best placement players. Dot-ball avoidance is the only job.",
        "Overs 3 and 4: your most powerful striker, with a runner-type at the other end to turn the strike.",
        "Overs 5 and 6: whoever is calm. Last-over batting in a cage is about not losing wickets while taking singles; the big hitter has usually already had his go.",
      ],
    },

    { type: "h2", text: "3. Bowling: you get six balls, make them different" },
    {
      type: "p",
      text: "Every bowler bowls one over, so there is no second spell to fix the first. Treat the over as six separate decisions. The batter is trying to score off every ball, which means the batter is also committed early on every ball, and that is your advantage.",
    },
    {
      type: "ol",
      items: [
        "Ball one: full and straight, on the stumps. Most batters swing at the first ball. Make them hit it straight to the bowler or the back-wall fielder.",
        "Ball two: a slower ball, same length. The tennis ball dies off the turf and arrives after the swing.",
        "Ball three: wide of off stump, just inside the line the venue calls wide. Forces a reach, feeds the off-side fielders.",
        "Ball four: a yorker. Hard to score off and the single most under-bowled ball in cage cricket.",
        "Ball five: whatever has worked. Repeat it.",
        "Ball six: the ball they haven't seen. If you have a legitimate variation, this is where it goes.",
      ],
    },
    {
      type: "p",
      text: "Two lines to avoid: short, because a tennis ball sits up and goes over the inner ring, and leg-side, because the wall there turns an edge into a free single. If you can only do one thing, bowl full.",
    },
    {
      type: "callout",
      title: "Keep the wide line honest",
      text: "Agree what counts as wide before the game and bowl just inside it. In a cage, one wide is a free run plus an extra ball, which is nearly two percent of the whole innings.",
    },

    { type: "h2", text: "4. Fielding: five people, four walls, one shape" },
    {
      type: "p",
      text: "With a bowler and a keeper, you have four or five movable fielders depending on the house rules, and a cage small enough that one shape covers almost every shot. The diagram at the top of this piece is the shape: two at the walls either side of the pitch, two deeper on each side, and one straight at the back wall.",
    },
    {
      type: "ul",
      items: [
        "Positions 1 and 2, square of the wicket on each side: stop the single off the push and take the rebound catches off the side nets.",
        "Positions 3 and 4, deeper on each side: the drive that beats 1 and 2 goes to the wall and comes back to you. Pick up and throw to the bowler's end, which is the end batters forget about.",
        "Position 5, straight at the back wall: the only big-shot zone. This fielder takes more catches than anyone else in cage cricket. Put your safest hands here.",
        "The keeper stands up. There is no pace to fear with a tennis ball, and standing up takes away the batter's room to step out.",
      ],
    },
    {
      type: "p",
      text: "Adjust once per batter, not once per ball. A left-hander flips the shape. A known slogger moves 3 and 4 back to the wall. A nudger moves everyone in two steps. Keep talking: in a cage, a shout of \"wall\" from the keeper is often the difference between a catch and a four.",
    },

    { type: "h2", text: "5. Captaincy in a cage" },
    {
      type: "ul",
      items: [
        "Bowl your best bowler in over 3 or 4, not over 1. That is when the other team's hitter is usually in.",
        "Bowl your weakest bowler at the very start, when batters are still measuring the cage and more likely to give a catch.",
        "If you win the toss on a hot evening, bowl. Chasing is easier when you know the number and the other side has spent 20 minutes running.",
        "Put a calm batter at number six. The last over in a chase is decided by not panicking.",
        "Call the ball-change. A tennis ball goes soft and starts to grip after about four overs. Swapping to the spare at the right moment can change how the batters time it.",
      ],
    },

    { type: "h2", text: "6. The habits that cost games" },
    {
      type: "ul",
      items: [
        "Lofting on the leg side. The side wall is in play, and the fielder there is waiting.",
        "Not running on a rebound. If the ball has gone to the wall, you have time for one. Always.",
        "Bowling short because it feels quicker. Short is a gift in a cage.",
        "Arguing about a wall rule mid-game. See section 7.",
        "Changing the field every ball. The shape works; let it.",
      ],
    },

    { type: "h2", text: "7. Agree these before the first ball" },
    {
      type: "p",
      text: "Half of all cage arguments are about rules that were never stated. Two minutes at the toss saves twenty minutes of shouting. Ask the venue which rules they use, then confirm these with the other captain:",
    },
    {
      type: "ol",
      items: [
        "Walls: is a direct hit on the back wall runs, and how many? Is a catch off the side net out, or only a direct catch?",
        "Roof: dead ball, or out?",
        "Wides and no-balls: how far outside off is wide, and does a no-ball give a free hit?",
        "Last batter: can the last player bat alone, and if so how many balls?",
        "Running: is there a limit on runs per ball (some venues cap at two)?",
        "Bowling: one over each, and does the keeper have to bowl?",
        "Power play: some cages play the first over with only the keeper and bowler fielding. Yes or no?",
      ],
    },
    {
      type: "callout",
      title: "Write it down",
      text: "A message in the group before the match with the seven answers above is the single highest-value thing a captain can do. Screenshots end arguments.",
    },

    { type: "h2", text: "8. Three drills for your next session" },
    {
      type: "ul",
      items: [
        "Wall reading, 5 minutes: one feeder, one batter, hit the ball into each wall in turn and watch where it comes back. Everyone takes a turn.",
        "Six-ball over, 10 minutes: each bowler bowls the six-ball sequence from section 3 to a batter who tries to score off every ball. Count dot balls.",
        "Twenty singles, 10 minutes: two batters, full field, score 20 runs in singles only. Any shot that reaches the wall in the air is out. It is harder than it sounds and it is exactly the game.",
      ],
    },

    {
      type: "faq",
      items: [
        {
          q: "What is a good score in box cricket?",
          a: "With six overs, six a side and a tennis ball, around 60 wins most games at most venues. That is roughly ten an over, or a run off almost every ball. Scores vary with the cage size and house rules, so check what the regulars at your venue consider par.",
        },
        {
          q: "How should you bat in box cricket?",
          a: "Hit hard along the ground into gaps rather than in the air, run on every ball that passes the inner fielders, and save big shots for straight down the ground where the back wall may reward you. Dot balls, not wickets, are what lose cage games.",
        },
        {
          q: "What is the best bowling in box cricket?",
          a: "Full and straight, with changes of pace. A yorker is the hardest ball to score off in a cage. Avoid short balls, which sit up with a tennis ball, and avoid the leg-side line, where the wall gives away singles.",
        },
        {
          q: "Where should fielders stand in box cricket?",
          a: "Two square of the wicket at the side walls, two deeper on each side to take rebounds, and one straight at the back wall for the big shots. The keeper stands up to the stumps.",
        },
        {
          q: "What rules should teams agree before a box cricket match?",
          a: "Wall rules (runs for a direct hit, catches off nets), roof rule, wide line, no-ball and free hit, last-batter rule, any cap on runs per ball, and whether a power play applies. Confirm them with the venue and the other captain before the toss.",
        },
      ],
    },

    {
      type: "cta",
      text: "Tactics need a cage. Find one near you, check the rating and the rate, and book an hour to run the drills.",
      href: "/turf-near-me",
      label: "Find a box cricket turf near me",
    },
  ],
};
