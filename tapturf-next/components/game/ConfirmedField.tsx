"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { searchPlayers } from "@/lib/account/client";
import { getPassport } from "@/lib/profile/client";
import { CONFIRMED_COPY, EXTRA_MAX, NAME_MAX, confirmedLimits, confirmedName, nameProblem, nameProblemText } from "@/lib/games/confirmed";
import type { GameTag } from "@/lib/games/types";
import { Avatar } from "./detail/Avatar";

/** A TapTurf player picked to tag, by their public username. */
export type TagPick = { u: string; name: string; photo: string | null };

/** What the section holds until the game is posted or the edit is saved. */
export type ConfirmedDraft = {
  names: string[];
  extra: number;
  /** New tags (told when the save goes through). */
  tags: TagPick[];
  /** The edit sheet: ids of waiting tags the host is taking back. */
  untag: string[];
};

export const emptyConfirmed = (): ConfirmedDraft => ({ names: [], extra: 0, tags: [], untag: [] });

/** How many spots the draft takes, with the tags already waiting (the edit sheet). */
export function draftCount(d: ConfirmedDraft, waiting: readonly GameTag[] = []): number {
  return d.names.length + d.extra + d.tags.length + waiting.filter((t) => !d.untag.includes(t.id)).length;
}

type Hit = TagPick & { played?: boolean };

/**
 * "Already confirmed (optional)": the friends a host says are in before
 * anyone joins on TapTurf (lib/games/confirmed.ts). The one field takes a
 * name (Add name, or Enter) and doubles as a search: the people the host
 * played with first, then TapTurf players who let others find and tag
 * them; picking one makes a tag. A stepper counts the people without a
 * name. Nothing here is required. It never lets the lineup pass max
 * players: `joined` is the host and the players in the game already.
 */
export function ConfirmedField({
  value,
  onChange,
  max,
  joined,
  waiting = [],
  repeat = false,
  className = "",
}: {
  value: ConfirmedDraft;
  onChange: (v: ConfirmedDraft) => void;
  max: number;
  joined: number;
  /** The edit sheet: tagged players who have not answered yet. */
  waiting?: readonly GameTag[];
  /** The create flow, for a repeat: says what goes on every game. */
  repeat?: boolean;
  className?: string;
}) {
  const { user, getToken } = useAuth();
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  // The people the host played with who have a public username: read once, when the field is first used.
  const [played, setPlayed] = useState<Hit[] | null>(null);
  const askedPlayed = useRef(false);

  const stillWaiting = waiting.filter((t) => !value.untag.includes(t.id));
  const lim = confirmedLimits({ max, joined, names: value.names.length, extra: value.extra, tags: value.tags.length + stillWaiting.length });
  const taken = new Set([...value.tags.map((t) => t.u), ...stillWaiting.map((t) => t.u).filter((u): u is string => !!u), ...(user?.username ? [user.username] : [])]);

  const loadPlayed = () => {
    if (askedPlayed.current) return;
    askedPlayed.current = true;
    void (async () => {
      const t = await getToken().catch(() => null);
      if (!t || !("token" in t)) return setPlayed([]);
      const a = await getPassport(t.token).catch(() => null);
      const list = a && "ok" in a && Array.isArray(a.ok.playedWith) ? a.ok.playedWith : [];
      setPlayed(list.filter((p) => !!p.username).map((p) => ({ u: p.username as string, name: p.name, photo: p.photo, played: true })));
    })();
  };

  // The search: 2 letters or more, a moment after the last key.
  const q = text.trim();
  useEffect(() => {
    if (q.replace(/^@/, "").length < 2) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const t = await getToken().catch(() => null);
      if (!alive || !t || !("token" in t)) return;
      const a = await searchPlayers(t.token, q).catch(() => null);
      if (!alive) return;
      setHits(a && a.status === 200 && "players" in a.body ? a.body.players.map((p) => ({ u: p.u, name: p.name, photo: p.photo })) : []);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, getToken]);

  const low = q.replace(/^@/, "").toLowerCase();
  const fromPlayed = (played ?? []).filter((p) => !low || p.name.toLowerCase().includes(low) || p.u.startsWith(low));
  const fromSearch = low.length >= 2 ? hits.filter((h) => !fromPlayed.some((p) => p.u === h.u)) : [];
  const shown = [...fromPlayed.slice(0, 5), ...fromSearch].filter((h) => !taken.has(h.u)).slice(0, 8);

  const addName = () => {
    const p = nameProblem(text);
    if (p) return setError(nameProblemText(p));
    if (!lim.canAddName) return setError(CONFIRMED_COPY.full);
    onChange({ ...value, names: [...value.names, confirmedName(text) as string] });
    setText("");
    setError("");
    setOpen(false);
  };
  const pick = (h: Hit) => {
    if (!lim.canAddTag) return setError(CONFIRMED_COPY.full);
    onChange({ ...value, tags: [...value.tags, { u: h.u, name: h.name, photo: h.photo }] });
    setText("");
    setError("");
    setOpen(false);
  };

  const chip = "h-10 max-w-full inline-flex items-center gap-1.5 rounded-full border text-[14px] text-primary-900";
  const remove = "size-8 -mr-1 grid place-items-center rounded-full text-primary-500 hover:bg-primary-100 hover:text-primary-900";
  const any = value.names.length + value.tags.length + stillWaiting.length > 0;

  return (
    <section aria-labelledby={`${id}-h`} className={className}>
      <h3 id={`${id}-h`} className="text-[15px] font-semibold text-primary-900">{CONFIRMED_COPY.title}</h3>
      <p className="mt-0.5 text-[13px] leading-snug text-primary-500">{CONFIRMED_COPY.hint}</p>

      {any && (
        <ul aria-label="Confirmed so far" className="mt-3 flex flex-wrap gap-2">
          {value.names.map((n, i) => (
            <li key={`n${i}`} className={`${chip} border-primary-200 bg-primary-50 pl-3 pr-1`}>
              <span className="min-w-0 truncate">{n}</span>
              <button type="button" aria-label={`Remove ${n}`} className={remove} onClick={() => onChange({ ...value, names: value.names.filter((_, j) => j !== i) })}>
                <X className="w-4 h-4" aria-hidden />
              </button>
            </li>
          ))}
          {stillWaiting.map((t) => (
            <li key={t.id} className={`${chip} border-primary-200 bg-white pl-1 pr-1`}>
              <Avatar src={t.photo} name={t.name} size={28} />
              <span className="min-w-0 truncate">{t.name}</span>
              <span className="text-[12px] font-semibold bg-primary-100 text-primary-700 px-2 rounded-full leading-5">Waiting</span>
              <button type="button" aria-label={`Untag ${t.name}`} className={remove} onClick={() => onChange({ ...value, untag: [...value.untag, t.id] })}>
                <X className="w-4 h-4" aria-hidden />
              </button>
            </li>
          ))}
          {value.tags.map((t) => (
            <li key={t.u} className={`${chip} border-accent-500/40 bg-accent-50 pl-1 pr-1`}>
              <Avatar src={t.photo} name={t.name} size={28} />
              <span className="min-w-0 truncate">{t.name}</span>
              <span className="text-[12px] font-semibold text-accent-800">Tagged</span>
              <button type="button" aria-label={`Remove ${t.name}`} className={remove} onClick={() => onChange({ ...value, tags: value.tags.filter((x) => x.u !== t.u) })}>
                <X className="w-4 h-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative mt-3">
        <div className="flex gap-2">
          <label htmlFor={`${id}-name`} className="sr-only">A friend&apos;s first name or nickname, or search TapTurf players to tag</label>
          <input
            id={`${id}-name`}
            type="text"
            value={text}
            maxLength={NAME_MAX + 10}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
            role="combobox"
            aria-expanded={open && shown.length > 0}
            aria-controls={`${id}-list`}
            aria-describedby={error ? `${id}-err` : undefined}
            placeholder={CONFIRMED_COPY.namePlaceholder}
            onFocus={() => {
              loadPlayed();
              setOpen(true);
            }}
            onChange={(e) => {
              setText(e.target.value);
              setError("");
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (q) addName();
              } else if (e.key === "Escape") setOpen(false);
            }}
            className="min-w-0 flex-1 h-12 rounded-xl border border-primary-200 bg-primary-50 px-4 text-base md:text-sm text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600"
          />
          <button
            type="button"
            onClick={addName}
            disabled={!q}
            className="h-12 shrink-0 inline-flex items-center gap-1 rounded-xl border border-primary-300 px-3 text-[14px] font-semibold text-primary-900 hover:bg-primary-50 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" aria-hidden />
            {CONFIRMED_COPY.add}
          </button>
        </div>
        {open && shown.length > 0 && (
          <ul id={`${id}-list`} role="listbox" aria-label="TapTurf players to tag" className="mt-2 overflow-hidden rounded-xl border border-primary-200 bg-white shadow-elevated">
            {shown.map((h) => (
              <li key={h.u} role="option" aria-selected={false}>
                <button type="button" onClick={() => pick(h)} className="w-full min-h-12 flex items-center gap-3 px-3 py-2 text-left hover:bg-primary-50">
                  <Avatar src={h.photo} name={h.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-primary-900">{h.name}</span>
                    <span className="block truncate text-[12px] text-primary-500">@{h.u}{h.played ? " · played with you" : ""}</span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold text-accent-800">Tag</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <p id={`${id}-err`} role="alert" className="mt-1.5 text-[13px] text-hot-600">{error}</p>
        ) : (
          <p className="mt-1.5 text-[12px] text-primary-500">{CONFIRMED_COPY.fieldHint}</p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 min-h-11">
        <span id={`${id}-more`} className="text-[15px] text-primary-800">{CONFIRMED_COPY.more}</span>
        <div className="flex items-center gap-3 bg-primary-100 rounded-xl p-1" role="group" aria-labelledby={`${id}-more`}>
          <button
            type="button"
            aria-label="One fewer without a name"
            disabled={value.extra <= 0}
            onClick={() => onChange({ ...value, extra: Math.max(0, value.extra - 1) })}
            className="w-9 h-9 grid place-items-center rounded-lg bg-white text-primary-800 shadow-sm disabled:opacity-40"
          >
            <Minus className="w-4 h-4" aria-hidden />
          </button>
          <span className="min-w-9 text-center font-mono text-[15px] font-bold text-primary-800 tabular" aria-live="polite">+{value.extra}</span>
          <button
            type="button"
            aria-label="One more without a name"
            disabled={!lim.canAddExtra || value.extra >= EXTRA_MAX}
            onClick={() => onChange({ ...value, extra: Math.min(EXTRA_MAX, value.extra + 1) })}
            className="w-9 h-9 grid place-items-center rounded-lg bg-white text-primary-800 shadow-sm disabled:opacity-40"
          >
            <Plus className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </div>

      {lim.total > joined && (
        <p className={`mt-2 text-[13px] ${lim.over ? "text-hot-600" : "text-primary-700"}`} role={lim.over ? "alert" : undefined}>
          {lim.over
            ? `That's ${lim.total} people for ${max} spots. Raise max players, or confirm fewer.`
            : lim.room === 0
              ? `${lim.total} of ${max} going: the game will show as full.`
              : `${lim.total} of ${max} going · ${lim.room} spot${lim.room === 1 ? "" : "s"} left for others.`}
        </p>
      )}
      <p className="mt-1.5 text-[12px] leading-snug text-primary-500">
        {CONFIRMED_COPY.publicNote}
        {repeat ? ` ${CONFIRMED_COPY.repeatNote}` : ""}
      </p>
    </section>
  );
}
