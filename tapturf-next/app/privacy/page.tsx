import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/contact";
import { DEFAULT_OG_IMAGE, OG_BASE, ROBOTS_INDEX, TWITTER_CARD } from "@/lib/seo/defaults";
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
          tapturf.in from Nashik, Maharashtra, India. We help players find sports turfs and courts across India,
          and host or join pickup games.
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
          them in your profile. Once Google has confirmed your email, we email you about your games there (see
          &ldquo;Emails we send you&rdquo; below); a typed email is never emailed.
        </p>
        <p>
          <strong>When you sign in with Google.</strong> Google shares your name, email address and profile
          photo with us. We use that photo as your picture only if you choose it (see the next paragraph), and
          we email you about your games at that address (see &ldquo;Emails we send you&rdquo; below). We
          don&rsquo;t receive your Google password or anything else from your Google account.
        </p>
        <p id="photo" className="scroll-mt-24">
          <strong>Your profile picture, if you add one.</strong> Since 30 October 2026 a new account starts with
          your initials. On the Me tab you can upload a photo, pick one of our drawn sports avatars, or, if you
          log in with Google, choose your Google photo. Accounts made with Google before then started with their
          Google photo, which you can change or remove the same way. A photo you upload is cropped and made
          smaller on your phone, which also leaves out the details your camera adds, such as where it was taken.
          Before it shows, our server has it checked automatically for anything that must not appear next to a
          name, such as sexual or violent images or a photo of a document; a photo that fails the check is not
          kept. We keep the check&rsquo;s answer with your account to look into misuse. Your picture is public:
          it shows on your profile page, in player search, on your reports and on games you host or ask to join.
          To remove it, open the Me tab, tap your picture and choose Remove; it goes from your profile and your
          games at once, and a photo you uploaded on the Me tab is deleted from our storage. A photo you uploaded
          before 30 October 2026 stays in our storage until you ask us to delete it: email <Email />.
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
          to the owner. Your name, stars, taps, tip and rate are public. A tip can&rsquo;t hold a phone
          number, an email, a link or an @handle. A private note is seen only by the
          turf&rsquo;s verified owner and TapTurf, without your name unless you choose to show it; a note
          without your name reaches the owner only together with notes from at least two other players. If
          you played a TapTurf game at the turf (you hosted it, or were in it before it started) and it was
          over, your report says &ldquo;Played here (verified)&rdquo;; we work that out from your games each
          time the page is made, and never show which game or who else played. Reports
          go live at once. You can post one new report a day, or one for each turf where you played a
          TapTurf game that day. A turf&rsquo;s verified owner can ask TapTurf to remove a report that breaks
          the rules; it stays up while we decide, and if we remove it only you still see it, marked hidden.
          We never tell you that an owner asked, or who. We may use your TapTurf games and your Call or
          WhatsApp taps to ask how your game went; taps are never shown to anyone else. You can edit or
          remove your report from the turf page at any time.
        </p>
        <p id="review-photos" className="scroll-mt-24">
          <strong>Photos on your report, if you add any.</strong> You can add up to three photos from your
          game. Each is made smaller on your phone, which also leaves out the details your camera adds, such
          as where it was taken, and our server takes them out again. Before it is kept, our server has it
          checked automatically for anything that must not show under a review, such as sexual or violent
          images, a photo of a document or a number, an ad or a screenshot; a photo that fails the check is
          not kept. We keep the check&rsquo;s answer to look into misuse. Your photos are public once your
          report is posted: they show with it on the turf page. To remove one, edit your report and take
          it out; removing your report takes its photos with it, and so does TapTurf hiding it. A removed
          photo is deleted from our storage, as is one you added but never posted, after two days. You can
          add ten photos a day.
        </p>
        <p id="report-review" className="scroll-mt-24">
          <strong>If you report a review.</strong> When you tap Report on someone else&rsquo;s review, we
          keep the account you reported it from, the review, the reason you picked, any line you add and
          when. Only TapTurf&rsquo;s team sees these, to decide whether the review breaks the rules; the
          review stays up while we do, and its author is never told that anyone reported it, or who. You
          can report a review once (again only after it changes), and ten a day. If someone reports yours
          and we hide it, only you still see it, marked hidden.
        </p>
        <p id="owners" className="scroll-mt-24">
          <strong>If you claim a turf on myTapturf.</strong> We keep the TapTurf account you claimed it from,
          your role and any note you add. If you check a phone number against the listing, we keep that number
          with your claim so our team can confirm it with you; if you confirm the listed number with a code, we
          keep which number it was. If you ask us to remove a player&rsquo;s report on your turf, we keep the
          request with the account and sign-in it came from, the reason you picked and any line you add.
          Only TapTurf&rsquo;s team sees these. Once we confirm your claim, the
          turf&rsquo;s page says &ldquo;Managed by @your-username&rdquo; if you have a username and
          &ldquo;Let others find and tag me&rdquo; is on, with the verified tick if you have it. Your name,
          number and email never show there. Turning the switch off takes it off within a minute or so.
        </p>
        <p id="usernames" className="scroll-mt-24">
          <strong>Your username and public profile.</strong> You can pick a TapTurf username. Your username,
          name and photo then show on your public profile page, tapturf.in/u/your-username, with the month you
          joined, and, worked out from your TapTurf games and reviews: how many games you played and hosted,
          at how many turfs, in how many cities and sports, your longest run of weeks in a row with a game,
          the medals those earned and the turfs you reviewed (with your stars). Only counts: never which turfs
          you played at, when, or with whom. Unless you turn off &ldquo;Let others find and tag me&rdquo;, signed-in people who score live
          matches can find you by username or name and tag you as a player, and the tag links to your profile.
          If you run a turf on myTapturf, its page also says &ldquo;Managed by @your-username&rdquo; (see
          above). Turning it off hides your profile page and that line, and takes you out of search, within
          about a minute. New views of a live score stop showing your tag within about a minute too; a live
          score page someone already has open drops it at its next score update or when it is reloaded.
        </p>
        <p id="played-with" className="scroll-mt-24">
          <strong>Played with, and your WhatsApp number.</strong> Your Me tab lists the people who were in the
          same TapTurf games as you, once a game has happened (not one that is cancelled or still to come), with
          their name, photo, how many games you played together and when you last did, and a link to their
          public profile if they have one. Only you see your list; it is never public. Your phone number is
          not shown there unless you turn on &ldquo;Let players I&rsquo;ve played with see my WhatsApp&rdquo;
          on the Me tab. It is off until you do, and works only for a number you confirmed with a one-time
          code. While it is on, people who played a TapTurf game with you (both of you in it before it started)
          see that number, with a WhatsApp button, in their own Played with list, and nobody else does: not on
          your profile, in search or anywhere else. Turn it off at any time and it is gone from their lists
          straight away. Your Me tab and turf pages also show you, and only you, where and when you played
          (&ldquo;You played here on&rdquo; a date), worked out from your own games.
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
          people watching it. Nothing about you is sent. Opening a live score also adds one to its view count (and,
          once a day per browser, to its count of viewers), which identifies nobody and is kept after the match is cleared.
        </p>
        <p id="live-tournaments" className="scroll-mt-24">
          <strong>Live tournaments.</strong> If you start a live tournament, or turn one from the Tournament
          Manager into a live one, what you type is sent to our server so others can follow it: the
          tournament&rsquo;s and teams&rsquo; names and short codes, the venue you picked from TapTurf&rsquo;s
          turfs, the dates, the points and overs, the fixtures and their results, and for a match you score
          live, its live link&rsquo;s code and its result when it ends. We also keep a one-way hash of your
          network address (never the address itself) so one network cannot make tournaments in bulk. No login
          is needed to run one. If you are signed in, the tournament is kept with your account so you can
          manage it from another phone; your own name, number or email does not go with it, and only
          TapTurf&rsquo;s team sees which account runs it. Nothing about the people following a tournament is
          kept: opening its page adds one to its view count (and, once a day per browser, to its count of
          viewers), which identifies nobody.
        </p>
        <p>
          A turf session&rsquo;s live link puts the team names and match results on a page anyone with the link
          can see; player names stay on your phone. A session started from a game is also shown on that
          game&rsquo;s page to anyone who can see the game.
        </p>
        <p id="push" className="scroll-mt-24">
          <strong>Notifications on your phone.</strong> If you turn on &ldquo;Notifications on this phone&rdquo;
          on the Me tab and allow them when your phone asks, your browser gives us a push address for that phone
          or browser (a web address at Apple&rsquo;s, Google&rsquo;s, Mozilla&rsquo;s or Microsoft&rsquo;s push
          service) and two keys that let only TapTurf send to it and keep each message private on the way. We
          keep them with your account, with the kind of device (iPhone, Android phone, computer and so on, from
          how your browser describes itself; nothing else about it) and when a notification last reached it. You
          can turn them on on more than one phone. Each notification (someone asking to join your game, your
          request accepted or declined, a game moved or cancelled) goes through that push service to your phone,
          encrypted so the service cannot read it. Turn the switch off, or log out on that phone, and we stop
          sending there; if someone else signs in to TapTurf on that phone, it stops for you too.
        </p>
        <p id="emails" className="scroll-mt-24">
          <strong>Emails we send you.</strong> If your account has an email Google confirmed, we email you about
          your account and your games: a welcome when you make your account; when someone asks to join a game
          you host, and when a request is still waiting for your answer; when a host accepts your request; when a
          game you are in or asked to join is cancelled, or its venue, day or time changes; and a reminder the
          day before a game and about 3 hours before it starts. Each email goes only to you, from TapTurf through
          Resend, and says what it is about: the game, its day, time and venue, the host&rsquo;s first name, and
          for a host the names of the players who asked to join. Turn off each kind (Join requests and answers,
          Game changes, Reminders) on the Me tab, or with the link in any email. We keep a record of each email
          (its kind and when it was sent, never its words) with your account. If an email
          to your address bounces or you mark one as spam, we stop emailing that address. We don&rsquo;t track
          whether you open an email or tap its links, and we never send ads. We never email about booking
          requests or turf claims.
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
          tied to your account, and choosing Reject deletes it. A live link needs a login, and the account
          that turns one on is recorded with that link. Only TapTurf&rsquo;s team sees these records,
          to learn who uses the tools and how.
        </p>
        <p id="map" className="scroll-mt-24">
          <strong>When you use the map.</strong> We count how the map of turfs and games (/map) is used, per day:
          how many times it is opened, by how many browsers that day, how many turf and game cards are opened from
          it, and how often &ldquo;This turf on the map&rdquo; is opened on a turf page. Your browser sends only
          that one of these happened (and, for opening the map, whether it was the first time that day); never
          where on the map you looked, your location (&ldquo;Near me&rdquo; stays on your device) or anything
          about your device, and we don&rsquo;t store your IP address for it. If you are signed in, we also keep
          which account used the map, on which days and when (the first and last time each day), with how many
          times it opened the map, its cards and turf pages&rsquo; maps then. This runs whichever cookie choice you make, and your browser keeps only a
          note of when it last opened the map (see &ldquo;Stored on your device&rdquo;). Only TapTurf&rsquo;s team
          sees these records, to learn how many people use the map.
        </p>
        <p id="traffic" className="scroll-mt-24">
          <strong>When you visit TapTurf.</strong> We count visits and the pages opened on TapTurf, per day, to see how
          much the site is used. Each time a page opens, your browser sends which page was opened (its address on
          TapTurf, without anything after a &ldquo;?&rdquo; or &ldquo;#&rdquo;), whether it is the first page of your
          visit, and where that visit came from: the name of the website or app that sent you, when your browser says
          (Google, WhatsApp or another site&rsquo;s or app&rsquo;s name, never the address of the page you came from).
          We note the day. If you are not signed in, that is all it sends: nothing that identifies you or your device.
          If you are signed in, your browser also sends your sign-in with each page view, the same sign-in it sends
          whenever you use your account (it carries your phone number or email). Our server checks it only to count
          the view as a signed-in one and to leave the site owner&rsquo;s own browsing out, and keeps only whether you
          were signed in, never who. Your browser keeps nothing on your device for this, and we don&rsquo;t store your
          IP address for it. This runs whichever cookie choice you make. Only TapTurf&rsquo;s team sees these counts.
        </p>
        <p id="booking-requests" className="scroll-mt-24">
          <strong>If you send a booking request.</strong> On a turf that takes requests on TapTurf you can ask for 1
          to 3 of its free hours. We keep the turf, the day and hours, your note if you write one, your name and the
          phone number on your account (you need one confirmed with a one-time code), when you sent it and what
          became of it (waiting, confirmed, declined, cancelled or expired, who changed it, and the turf&rsquo;s
          reason if it gave one). The turf gets an in-app notification when you send a request or cancel a
          confirmed booking, and you get one when the turf confirms, declines or cancels it (on the phone too, for
          whoever turned that on); we never email or text about it.
          Nothing is paid on TapTurf: you pay at the turf. If you run a turf, we keep whether you turned requests on
          and each answer you give.
        </p>
        <p>
          <strong>Your location, only when you ask.</strong> On the Turf Near Me page, tapping &ldquo;Use my
          location&rdquo; sends your approximate coordinates to our server once so we can sort turfs by
          distance. The coordinates are used for that one calculation and are not stored. Everywhere else,
          distance is worked out on your device and never leaves it.
        </p>
        <p>
          <strong>What we do not collect.</strong> We don&rsquo;t take payments, so we never see card, UPI or
          bank details. You pay the venue directly for any booking.
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
        <li>To send those notifications to your phone, if you turn that on.</li>
        <li>
          To email you about your account and your games, if your account has an email Google confirmed: the
          six kinds under &ldquo;Emails we send you&rdquo; above. Turn each kind off on the Me tab or with the
          link in the email.
        </li>
        <li>To show hosts who wants to join their game, and to show players how to reach the host.</li>
        <li>To publish reviews and venue corrections you submit.</li>
        <li>To show a live score to the people you send its link to, and how many are watching.</li>
        <li>To show a live tournament, its table, fixtures and results, to the people you send its link to.</li>
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
          your name, photo and any note you wrote. Reviews show your name. People you played a game with see
          your name and photo in their Played with list, and your WhatsApp number only if you turn that on
          (see &ldquo;Played with, and your WhatsApp number&rdquo; above).
        </p>
        <p>
          <strong>Live scores.</strong> Anyone with a live link can see that score, names included.
          Links are not listed anywhere on TapTurf and are hidden from search engines, but anyone who has one
          can forward it, so ask your players before you add or tag them. Turn the link off in the scorer at
          any time, or email <Email /> and we will take it down.
        </p>
        <p>
          <strong>Live tournaments.</strong> Anyone with a tournament&rsquo;s link can see it, team names and
          results included. Like live links, tournaments are not listed anywhere on TapTurf and are hidden from
          search engines. Take it down from its page at any time, or email <Email /> and we will.
        </p>
        <p>
          <strong>Your profile.</strong> If you pick a username, your username, name, photo and join month are
          public on your profile page and in player search, and your profile also shows your game and review
          counts, medals and reviewed turfs (see &ldquo;Your username and public profile&rdquo; above), unless
          you turn off &ldquo;Let others find and tag me&rdquo;. Your phone number and email are never shown
          there.
        </p>
        <p id="tick" className="scroll-mt-24">
          <strong>The verified tick.</strong> When you have confirmed both your phone number (with a one-time
          code) and your email (with Google), a tick shows next to your name on TapTurf: on your profile, in
          player search, on games and on your reports. We never show either one, or which one is missing.
        </p>
        <p>
          <strong>Venues.</strong> When you tap Call or WhatsApp you contact the venue yourself, and from then on
          their own privacy terms apply. When you send a booking request, we pass your name, your number and your
          note to the people who run that turf on myTapturf (its owner and managers), and to no one else, so they
          can confirm it and reach you. They see them while the request waits for an answer and, once confirmed,
          until its hours end; the notifications they get about it don&rsquo;t name you. If you run a turf, players see your turf&rsquo;s answer and the reason you give,
          never your name or number.
        </p>
        <p>
          <strong>Service providers.</strong> We use a small number of companies to run TapTurf. They process
          data on our instructions and cannot use it for their own purposes:
        </p>
        <ul>
          <li>Supabase, which hosts our database, handles Google sign-in sessions and counts who is watching a live score.</li>
          <li>Google Firebase, which sends and verifies phone one-time codes.</li>
          <li>
            Anthropic, whose AI checks a profile photo you upload before it shows, checks the photos you add
            to a report and the photos turf owners add, and answers questions in Ask TapTurf.
          </li>
          <li>Vercel, which hosts the website.</li>
          <li>
            Apple, Google, Mozilla and Microsoft, whose push services carry notifications to your phone, encrypted
            so they cannot read them, only if you turn them on (&ldquo;Notifications on your phone&rdquo; above).
          </li>
          <li>Google Analytics, for usage statistics, only if you accept cookies (section 5).</li>
          <li>Google Maps, for the maps on turf and game pages, only if you accept cookies or tap &ldquo;Show map&rdquo; (section 5).</li>
          <li>Resend, which sends our emails.</li>
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
          page is viewed, the pages opened and where visits came from (see &ldquo;When you visit TapTurf&rdquo;),
          taps on Call or WhatsApp, and each start or finish in a free tool. They keep nothing on
          your device and, while you are signed out, carry no tag and do not say who you are; they give turf owners
          their numbers on myTapturf and show us which tools are used. If you are signed in, a Call or WhatsApp tap
          and a free tool use are also kept with your account, as described in section 2, and each page you open
          sends your sign-in, which our server checks only to count the view as a signed-in one, keeping nothing of
          who you are (see &ldquo;When you visit TapTurf&rdquo;). The site works exactly the same whichever you
          choose.
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
          Google instead. On turf pages a map waits for &ldquo;Show map&rdquo; either way. The map of turfs and
          games at /map loads its street map from OpenFreeMap as soon as you open it, which shares your IP
          address and the area you are looking at with OpenFreeMap; it sets no cookies.
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
        WhatsApp number you last gave players for a game, the matches and tournaments you score with our
        free tools, and which live scores and tournaments it opened in the last two days and when it last opened the map (so a reload is not counted as another view). Only if you accept cookies does it also keep Google Analytics&rsquo; cookies, the short
        visit note described under &ldquo;When you sign up&rdquo; and the random tag described under
        &ldquo;When you use our free tools&rdquo;; choosing Reject deletes them. For a live link or a live tournament it also keeps the key that lets only this browser update
        it; our server stores just a one-way hash of the key. While you are signed in, your browser also runs
        a small TapTurf script (a service worker) whose only job is to show our notifications and open the page
        you tap; it keeps nothing and does not change how pages load. If you turn on notifications, the
        browser keeps its push address for us and notes which account turned them on. None of this is sent to us except the sign-in
        token, which identifies you to our server, the city you picked and whether you picked it or let your
        location find it (for the city note described under &ldquo;Your city&rdquo;), that one summary when
        you create an account, the random tag with each use of a free tool, a match while its live link is on, and the push address when you turn notifications on. Clearing site data in your browser removes all of it. A live link that was
        on then stops updating, as any live link does after 2 hours without a new score, and is cleared 30 days
        after its last update, or sooner if you email us.
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
          Your profile picture stays until you change or remove it. A photo uploaded on the Me tab that you
          replace or remove is deleted from our storage; the automatic check&rsquo;s answer for it stays with your
          account, and goes with it. One uploaded before 30 October 2026 is deleted when you ask us.
        </li>
        <li>
          A photo on your report stays until you take it out, remove the report, or TapTurf hides it; then it
          is deleted from our storage. One you added but never posted is deleted after two days. The
          automatic check&rsquo;s answer stays with the record of the photo.
        </li>
        <li>
          A report of a review you sent, and what TapTurf decided, is kept so we can see how reviews are
          reported and spot misuse; it is never shown to the review&rsquo;s author.
        </li>
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
          Records of your map use stay with your account and are deleted with it, or sooner if you ask. The daily
          counts of the map&rsquo;s use name nobody and are kept as totals.
        </li>
        <li>A booking request stays with your account and is deleted with it, or sooner if you ask.</li>
        <li>
          The record of each email we sent you (its kind and when, never its words) and your email switches stay
          with your account and are deleted with it, or sooner if you ask. An address that bounced or was
          marked as spam is kept only as a one-way hash, so we never email it again.
        </li>
        <li>The daily counts of visits and pages opened name nobody and are kept as totals.</li>
        <li>
          A live link stops updating after 2 hours without a new score; people with the link then see the last
          score. A live score is cleared when you turn its link off, or 30 days after its last update. The
          one-way hash of the network address is kept for 2 days to stop misuse.
        </li>
        <li>
          A live tournament stays until you take it down from its page; then its page says only that it was
          taken down, and the record (its names, fixtures and results) is kept unless you ask us to remove it.
          The one-way hash of the network address is kept for 2 days to stop misuse.
        </li>
        <li>
          A phone&rsquo;s push address and keys stay with your account, marked off once you turn notifications
          off there, log out there, or its push service says it has ended; we never send to it again unless you
          turn them on there again. They go with your account, or sooner if you ask.
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
          You can edit your name, your username, your profile picture and whether others can find and tag you
          from the Me tab, and leave or cancel games. For anything else,
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
