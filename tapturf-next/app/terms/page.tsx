import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/contact";
import { CITY_LIST_AND } from "@/lib/city";

const UPDATED = "2026-10-07";
const PAGE_URL = "https://www.tapturf.in/terms";

export const metadata: Metadata = {
  title: "Terms of Service | TapTurf",
  description:
    "The rules for using TapTurf: finding turfs and courts, contacting venues, hosting and joining games, reviews and suggestions.",
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Terms of Service | TapTurf",
    description: "The rules for using TapTurf.",
    url: PAGE_URL,
    siteName: "TapTurf",
    type: "website",
  },
};

const Email = () => <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>;

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "The agreement",
    body: (
      <>
        <p>
          These terms are between you and TapTurf (&ldquo;TapTurf&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;),
          operated from Nashik, Maharashtra, India. They cover the website and app at tapturf.in and everything
          you do there. By using TapTurf you accept them. If you don&rsquo;t agree, please don&rsquo;t use the
          service.
        </p>
        <p>
          Our <Link href="/privacy">Privacy Policy</Link> explains how we handle personal information and is
          part of these terms.
        </p>
      </>
    ),
  },
  {
    id: "service",
    title: "What TapTurf is",
    body: (
      <>
        <p>
          TapTurf is a directory and a community board. We list sports turfs and courts in {CITY_LIST_AND}{" "}
          with their photos, prices, hours, facilities and reviews, and we let players host and join pickup
          games.
        </p>
        <p>
          <strong>We are not the venue.</strong> We don&rsquo;t own, run or book any turf. When you tap Call or
          WhatsApp you contact the venue directly, and your booking, payment, cancellation and refund are
          between you and them. We don&rsquo;t charge players a booking fee and we don&rsquo;t take payments.
        </p>
        <p>
          <strong>Listings can be out of date.</strong> Venue information comes from the venues, from public
          sources and from players. We check what we can, but prices, hours and facilities change. Confirm with
          the venue before you travel. Where a price is marked as reported by players, it is unverified.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Your account",
    body: (
      <ul>
        <li>You need an account to host or join games, write reviews and suggest corrections. Browsing is open to everyone.</li>
        <li>Sign in with your own mobile number or Google account, and keep the name on your profile real enough that other players can recognise you.</li>
        <li>You must be 18 or older, or have a parent or guardian&rsquo;s permission. Under-18s may not host games.</li>
        <li>You are responsible for what happens under your account. Tell us at <Email /> if you think someone else is using it.</li>
        <li>You can stop using TapTurf at any time and ask us to delete your account.</li>
      </ul>
    ),
  },
  {
    id: "games",
    title: "Hosting and joining games",
    body: (
      <>
        <p>
          Games on TapTurf are organised by players, for players. We provide the notice board; we don&rsquo;t
          organise, supervise or vouch for any game or any person in it.
        </p>
        <p>
          <strong>If you host.</strong> Post accurate details (venue, date, time, player count, cost per
          player). Book the venue yourself and tell players promptly if anything changes. Your name, photo and
          phone number are shown to signed-in players so they can reach you. Collect any shared cost fairly
          and directly; TapTurf is not involved in that money.
        </p>
        <p>
          <strong>If you join.</strong> Turn up if your request is accepted, or withdraw in time so someone else
          can take the spot. Pay the host your share as agreed.
        </p>
        <p>
          <strong>Safety.</strong> You take part in sport at your own risk. Check the venue and the
          playing surface, bring what you need, and look after your belongings. TapTurf isn&rsquo;t
          responsible for injuries, losses or disputes arising from a game, a booking or a meeting arranged
          through the site.
        </p>
      </>
    ),
  },
  {
    id: "content",
    title: "Reviews, suggestions and other content",
    body: (
      <>
        <p>
          You own what you post. By posting a review, correction, note or photo you give us permission to show
          it on TapTurf, to edit it for length or clarity, and to keep showing it after you leave, with your
          name attached. Email us if you want something removed.
        </p>
        <p>Keep it honest and fair:</p>
        <ul>
          <li>Review only places you have actually visited and games you actually played.</li>
          <li>No abuse, threats, hate speech, harassment or sexual content.</li>
          <li>No spam, advertising, fake reviews, or reviews of your own venue or a competitor&rsquo;s.</li>
          <li>Don&rsquo;t post other people&rsquo;s phone numbers or personal details.</li>
          <li>Don&rsquo;t post anything you don&rsquo;t have the right to share.</li>
        </ul>
        <p>
          We can edit or remove content that breaks these rules, and we can suspend or close accounts that
          keep breaking them.
        </p>
        <p>
          Some venue pages show reviews that were posted publicly on Google Maps, clearly marked as such. They
          belong to their authors and to Google, and are shown with attribution and a link to the source.
        </p>
      </>
    ),
  },
  {
    id: "owners",
    title: "For venue owners",
    body: (
      <p>
        If you own or manage a listed venue, you can ask us to correct your listing, add photos or prices, or
        remove it, by emailing <Email /> from an address or number we can verify. Listing on TapTurf is free.
        We may show player-reported prices and reviews alongside your own details, with a label saying where
        they came from.
      </p>
    ),
  },
  {
    id: "acceptable",
    title: "Acceptable use",
    body: (
      <ul>
        <li>Don&rsquo;t scrape, copy or republish our listings in bulk. Linking to a page is always fine.</li>
        <li>Don&rsquo;t try to get around sign-in, rate limits or other protections, or probe the service for weaknesses without telling us first.</li>
        <li>Don&rsquo;t use TapTurf to send unsolicited messages to venues or players.</li>
        <li>Don&rsquo;t impersonate a venue, a host or TapTurf.</li>
      </ul>
    ),
  },
  {
    id: "ip",
    title: "Our content",
    body: (
      <p>
        The TapTurf name, logo, design and the text we write are ours. Venue photos belong to the venues or
        their photographers. You may share links and short quotes with credit; anything more needs our written
        permission.
      </p>
    ),
  },
  {
    id: "liability",
    title: "What we do not promise",
    body: (
      <>
        <p>
          TapTurf is provided as it is and as available, free of charge. We work to keep it accurate and
          online but we can&rsquo;t guarantee that it always will be, or that any listing, price, review or
          game is accurate or will go ahead.
        </p>
        <p>
          To the extent the law allows, TapTurf and the people who run it aren&rsquo;t liable for any loss,
          injury or damage arising from a venue, a booking, a game, another user, or from using or being unable
          to use the site. Nothing here limits liability that cannot be limited under Indian law.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes and ending",
    body: (
      <p>
        We may change the service or these terms. For important changes we will show a notice on the site, and
        the date at the top always shows the current version. If you keep using TapTurf after a change, you
        accept the new terms. We can suspend or end access for anyone who breaks these terms.
      </p>
    ),
  },
  {
    id: "law",
    title: "Law and disputes",
    body: (
      <p>
        These terms are governed by the laws of India. Any dispute goes to the courts of Nashik, Maharashtra.
        Before that, please write to us: most problems can be sorted out with an email to <Email />.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="Short version: we list turfs and games, you deal directly with venues and other players, be honest in what you post, and play at your own risk."
      updated={UPDATED}
      sections={SECTIONS}
      sibling={{ href: "/privacy", label: "Privacy Policy" }}
    />
  );
}
