import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/contact";
import { CITY_LIST_AND } from "@/lib/city";

const UPDATED = "2026-10-21";
const PAGE_URL = "https://www.tapturf.in/privacy";

export const metadata: Metadata = {
  title: "Privacy Policy | TapTurf",
  description:
    "What TapTurf collects when you browse turfs, sign in, host or join games, and how that information is used, shared and deleted.",
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Privacy Policy | TapTurf",
    description: "What TapTurf collects, why, and how to get it removed.",
    url: PAGE_URL,
    siteName: "TapTurf",
    type: "website",
  },
};

const Email = () => <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>;

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <>
        <p>
          TapTurf (&ldquo;TapTurf&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) runs the website and app at
          tapturf.in from Nashik, Maharashtra, India. We help players find sports turfs and courts in{" "}
          {CITY_LIST_AND}, and host or join pickup games.
        </p>
        <p>
          This policy explains what we collect, why, who sees it and how to get it removed. It applies to
          everything on tapturf.in, including the installable app version. For anything not covered here,
          write to <Email />.
        </p>
      </>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <p>
          <strong>Browsing without an account.</strong> You can look at every turf, court and game without
          signing in. We then collect only standard analytics (see section 5) and the preferences stored on
          your device (section 6).
        </p>
        <p>
          <strong>When you sign in with your phone number.</strong> We store your mobile number and the
          name you choose. The one-time code is sent and checked by Google Firebase; we never see the code
          itself. To diagnose &ldquo;OTP not arriving&rdquo; problems we keep a log of send attempts with the
          outcome, the error reason and the last two digits of the number only.
        </p>
        <p>
          <strong>When you sign in with Google.</strong> Google shares your name, email address and profile
          photo with us. We don&rsquo;t receive your Google password or anything else from your Google account.
        </p>
        <p>
          <strong>Things you do on TapTurf.</strong> Games you host or ask to join, notes you add to a join
          request, reviews you write, corrections you suggest for a turf (and whether you told us you own or
          play at it), and when you tap Call or WhatsApp on a turf page. We also record the time and method of
          each sign-in to spot abuse and to see how many people use the site.
        </p>
        <p id="usernames" className="scroll-mt-24">
          <strong>Your username and public profile.</strong> You can pick a TapTurf username. Your username,
          name and photo then show on your public profile page, tapturf.in/u/your-username, with the month you
          joined. Unless you turn off &ldquo;Let others find and tag me&rdquo;, signed-in people who score live
          matches can find you by username or name and tag you as a player, and the tag links to your profile.
          Turning it off hides your profile page and takes you out of search within about a minute. New views
          of a live score stop showing your tag within about a minute too; a live score page someone already
          has open drops it at its next score update or when it is reloaded.
        </p>
        <p id="live-links" className="scroll-mt-24">
          <strong>Live score links.</strong> The free Live Cricket Scorer and Live Scoreboard keep your match
          in your browser. If you turn on a live link, the match is sent to our server as you score so others
          can follow it: the team and player names, the title and venue if you added them, every ball, point,
          goal or card with its time, the match clock, and the result. We also keep a one-way
          hash of your network address (never the address itself) so one network cannot make links in bulk.
          You log in to turn on a live link or to keep following one, but the link is not tied to your account:
          your own name, number or email does not go with it. If you tag players with their TapTurf usernames,
          those usernames go with the match. While you follow a live score, your browser joins a count of
          people watching it. Nothing about you is sent.
        </p>
        <p>
          <strong>Your location, only when you ask.</strong> On the Turf Near Me page, tapping &ldquo;Use my
          location&rdquo; sends your approximate coordinates to our server once so we can sort turfs by
          distance. The coordinates are used for that one calculation and are not stored. Everywhere else,
          distance is worked out on your device and never leaves it.
        </p>
        <p>
          <strong>What we do not collect.</strong> We don&rsquo;t take payments, so we never see card, UPI or
          bank details. Bookings happen directly between you and the venue.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <ul>
        <li>To run your account and show your games, requests and notifications.</li>
        <li>To show hosts who wants to join their game, and to show players how to reach the host.</li>
        <li>To publish reviews and venue corrections you submit.</li>
        <li>To show a live score to the people you send its link to, and how many are watching.</li>
        <li>To show your public profile and let friends tag you on live scores, unless you turn that off.</li>
        <li>To keep the service safe: rate-limiting sign-ins and OTP sends, and investigating misuse.</li>
        <li>To understand which turfs, cities and features people use, in aggregate, so we can improve them.</li>
        <li>
          To learn how new members find us and what they came for, so we know which cities and sports to add
          and which links bring players (see &ldquo;When you sign up&rdquo; below).
        </li>
        <li>To reply when you contact us.</li>
      </ul>
    ),
  },
  {
    id: "share",
    title: "Who can see it",
    body: (
      <>
        <p>
          <strong>Other players.</strong> When you host a game, your name and profile photo appear on that
          game&rsquo;s page, and so does the WhatsApp number you give for that game, if any, so players can
          coordinate with you. Leave the number out if you would rather not share it. When you ask to join a game, the host sees
          your name, photo and any note you wrote. Reviews show your name.
        </p>
        <p>
          <strong>Live scores.</strong> Anyone with a live link can see that score, names included.
          Links are not listed anywhere on TapTurf and are hidden from search engines, but anyone who has one
          can forward it, so ask your players before you add or tag them. Turn the link off in the scorer at
          any time, or email <Email /> and we will take it down.
        </p>
        <p>
          <strong>Your profile.</strong> If you pick a username, your username, name, photo and join month are
          public on your profile page and in player search, unless you turn off &ldquo;Let others find and tag
          me&rdquo;. Your phone number and email are never shown there.
        </p>
        <p>
          <strong>Venues.</strong> We don&rsquo;t pass your details to turf owners. When you tap Call or
          WhatsApp you contact the venue yourself, and from then on their own privacy terms apply.
        </p>
        <p>
          <strong>Service providers.</strong> We use a small number of companies to run TapTurf. They process
          data on our instructions and cannot use it for their own purposes:
        </p>
        <ul>
          <li>Supabase, which hosts our database, handles Google sign-in sessions and counts who is watching a live score.</li>
          <li>Google Firebase, which sends and verifies phone one-time codes.</li>
          <li>Vercel, which hosts the website.</li>
          <li>Google Analytics, for anonymous usage statistics (section 5).</li>
          <li>Hostinger, which hosts our email.</li>
        </ul>
        <p>
          <strong>Legal reasons.</strong> We will share information if the law requires it, or to protect the
          rights and safety of players, venues or TapTurf.
        </p>
        <p>We do not sell personal information, and we do not show third-party advertising.</p>
      </>
    ),
  },
  {
    id: "analytics",
    title: "Analytics and embedded content",
    body: (
      <>
        <p>
          We use Google Analytics to count visits and see which pages people use: page views, the turfs you
          open, the city and sport filters you use, and taps on Call or WhatsApp. It sets cookies and records
          an approximate location derived from your IP address (Google Analytics does not store the address
          itself), your device type and the pages you view. We have turned off Google signals and ad
          personalisation, so this is not used to follow you across other websites or for advertising. You
          can block it with any standard cookie or tracker blocker, and the site works exactly the same.
        </p>
        <p id="signup">
          <strong>When you sign up.</strong> While you browse, your device keeps a short note of how you first
          arrived (the website or campaign link that sent you, not the full address), how many times and on how
          many days you have visited, which cities, sports and turfs you looked at, when you first opened a
          turf or tapped Call or WhatsApp, and your device type, operating system and browser family. Nothing
          is sent while you are signed out. When you create an account, one summary of this is saved with your
          account so we can see where members come from and what they want. We never store your IP address,
          your full browser details or anything you type into a form here. We use it only to improve TapTurf,
          we do not sell it, and you can ask us to delete it at any time.
        </p>
        <p>
          Turf pages embed Google Maps, and photos load from Google&rsquo;s servers. Loading these shares your
          IP address with Google under{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Google&rsquo;s privacy policy
          </a>
          . Maps load only when you tap &ldquo;Show map&rdquo;.
        </p>
        <p>
          Some venue pages show reviews that were publicly posted on Google Maps, with the reviewer&rsquo;s
          public first name and a link back to the source. If you are quoted and would like the quote removed,
          email us.
        </p>
      </>
    ),
  },
  {
    id: "device",
    title: "Stored on your device",
    body: (
      <p>
        Your browser keeps a few things locally so the site remembers you: your sign-in, the city you picked,
        banners you closed, whether you dismissed the &ldquo;install app&rdquo; prompt, whether we already
        asked you to pick a username, the TapTurf profiles you tagged recently, the WhatsApp number you last
        gave players for a game, the short visit note
        described under &ldquo;When you sign up&rdquo;, and the matches and tournaments you score with our
        free tools. For a live link it also keeps the key that lets only this browser update that
        link; our server stores just a one-way hash of the key. None of this is sent to us except the sign-in
        token, which identifies you to our server, that one summary when you create an account, and a match
        while its live link is on. Clearing site data in your browser removes all of it. A live link that was
        on then stops updating and is cleared 30 days after its last update, or sooner if you email us.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Your account and the things you posted stay until you delete them or ask us to.</li>
        <li>
          When you change your username, the old one stays reserved for you: links to it still reach your
          profile and nobody else can take it.
        </li>
        <li>Games expire after their date and are hidden; the record is kept so hosts can see their history.</li>
        <li>Sign-in and OTP logs are kept for up to 12 months, then removed.</li>
        <li>Call and WhatsApp tap counts are kept as totals; the link to your account is dropped after 90 days.</li>
        <li>The sign-up summary stays with your account and is deleted with it, or sooner if you ask.</li>
        <li>
          A live score is cleared when you turn its link off, or 30 days after its last update. The
          one-way hash of the network address is kept for 2 days to stop misuse.
        </li>
        <li>Emails you send us are kept as long as needed to deal with your request.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your choices and rights",
    body: (
      <>
        <p>
          You can edit your name, your username and whether others can find and tag you from your dashboard,
          and leave or cancel games. For anything else,
          including removing a review or suggestion you posted, email <Email /> from the address or phone
          linked to your account and we will:
        </p>
        <ul>
          <li>send you a copy of the personal information we hold about you;</li>
          <li>correct anything that is wrong;</li>
          <li>delete your account and personal information, usually within 7 days. Games you hosted are
            cancelled and your name is removed from games you joined.</li>
        </ul>
        <p>
          These rights follow India&rsquo;s Digital Personal Data Protection Act, 2023 and the Information
          Technology Act, 2000. If you are unhappy with how we handled a request, you may complain to the Data
          Protection Board of India once it is operational.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        TapTurf is meant for people aged 18 and over. If you are under 18, use it only with a parent or
        guardian&rsquo;s permission, do not host games, and keep &ldquo;Let others find and tag me&rdquo; off. If we learn that we hold an account for a child
        without that permission, we will delete it.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        All traffic to tapturf.in is encrypted. Your name, photo and username are public; your phone number
        and email are not. Personal data in our database is readable only by our own
        server code and the account it belongs to, and the logs that could identify you are closed to the
        public API. No system is perfectly secure, so if you notice a problem please tell us at <Email /> and
        we will act on it quickly.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        When we change this policy we update the date at the top. For a change that affects what we collect or
        share, we will also show a notice on the site. The current version always lives at{" "}
        <Link href="/privacy">tapturf.in/privacy</Link>.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact and grievance officer",
    body: (
      <p>
        For privacy questions, data requests or complaints, write to <Email />. This address reaches the
        person responsible for data protection at TapTurf, which is our grievance officer under Indian law.
        We acknowledge every message and aim to resolve it within 15 days.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Short version: we collect what we need to run your account and the games you join, we don't sell it, and you can get it deleted by emailing us."
      updated={UPDATED}
      sections={SECTIONS}
      sibling={{ href: "/terms", label: "Terms of Service" }}
    />
  );
}
