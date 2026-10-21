/**
 * The free tools under /tools. One list drives the hub, the footer link,
 * the sitemap, related-tool links and each page's metadata.
 */

export type ToolSlug = "cricket-nrr-calculator" | "cricket-toss" | "cricket-scorecard-maker" | "cricket-live-scorer" | "live-scoreboard" | "cricket-tournament-scorer" | "cricket-team-generator";

export type ToolDef = {
  slug: ToolSlug;
  /** GA4 event parameter. */
  key: string;
  name: string;
  /** One line for the hub card. */
  tagline: string;
  /** <title>. */
  title: string;
  /** Meta description, about 140 to 160 characters. */
  description: string;
  /** Visible H1. */
  h1: string;
  /** The one product CTA under the result. */
  cta: { label: string; href: string };
  related: ToolSlug[];
  /** Last real change to the page (YYYY-MM-DD), for the sitemap's lastmod. */
  updated: string;
};

export const TOOLS_BASE = "https://www.tapturf.in/tools";

export const TOOLS: ToolDef[] = [
  {
    slug: "cricket-nrr-calculator",
    updated: "2026-10-11",
    key: "nrr_calculator",
    name: "Cricket NRR Calculator",
    tagline: "Calculate net run rate instantly.",
    title: "Cricket NRR Calculator - Free Net Run Rate Calculator | TapTurf",
    description:
      "Free cricket NRR calculator. Enter runs and overs for both sides and get run rate, opponent run rate and net run rate, with cricket overs like 5.3 handled correctly.",
    h1: "Cricket NRR Calculator",
    cta: { label: "Find a cricket turf near you", href: "/sport/box-cricket" },
    related: ["cricket-tournament-scorer", "cricket-scorecard-maker"],
  },
  {
    slug: "cricket-toss",
    updated: "2026-10-11",
    key: "toss",
    name: "Cricket Toss",
    tagline: "Flip a coin for your cricket match.",
    title: "Cricket Toss Online - Free Coin Toss for Cricket | TapTurf",
    description:
      "Online cricket toss. Call heads or tails, flip the coin, see who won and pick bat or bowl. Works one-handed on your phone, no sign-up, ready the moment it loads.",
    h1: "Cricket Toss",
    cta: { label: "Find a turf for your next match", href: "/turf-near-me" },
    related: ["cricket-team-generator", "cricket-live-scorer"],
  },
  {
    slug: "cricket-scorecard-maker",
    updated: "2026-10-11",
    key: "scorecard_maker",
    name: "Cricket Scorecard Maker",
    tagline: "Create and share match result cards.",
    title: "Cricket Scorecard Maker - Create Match Scorecards Free | TapTurf",
    description:
      "Make a clean cricket match result card in seconds. Add scores, overs, result, player of the match and venue, then download a PNG or share it to WhatsApp.",
    h1: "Cricket Scorecard Maker",
    cta: { label: "Find your next cricket turf", href: "/sport/box-cricket" },
    related: ["cricket-live-scorer", "cricket-tournament-scorer"],
  },
  {
    slug: "cricket-live-scorer",
    updated: "2026-10-21",
    key: "live_scorer",
    name: "Live Cricket Scorer",
    tagline: "Score ball by ball, see every stat live.",
    title: "Live Cricket Scorer - Free Ball by Ball Scoring App | TapTurf",
    description:
      "Free ball by ball cricket scorer and live cricket scoring app for box cricket. One tap a ball, then see the scorecard, run rates, graphs and WhatsApp updates.",
    h1: "Live Cricket Scorer",
    cta: { label: "Find a box cricket turf near you", href: "/sport/box-cricket" },
    related: ["cricket-scorecard-maker", "cricket-toss", "cricket-team-generator"],
  },
  {
    slug: "live-scoreboard",
    updated: "2026-10-21",
    key: "live_scoreboard",
    name: "Live Scoreboard",
    tagline: "Live score for football, badminton and more.",
    title: "Live Scoreboard for Football, Badminton, Basketball & More | TapTurf",
    // No live link promise here: the page hides live links when the server has no write key.
    description:
      "Free live scoreboard for football, badminton, basketball, volleyball, pickleball, tennis and more. Tap to score on your phone and share it on WhatsApp.",
    h1: "Live Scoreboard",
    cta: { label: "Find a turf or court near you", href: "/turfs" },
    related: ["cricket-team-generator", "cricket-toss", "cricket-live-scorer"],
  },
  {
    slug: "cricket-tournament-scorer",
    updated: "2026-10-11",
    key: "tournament_scorer",
    name: "Series & Tournament Scorer",
    tagline: "Track matches, points and NRR.",
    title: "Cricket Tournament Scorer with NRR & Points Table | TapTurf",
    description:
      "Free cricket tournament scorer for bilateral series, tri-series and round robins. Enter each match and get a live points table with NRR, saved in your browser.",
    h1: "Cricket Series & Tournament Scorer",
    cta: { label: "Find a turf for your tournament", href: "/sport/box-cricket" },
    related: ["cricket-nrr-calculator", "cricket-scorecard-maker"],
  },
  {
    slug: "cricket-team-generator",
    updated: "2026-10-11",
    key: "team_generator",
    name: "Cricket Team Generator",
    tagline: "Split players into teams instantly.",
    title: "Cricket Team Generator - Split Players Into Teams Free | TapTurf",
    description:
      "Paste player names and split them into 2, 3 or 4 cricket teams at random, or balanced by a quick 1 to 5 rating. Regenerate until it feels fair, then copy the teams.",
    h1: "Cricket Team Generator",
    cta: { label: "Teams ready? Find a turf", href: "/sport/box-cricket" },
    related: ["cricket-toss", "cricket-live-scorer"],
  },
];

export function toolBySlug(slug: string): ToolDef | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function toolPath(slug: ToolSlug): string {
  return `/tools/${slug}`;
}
