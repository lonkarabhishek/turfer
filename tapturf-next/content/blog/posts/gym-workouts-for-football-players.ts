import type { Post } from "../types";

export const post: Post = {
  slug: "gym-workouts-for-football-players",
  title: "Gym Workouts for Football Players: A 3-Day Weekly Plan",
  description:
    "A simple 3-day weekly plan of gym and bodyweight workouts for amateur football players, built around weekend turf games, with the research behind each choice.",
  hook: "Two short strength sessions and a proper warm-up can change how your weekend game feels. Here is the plan, with sources.",
  category: "Fitness",
  city: null,
  readMinutes: 8,
  publishedAt: "2026-10-19",
  coverEmoji: "⚽",
  heroImage: {
    url: "/blog/art/gym-workouts-football.svg",
    og: "https://www.tapturf.in/blog/art/gym-workouts-football.png",
    alt: "Illustration of a football, a dumbbell and a weekly calendar with three training days marked",
  },
  keywords: [
    "gym workouts for football players",
    "football strength training",
    "football workout plan",
    "workout plan for football players",
    "football fitness for beginners",
    "FIFA 11+ warm up",
    "nordic hamstring exercise",
    "5-a-side football fitness",
  ],
  cta: { href: "/turfs", label: "Book a turf for your next game" },
  blocks: [
    {
      type: "p",
      text: "Two strength sessions a week, built around legs, hamstrings, core and short explosive jumps, are enough for most amateur footballers. Add a proper warm-up before every game and you cover the two things the research supports best: staying injury-free and moving faster over short distances.",
    },
    {
      type: "callout",
      title: "Who this is for",
      text: "Adults who play 5-a-side or 7-a-side on turf once or twice a week and can train two or three more days with a gym, a pair of dumbbells or just their bodyweight. It is not a plan for elite players, and it does not replace advice from a coach or doctor.",
    },

    { type: "h2", text: "Do football players really need the gym?" },
    {
      type: "p",
      text: "You do not need a gym, but you do need some strength work. The World Health Organization recommends that adults do muscle-strengthening activities that involve all major muscle groups on 2 or more days a week, on top of aerobic activity. A weekend turf game covers the aerobic side. It rarely covers the strength side.",
    },
    {
      type: "p",
      text: "For football specifically, a 2015 review of 24 studies on 523 soccer players found that strength training improved jump performance more than running speed, and improved acceleration over 10 metres more than top speed over 40 metres. Acceleration is what you use on a small turf: the first three steps to a loose ball.",
    },
    {
      type: "p",
      text: "Be honest about the limits too. A 2021 meta-analysis of first-division professionals could not confirm that strength training on its own improves their short sprints and jumps, especially in-season. Amateurs who have never lifted anything are in a different position from professionals who already train daily, so expect the gains to be larger when you are starting out.",
    },

    { type: "h2", text: "What does a good weekly plan look like around a weekend match?" },
    {
      type: "p",
      text: "Keep the hard work early in the week and the lighter work close to the game. This plan assumes you play on Saturday or Sunday. If your game is on a weeknight, shift the days so that Day 2 is still at least two days before kick-off.",
    },
    {
      type: "table",
      caption: "3-day weekly plan for amateur turf footballers",
      columns: ["Day", "Focus", "What to do", "Time"],
      rows: [
        ["Day 1 (Tuesday)", "Strength", "Squats or goblet squats, lunges, hip thrusts or glute bridges, planks, side planks", "40 to 45 min"],
        ["Day 2 (Thursday)", "Hamstrings and power", "Nordic hamstring curls, single-leg balance, vertical and lateral jumps, short sprints, easy core work", "35 to 40 min"],
        ["Day 3 (Saturday or Sunday)", "Match day", "Warm-up (running parts of FIFA 11+), then play", "Your game"],
        ["Other days", "Rest or easy", "Walk, stretch lightly, sleep well", "As you like"],
      ],
    },
    {
      type: "p",
      text: "On sets and reps: where a number below comes from the FIFA 11+ programme, it is stated as such. Everything else is a sensible starting point, not a figure from a study. Begin with one or two sets and add a set only when you recover well.",
    },
    {
      type: "callout",
      title: "Why only one or two strength days",
      text: "The 2015 review found that two strength sessions a week were enough to build force and power in pre-season, and that one session a week was enough to avoid losing those gains during the season. For an amateur playing every weekend, two short days is a good ceiling.",
    },

    { type: "h2", text: "What should I do on the strength day?" },
    {
      type: "p",
      text: "Pick five or six movements, do each for two or three sets, and rest about a minute or two between sets. Quality matters more than weight. If you are new to lifting, start with bodyweight or light dumbbells.",
    },
    {
      type: "ul",
      items: [
        "Squat or goblet squat: the base movement for running and jumping. Keep your knees tracking over your toes and land softly.",
        "Walking lunges or split squats: football is played on one leg more than two. Lunges train that.",
        "Hip thrust or glute bridge: the glutes drive your sprint. A bench, a sofa edge or the floor all work.",
        "Plank and side plank: the FIFA 11+ programme uses these as 'the bench' and 'sideways bench', 3 sets of 20 to 30 seconds (each side for the side plank) at the first level.",
        "Push-ups or dumbbell rows: not football-specific, but they keep your upper body balanced and help you hold off a defender.",
      ],
    },
    {
      type: "cta",
      text: "Looking for a game to put the legs to use? See the football pages on TapTurf.",
      href: "/sport/football",
      label: "Explore football on TapTurf",
    },

    { type: "h2", text: "Why do hamstrings need their own exercise?" },
    {
      type: "p",
      text: "Hamstring injuries are a common problem in football, and one exercise has unusually strong evidence behind it: the Nordic hamstring curl. A 2019 meta-analysis of 15 studies and 8,459 athletes, mostly footballers, found that programmes including it reduced hamstring injuries by up to 51%.",
    },
    {
      type: "p",
      text: "To do it, kneel on a mat with a partner holding your ankles down (or hook your heels under a sturdy bench). Keep your body straight from knee to head and lower yourself forward as slowly as you can, catching yourself with your hands. Push back up with a little help from your arms. The FIFA 11+ programme uses this exercise with 3 to 5 repetitions at beginner level, 7 to 10 at intermediate and 12 to 15 at advanced. Start at the beginner level and stay there for a few weeks.",
    },
    {
      type: "callout",
      title: "Go slowly with this one",
      text: "The Nordic curl is demanding on the back of the thigh and can leave you sore. Build up gradually, and skip it and see a physiotherapist or doctor if you have a current or recent hamstring problem.",
    },

    { type: "h2", text: "What is the FIFA 11+ and should I use it as my warm-up?" },
    {
      type: "p",
      text: "Yes, if you play regularly. FIFA 11+ is a warm-up programme from FIFA's medical research centre, designed for players aged 14 and above. It has 15 exercises in three parts and takes around 20 minutes: slow running with active stretching, then strength, balance and jumping exercises, then faster running with planting and cutting.",
    },
    {
      type: "p",
      text: "The evidence is good. A 2017 meta-analysis of randomised trials in recreational and sub-elite football, covering 6,574 players, found that pooling the four FIFA 11+ trials gave a 39% lower overall injury rate than normal warm-ups. A 2021 trial in Rwanda with 626 second-division players found a lower injury rate in the group doing 11+, and that the injuries they did get were less severe. Results depend on actually doing it: the programme is meant to be used before every training session, at least twice a week.",
    },
    {
      type: "ul",
      items: [
        "Before training sessions: do all three parts, about 20 minutes.",
        "Before a match: FIFA says to do the running parts only (Parts 1 and 3).",
        "Technique matters: straight leg alignment, knee over toe, soft landings.",
      ],
    },
    {
      type: "p",
      text: "Turf games run on tight slots, so build the warm-up into your arrival time. Turning up 15 to 20 minutes early costs you nothing and is the cheapest injury insurance you have. Our guide to booking times can help you plan the slot.",
    },
    {
      type: "cta",
      text: "Plan your slot so the warm-up fits before kick-off.",
      href: "/blog/best-time-to-book-a-turf",
      label: "Read: best time to book a turf",
    },

    { type: "h2", text: "What should I do on the power and speed day?" },
    {
      type: "p",
      text: "Day 2 is lighter and sharper. Start with the Nordic curl, then add balance work and short explosive efforts. Stop each set while you still feel fresh.",
    },
    {
      type: "ul",
      items: [
        "Nordic hamstring curls (see above).",
        "Single-leg balance: stand on one leg holding a ball, 2 sets of 30 seconds, the FIFA 11+ first level.",
        "Vertical jumps and lateral jumps: 2 sets of 30 seconds each, again from FIFA 11+. Land softly, knees over toes.",
        "Short sprints: 5 to 6 runs of about 10 to 15 metres with a full walk-back recovery, which mimics the quick bursts of a small-sided game.",
        "A few minutes of easy core work to finish.",
      ],
    },
    {
      type: "p",
      text: "A 2010 study of 51 under-14 players found that 12 weeks of strength and power work twice a week alongside normal football training improved vertical jump by 3.3 cm and 10-metre sprint time by 0.10 seconds, without hurting endurance. These were boys in pre-season, so treat the numbers as a sign of direction, not a promise.",
    },

    { type: "h2", text: "How do I fit all this around a weekend game?" },
    {
      type: "ul",
      items: [
        "Keep Day 2 at least two days before your match, and keep it light. Do not do a hard leg session the day before a game.",
        "After the match, take it easy the next day. Walk, stretch gently and sleep.",
        "If you play twice a week, drop to one strength session and keep the warm-up. One session a week is enough to hold on to your gains in season.",
        "No equipment? Everything above can be done with bodyweight, a backpack for load, a bench or sturdy furniture, and a partner for the Nordic curl.",
      ],
    },
    {
      type: "cta",
      text: "Playing weekly means paying weekly. Here is how squads split the turf bill fairly.",
      href: "/blog/split-turf-costs-with-squad",
      label: "Read: split turf costs with your squad",
    },
    {
      type: "cta",
      text: "Need players for a weekend game? See the open games near you.",
      href: "/games",
      label: "Find a game",
    },
    {
      type: "p",
      text: "If you are also deciding what to wear on the turf, read our guide to football turf shoes. For the surface itself, see football on turf versus grass.",
    },
    {
      type: "cta",
      text: "Good footwear matters as much as good legs.",
      href: "/blog/football-turf-shoes-guide",
      label: "Read: football turf shoes guide",
    },
    {
      type: "cta",
      text: "How does turf differ from grass for your joints and game?",
      href: "/blog/football-on-turf-vs-grass",
      label: "Read: football on turf vs grass",
    },

    {
      type: "faq",
      items: [
        {
          q: "How many days a week should a football player lift?",
          a: "Two short strength days are enough for most amateurs. In season, one session a week is enough to hold on to your strength, according to a 2015 review in Sports Medicine - Open.",
        },
        {
          q: "Can I do this plan without a gym?",
          a: "Yes. Squats, lunges, glute bridges, planks, jumps and Nordic curls need no machines. A backpack or a pair of dumbbells adds load once bodyweight becomes easy.",
        },
        {
          q: "Will lifting make me slower or bulky?",
          a: "Not on a two-day plan like this. The research on soccer players shows strength training improves jumping and short acceleration, and the 2010 youth study found no harm to endurance.",
        },
        {
          q: "What is the best warm-up before a turf game?",
          a: "The FIFA 11+ running parts: slow running with active stretching, then faster running with planting and cutting. FIFA recommends Parts 1 and 3 before matches.",
        },
        {
          q: "Is the Nordic hamstring curl safe for beginners?",
          a: "Start with 3 to 5 slow repetitions, as in the FIFA 11+ beginner level, and build up over weeks. Avoid it if you have a current hamstring problem, and check with a physiotherapist or doctor first.",
        },
      ],
    },

    { type: "h2", text: "Sources" },
    {
      type: "ul",
      items: [
        "World Health Organization, WHO guidelines on physical activity and sedentary behaviour, 2020.",
        "Silva, Nassis and Rebelo, Strength training in soccer with a specific focus on highly trained players, Sports Medicine - Open, 2 April 2015.",
        "Wong, Chamari and Wisloff, Effects of 12-week on-field combined strength and power training on physical performance among U-14 young soccer players, Journal of Strength and Conditioning Research, March 2010.",
        "Strength Training in Professional Soccer: Effects on Short-sprint and Jump Performance, International Journal of Sports Medicine, 24 September 2021.",
        "van Dyk, Behan and Whiteley, Including the Nordic hamstring exercise in injury prevention programmes halves the rate of hamstring injuries: a systematic review and meta-analysis of 8459 athletes, British Journal of Sports Medicine, 2019.",
        "Effect of specific exercise-based football injury prevention programmes on the overall injury rate in football: a systematic review and meta-analysis of the FIFA 11 and 11+ programmes, British Journal of Sports Medicine, 2017.",
        "Effect of the FIFA 11+ soccer specific warm up programme on the incidence of injuries: a cluster-randomised controlled trial (Rwanda), PLOS One, 2021.",
        "FIFA Medical Assessment and Research Centre (F-MARC), the 11+ programme page and manual, f-marc.com/11plus.",
      ],
    },
    {
      type: "p",
      text: "This is general information, not medical advice. Check with a doctor or a qualified coach before starting a new programme, especially after an injury.",
    },
  ],
};
