import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/contact";
import { DEFAULT_OG_IMAGE, OG_BASE, ROBOTS_INDEX, TWITTER_CARD } from "@/lib/seo/defaults";
import { CITY_LIST_AND } from "@/lib/city";
import { PRIVACY_UPDATED } from "@/lib/policy";
import { CookieSettingsButton } from "@/components/consent/CookieSettingsButton";

const UPDATED = PRIVACY_UPDATED;
const PAGE_URL = "https://www.tapturf.in/privacy";

export const metadata: Metadata = {
  // absolute: the layout template would add a second " | TapTurf".
  title: { absolute: "Privacy Policy | TapTurf" },
  description:
    "What TapTurf collects when you browse turfs, sign in, host or join games, and how that information is used, shared and deleted.",
  alternates: { canonical: PAGE_URL },
  robots: ROBOTS_INDEX,
  twitter: TWITTER_CARD,
  openGraph: {
    ...OG_BASE,
    images: [DEFAULT_OG_IMAGE],
    title: "Privacy Policy | TapTurf",
    description:
      "What TapTurf collects when you browse turfs, sign in, host or join games, and how that information is used, shared and deleted.",
    url: PAGE_URL,
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
          signing in. We then collect only TapTurf&rsquo;s own anonymous counts (see section 5) and the
          preferences stored on your device (section 6). Only if you accept cookies do we also use Google
          Analytics, and keep each use of our free tools under a random tag your browser keeps (see
          &ldquo;When you use our free tools&rdquo; below).
        </p>
        <p>
          <strong>When you sign in with your phone number.</strong> We store your mobile number and the
          name you choose. The one-time code is sent and checked by Google Firebase; we never see the code
          itself. To diagnose &ldquo;OTP not arriving&rdquo; problems we keep a log of send attempts with the
          outcome, the error reason and the last two digits of the number only.
        </p>
        <p id="email" className="scroll-mt-24">
          <strong>Your email and phone, if you add them.</strong> If you log in with your phone, you can add
          your Google account from your profile after confirming your number with a one-time code. We then
          keep the email, name and photo Google shares, and Google or your phone number both open the same
          account; you can remove it any time. If you log in with Google, you can add your phone number after
          confirming it with a one-time code; you can then log in with that number too, and remove it any
          time. Emails typed into earlier versions of TapTurf are never used to sign you in; you can remove
          them in your profile.
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
        <p id="reports" className="scroll-mt-24">
          <strong>When you rate a turf.</strong> We store your stars, the parts you tapped, the sport and time
          of day you picked, whether you&rsquo;d play again, the rate you paid, your tip, and any private note
          to the owner. Your name, stars, taps, tip and rate are public. A private note is seen only by the
          turf&rsquo;s verified owner and TapTurf, without your name unless you choose to show it; a note
          without your name reaches the owner only together with notes from at least two other players. We
          note whether you played a TapTurf game at the turf, and may later show it on your report. Some
          reports are checked before they show, for example one from someone who runs another turf in the
          city, or one of many arriving at a turf at once; until then only you see it, marked Under review.
          We may use your TapTurf games and your Call or WhatsApp taps to ask how your game went; taps are
          never shown to anyone else. You can edit or remove your report from the turf page at any time.
        </p>
        <p id="owners" className="scroll-mt-24">
          <strong>If you claim a turf on myTapturf.</strong> We keep the TapTurf account you claimed it from,
          your role and any note you add. If you check a phone number against the listing, we keep that number
          with your claim so our team can confirm it with you; if you confirm the listed number with a code, we
          keep which number it was. Only TapTurf&rsquo;s team sees these. Once we confirm your claim, the
          turf&rsquo;s page says &ldquo;Managed by @your-username&rdquo; if you have a username and
          &ldquo;Let others find and tag me&rdquo; is on, with the verified tick if you have it. Your name,
          number and email never show there. Turning the switch off takes it off within a minute or so.
        </p>
        <p id="usernames" className="scroll-mt-24">
          <strong>Your username and public profile.</strong> You can pick a TapTurf username. Your username,
          name and photo then show on your public profile page, tapturf.in/u/your-username, with the month you
          joined. Unless you turn off &ldquo;Let others find and tag me&rdquo;, signed-in people who score live
          matches can find you by username or name and tag you as a player, and the tag links to your profile.
          If you run a turf on myTapturf, its page also says &ldquo;Managed by @your-username&rdquo; (see
          above). Turning it off hides your profile page and that line, and takes you out of search, within
          about a minute. New views of a live score stop showing your tag within about a minute too; a live
          score page someone already has open drops it at its next score update or when it is reloaded.
        </p>
        <p id="live-links" className="scroll-mt-24">
          <strong>Live score links.</strong> The free Live Cricket Scorer and Live Scoreboard keep your match
          in your browser. If you turn on a live link, the match is sent to our server as you score so others
          can follow it: the team and player names, the title and venue if you added them, every ball, point,
          goal or card with its time, the match clock, and the result. We also keep a one-way
          hash of your network address (never the address itself) so one network cannot make links in bulk.
          You log in to turn on a live link or to keep following one, but the live score others see is not tied
          to your account: your own name, number or email does not go with it. Our own record of the match
          starting notes your account and the link (see &ldquo;When you use our free tools&rdquo;), and only
          TapTurf&rsquo;s team sees it. If you tag players with their TapTurf usernames,
          those usernames go with the match. While you follow a live score, your browser joins a count of
          people watching it. Nothing about you is sent.
        </p>
        <p id="tools" className="scroll-mt-24">
          <strong>When you use our free tools.</strong> Each time you start or finish something in a free tool
          (a toss, a match on the Live Cricket Scorer or Live Scoreboard, a scorecard, a tournament, a team
          split or a net run rate), we record which tool, when, whether it was started or finished, a few short
          details the tool already knows (the sport, the format, how many overs, players, teams or matches; never
          names or anything you type), the code of the match&rsquo;s live link if it has one, and the place your
          internet connection points to, else the city you chose on TapTurf. The place is worked out from your
          IP address on that visit and is only approximate; the address itself is never stored. If you are
          signed in, the record is kept with your TapTurf account. If you are not, and you accepted cookies, it
          is kept with a random tag your browser makes for this, which says nothing about you or your device;
          if you did not accept, it is kept with no tag at all and your browser keeps nothing. The tag is never
          sent while you are signed in, your browser makes a new one each time you sign in or out, so it is not
          tied to your account, and choosing Reject deletes it. Only TapTurf&rsquo;s team sees these records,
          to learn who uses the tools and how.
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
        <li>To see who uses our free tools and what for, so we know which to improve and which sports and formats to add.</li>
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
        <p id="tick" className="scroll-mt-24">
          <strong>The verified tick.</strong> When you have confirmed both your phone number (with a one-time
          code) and your email (with Google), a tick shows next to your name on TapTurf: on your profile, in
          player search, on games and on your reports. We never show either one, or which one is missing.
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
          <li>Google Analytics, for usage statistics, only if you accept cookies (section 5).</li>
          <li>Google Maps, for the maps on turf and game pages, only if you accept cookies or tap &ldquo;Show map&rdquo; (section 5).</li>
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
    title: "Cookies, analytics and embedded content",
    body: (
      <>
        <p id="cookies" className="scroll-mt-24">
          <strong>The cookie banner.</strong> On your first visit a banner asks whether we may use the cookies
          and tools below, which TapTurf does not need to work. Accept and Reject are side by side and equally
          easy, and none of these load or are stored before you choose. Your choice is kept on your device in a
          cookie called tt_consent for about six months, and then we ask again. If your browser sends Global
          Privacy Control, we treat that as Reject unless you choose Accept yourself. You can change your choice
          at any time with Cookie settings: in the menu on phones, at the bottom of every page on a computer,
          or <CookieSettingsButton className="font-semibold underline underline-offset-2 hover:text-accent-600">right here</CookieSettingsButton>.
          Choosing Reject, then or later, stops Google Analytics at once and deletes its cookies and the notes
          described below from your device.
        </p>
        <p>
          <strong>Only if you accept.</strong>
        </p>
        <ul>
          <li>
            Google Analytics, to count visits and see which pages people use: page views, the turfs you open,
            the city and sport filters you use, and taps on Call or WhatsApp. It sets cookies (named _ga) and
            records an approximate location derived from your IP address (Google Analytics does not store the
            address itself), your device type and the pages you view. We have turned off Google signals and ad
            personalisation, so this is not used to follow you across other websites or for advertising.
          </li>
          <li>The short visit note your device keeps, described under &ldquo;When you sign up&rdquo; below.</li>
          <li>The random tag for your free tool uses, described under &ldquo;When you use our free tools&rdquo;.</li>
          <li>Maps from Google on turf and game pages (see below).</li>
        </ul>
        <p>
          <strong>What runs either way.</strong> TapTurf&rsquo;s own anonymous counts: how many times each turf
          page is viewed, taps on Call or WhatsApp, and each start or finish in a free tool. They keep nothing on
          your device, carry no tag and do not say who you are; they give turf owners their numbers on
          myTapturf and show us which tools are used. If you are signed in, a Call or WhatsApp tap and a free
          tool use are also kept with your account, as described in section 2. The site works exactly the same
          whichever you choose.
        </p>
        <p id="signup">
          <strong>When you sign up.</strong> If you accepted cookies, while you browse your device keeps a short note of how you first
          arrived (the website or campaign link that sent you, not the full address), how many times and on how
          many days you have visited, which cities, sports and turfs you looked at, when you first opened a
          turf or tapped Call or WhatsApp, and your device type, operating system and browser family. Nothing
          is sent while you are signed out. When you create an account, one summary of this is saved with your
          account so we can see where members come from and what they want. We never store your IP address,
          your full browser details or anything you type into a form here. We use it only to improve TapTurf,
          we do not sell it, and you can ask us to delete it at any time. If you did not accept, your device
          keeps no note and nothing about your visits is saved when you sign up.
        </p>
        <p id="city">
          <strong>Your city.</strong> When you use TapTurf signed in, we note one city with your account so we
          can see which cities our members are in: the city you chose on TapTurf, or found with &ldquo;Use my
          location&rdquo;, or, if you haven&rsquo;t chosen one, the city your internet connection points to,
          which is only approximate. Whether or not you chose a city, we also note the name of the place your
          internet connection points to, with its country if it is outside India. These are worked out from
          your IP address on that visit or, when that gives nothing away (for example while you are abroad),
          from the city your browser remembered from an earlier visit to TapTurf; the address itself is never
          stored. Where you have no city noted, our team may see a best guess from the turfs and games you
          used on TapTurf. Only TapTurf&rsquo;s team sees any of this, it is never shown on your profile, and
          you can ask us to delete it at any time.
        </p>
        <p>
          Turf and game pages can show a map from Google Maps, and turf photos load from Google&rsquo;s and other
          public servers. Loading these shares your IP address with those servers (with Google under{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Google&rsquo;s privacy policy
          </a>
          ). Photos are part of the page. A map loads only if you accepted cookies, or when you tap
          &ldquo;Show map&rdquo; on it, which loads just that one; &ldquo;Open in Google Maps&rdquo; takes you to
          Google instead. On turf pages a map waits for &ldquo;Show map&rdquo; either way.
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
        your cookie choice (section 5), banners you closed, whether you dismissed the &ldquo;install app&rdquo;
        prompt, whether we already asked you to pick a username, the TapTurf profiles you tagged recently, the
        WhatsApp number you last gave players for a game, and the matches and tournaments you score with our
        free tools. Only if you accept cookies does it also keep Google Analytics&rsquo; cookies, the short
        visit note described under &ldquo;When you sign up&rdquo; and the random tag described under
        &ldquo;When you use our free tools&rdquo;; choosing Reject deletes them. For a live link it also keeps the key that lets only this browser update that
        link; our server stores just a one-way hash of the key. None of this is sent to us except the sign-in
        token, which identifies you to our server, the city you picked and whether you picked it or let your
        location find it (for the city note described under &ldquo;Your city&rdquo;), that one summary when
        you create an account, the random tag with each use of a free tool, and a match while its live link is on. Clearing site data in your browser removes all of it. A live link that was
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
        <li>The sign-up summary and your city stay with your account and are deleted with it, or sooner if you ask.</li>
        <li>
          Records of your free tool use stay with your account and are deleted with it, or sooner if you ask. Those kept
          with a browser&rsquo;s random tag are not tied to any account.
        </li>
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
