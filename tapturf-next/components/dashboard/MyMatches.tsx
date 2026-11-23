"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Award, ChevronRight, Coins, Play, Radio, Repeat, Smartphone, Tally5, Trophy, Users } from "lucide-react";
import { MyTournaments } from "@/components/tournament/MyTournaments";
import { usePlayed } from "@/components/profile/usePlayed";
import { STATE_WORD, linkLine, linkState, linkTitle, linkWhen, orderLinks, sportWord, type LinkState, type MineLink } from "@/lib/matches/links";
import { OTHER_SPORTS, PHONE_HREF, SHORTCUTS, TOOL_MEDALS_HREF, heldMatch, matchesShape, phoneItems, toolMedalWords, type PhoneItem } from "@/lib/matches/phone";
import { agoWords } from "@/lib/games/when";
import { bringUp, type MatchesData } from "./useMatches";

const SHORTCUT_ICON: Record<(typeof SHORTCUTS)[number]["key"], typeof Activity> = { score: Activity, tournament: Trophy, toss: Coins, teams: Users };
const PHONE_ICON: Record<PhoneItem["kind"], typeof Activity> = { cricket: Activity, board: Tally5, session: Repeat };

const STATE_TONE: Record<LinkState, string> = {
  live: "bg-hot-500 text-white",
  finished: "bg-primary-100 text-primary-700",
  stopped: "bg-amber-100 text-amber-800",
};

/**
 * "Matches" on the Me tab (the site owner, 23 Nov 2026: "show My
 * Tournaments, My live matches etc all tools related stuff before the
 * Profile tab"): everything of theirs from the free tools, most useful
 * first. The live matches they started (GET /api/live/mine: the two
 * sides, the score line or result as the follower page says it, Live,
 * Finished or Stopped, when, its tournament, a link to /live/<code>; a
 * live one leads, and says "Continue scoring" on the phone that holds its
 * key); My tournaments; what this phone alone holds (a scorer match or a
 * scoreboard without a live link, a turf session), each opening its tool
 * where it was left; then the ways into the tools, which are the whole tab
 * for someone with nothing yet. Every word is lib/matches/. Shown to the
 * signed-in player alone; before 20261124_live_mine.sql the server's list
 * is simply not there.
 */
export function MyMatches({ data }: { data: MatchesData }) {
  const router = useRouter();
  const played = usePlayed();
  const { links, tournaments, stores, now } = data;
  const shown = new Set((links ?? []).map((l) => l.code));
  const phone = phoneItems(stores, shown);
  const shape = matchesShape({ links, tournaments: tournaments?.length, phone: phone.items.length });
  const medals = played ? toolMedalWords(played.medals) : null;

  /** Open a thing on this phone in its tool, where it was left. */
  const open = (kind: PhoneItem["kind"], id: string) => {
    bringUp(kind, id);
    router.push(PHONE_HREF[kind]);
  };

  if (shape === "loading") {
    return (
      <div className="space-y-3" role="status" aria-label="Loading your matches">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-primary-200 rounded-2xl p-4 animate-pulse bg-white">
            <div className="w-2/3 h-5 bg-primary-100 rounded mb-2" />
            <div className="w-1/3 h-4 bg-primary-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (shape === "empty") {
    return (
      <div data-matches="empty">
        <div className="text-center pt-6 pb-5">
          <div className="w-14 h-14 bg-accent-50 border border-accent-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-6 h-6 text-accent-600" aria-hidden />
          </div>
          <h2 className="text-[17px] font-bold text-primary-900">Nothing here yet</h2>
          <p className="mt-1 mx-auto max-w-[34ch] text-[14px] leading-snug text-primary-600">Score a match or run a tournament and it shows up here. All free, on your phone at the ground.</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {SHORTCUTS.map((s) => {
            const Icon = SHORTCUT_ICON[s.key];
            return (
              <li key={s.key}>
                <Link href={s.href} className="flex items-center gap-3 h-full min-h-[64px] rounded-2xl border border-primary-200 bg-white px-4 py-3 hover:border-accent-500 transition-colors focus-neon">
                  <span className="grid place-items-center w-10 h-10 shrink-0 rounded-xl bg-accent-50 border border-accent-500/30">
                    <Icon className="w-5 h-5 text-accent-600" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-primary-900">{s.label}</span>
                    <span className="block text-[13px] leading-snug text-primary-500">{s.line}</span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-primary-400 shrink-0" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
        <Foot medals={medals} />
      </div>
    );
  }

  const live = orderLinks(links ?? [], now);
  return (
    <div data-matches="full" className="space-y-8">
      {live.length > 0 && (
        <section aria-labelledby="my-live-matches">
          <h2 id="my-live-matches" className="mb-2 text-[17px] font-bold text-primary-900">
            Live matches
          </h2>
          <ul className="space-y-3">
            {live.map((l) => (
              <LinkRow key={l.code} link={l} now={now} held={heldMatch(l.code, stores)} onOpen={open} />
            ))}
          </ul>
        </section>
      )}

      <MyTournaments rows={tournaments ?? []} />

      {phone.items.length > 0 && (
        <section aria-labelledby="on-this-phone">
          <h2 id="on-this-phone" className="flex items-center gap-2 text-[17px] font-bold text-primary-900">
            <Smartphone className="w-[18px] h-[18px] text-primary-500" aria-hidden />
            On this phone
          </h2>
          <p className="mt-0.5 mb-2 text-[13px] leading-snug text-primary-500">Kept in this browser, not in your account: you&apos;ll find these on this phone only.</p>
          <ul className="rounded-2xl border border-primary-200 bg-white divide-y divide-primary-100 overflow-hidden">
            {phone.items.map((it) => {
              const Icon = PHONE_ICON[it.kind];
              return (
                <li key={`${it.kind}-${it.id}`}>
                  <button type="button" onClick={() => open(it.kind, it.id)} className="flex w-full items-center gap-3 px-4 py-3 min-h-[64px] text-left hover:bg-primary-50 focus-neon">
                    <span className="grid place-items-center w-10 h-10 shrink-0 rounded-xl bg-primary-50 border border-primary-200">
                      <Icon className="w-5 h-5 text-primary-600" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold leading-snug text-primary-900 break-words">{it.title}</span>
                      {it.line && <span className="block text-[13px] leading-snug text-primary-700">{it.line}</span>}
                      <span className="mt-0.5 block text-[12px] leading-snug text-primary-500">
                        {it.what} · <span className={it.open ? "font-semibold text-accent-700" : ""}>{it.state}</span> · {agoWords(it.updatedAt, now)}
                      </span>
                    </span>
                    <ChevronRight className="w-5 h-5 text-primary-400 shrink-0" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          {phone.more > 0 && <p className="mt-2 text-[13px] text-primary-500">And {phone.more} older, in each tool&apos;s own list.</p>}
        </section>
      )}

      <section aria-labelledby="matches-start">
        <h2 id="matches-start" className="mb-2 text-[15px] font-bold text-primary-900">
          Start something
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SHORTCUTS.map((s) => {
            const Icon = SHORTCUT_ICON[s.key];
            return (
              <li key={s.key}>
                <Link href={s.href} className="flex items-center justify-center gap-1.5 min-h-[44px] rounded-full border border-primary-200 bg-white px-2 text-[13px] font-semibold text-primary-800 whitespace-nowrap hover:border-accent-500 transition-colors focus-neon">
                  <Icon className="w-4 h-4 shrink-0 text-accent-600" aria-hidden />
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <Foot medals={medals} />
      </section>
    </div>
  );
}

/** One live link: what it is and its state, a link to the page followers see, its tournament, and the way back to scoring it on the phone that holds its key. */
function LinkRow({ link, now, held, onOpen }: { link: MineLink; now: number; held: { kind: "cricket" | "board"; id: string } | null; onOpen: (kind: "cricket" | "board", id: string) => void }) {
  const state = linkState(link, now);
  const line = linkLine(link, now);
  const isLive = state === "live";
  return (
    <li data-live-link={state} className={`rounded-2xl border bg-white overflow-hidden ${isLive ? "border-hot-500/50 shadow-card" : "border-primary-200"}`}>
      <Link href={`/live/${link.code}`} prefetch={false} className="flex items-start gap-3 px-4 py-3 min-h-[64px] hover:bg-primary-50 focus-neon">
        <span className={`mt-0.5 grid place-items-center w-10 h-10 shrink-0 rounded-xl border ${isLive ? "bg-hot-500/10 border-hot-500/40" : "bg-accent-50 border-accent-500/30"}`}>
          {link.tool === "board" ? <Tally5 className={`w-5 h-5 ${isLive ? "text-hot-600" : "text-accent-600"}`} aria-hidden /> : <Activity className={`w-5 h-5 ${isLive ? "text-hot-600" : "text-accent-600"}`} aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 text-[15px] font-semibold leading-snug text-primary-900 break-words">{linkTitle(link)}</span>
            <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATE_TONE[state]}`}>
              {isLive && <span className="w-1.5 h-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden />}
              {STATE_WORD[state]}
            </span>
          </span>
          {line && <span className="mt-0.5 block text-[14px] leading-snug text-primary-800">{line}</span>}
          <span className="mt-0.5 block text-[12px] text-primary-500">
            {sportWord(link)} · {linkWhen(link, now)}
          </span>
        </span>
        <ChevronRight className="mt-2.5 w-5 h-5 text-primary-400 shrink-0" aria-hidden />
      </Link>
      {(link.tournament || held) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-primary-100 px-2 py-1">
          {held && (
            <button
              type="button"
              onClick={() => onOpen(held.kind, held.id)}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold focus-neon ${isLive ? "bg-hot-500 text-white hover:bg-hot-600" : "text-accent-700 hover:bg-accent-50"}`}
            >
              {isLive ? <Play className="w-4 h-4" aria-hidden /> : <Radio className="w-4 h-4" aria-hidden />}
              {isLive ? "Continue scoring" : "Open on this phone"}
            </button>
          )}
          {link.tournament && (
            <Link href={`/tournament/${link.tournament.code}`} prefetch={false} className="inline-flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-accent-700 hover:bg-accent-50 focus-neon">
              <Trophy className="w-4 h-4 shrink-0" aria-hidden />
              <span className="truncate">{link.tournament.name}</span>
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

/** Under the shortcuts: the scoreboard for other sports, every tool, and the tool medals earned so far. */
function Foot({ medals }: { medals: string | null }) {
  return (
    <div className="mt-3 space-y-1 text-[13px] leading-snug text-primary-500">
      <p>
        Football, badminton or another sport? Use the{" "}
        <Link href={OTHER_SPORTS.href} className="inline-block py-1 font-semibold text-accent-700 underline underline-offset-2">
          {OTHER_SPORTS.label}
        </Link>
        . Or see{" "}
        <Link href="/tools" className="inline-block py-1 font-semibold text-accent-700 underline underline-offset-2">
          all the free tools
        </Link>
        .
      </p>
      {medals && (
        <p data-tool-medals-pointer>
          <Link href={TOOL_MEDALS_HREF} className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-primary-700 hover:text-accent-700">
            <Award className="w-4 h-4 text-accent-600" aria-hidden />
            {medals}
            <ChevronRight className="w-4 h-4 text-primary-400" aria-hidden />
          </Link>
        </p>
      )}
    </div>
  );
}
