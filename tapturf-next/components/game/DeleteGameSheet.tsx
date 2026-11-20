"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Users, X } from "lucide-react";
import { Sheet } from "@/components/account/Sheet";
import { useAuth } from "@/components/auth/AuthProvider";
import { deleteGame, getGameRemoval } from "@/lib/queries/games";
import { REMOVE_COPY, removeGameLine, removeLines, type Removal } from "@/lib/games/remove";
import type { Game } from "@/types/game";

/**
 * "Delete this game?": the confirm step, from the game's edit sheet and
 * from its row on the Me tab. When it opens it asks the server what
 * deleting THIS game would do (GET /api/games/<id>/removal) and says it
 * plainly: who will be told it is off, that it leaves TapTurf, and for a
 * game already played that it leaves the host's own Passport too. A game
 * played with other people can't go: the sheet says why and offers no
 * Delete. The words are lib/games/remove.ts (removeLines), which the
 * tests read. onDeleted gets how many people were told.
 */
export function DeleteGameSheet({
  game,
  venue,
  onClose,
  onDeleted,
}: {
  game: Game;
  /** The venue's name, for the line that says which game this is. */
  venue?: string | null;
  onClose: () => void;
  onDeleted: (told: number) => void;
}) {
  const { getToken } = useAuth();
  const token = useRef(getToken);
  useEffect(() => {
    token.current = getToken;
  });
  const [asked, setAsked] = useState<{ for: string; removal: Removal | null; error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void getGameRemoval(() => token.current(), game.id).then((r) => alive && setAsked({ for: game.id, removal: r.data, error: r.error ?? "" }));
    return () => {
      alive = false;
    };
  }, [game.id]);

  const answer = asked && asked.for === game.id ? asked : null;
  const words = answer?.removal ? removeLines(answer.removal, game) : null;
  const lines = words && "lines" in words ? words.lines : null;
  const blocked = words && "blocked" in words ? words.blocked : null;

  const confirm = async () => {
    setBusy(true);
    setError("");
    const r = await deleteGame(() => token.current(), game.id);
    if (r.error !== null) {
      setBusy(false);
      setError(r.error);
      return;
    }
    onDeleted(r.told);
  };

  return (
    <Sheet labelledBy="delete-game-h" onClose={onClose} locked={busy}>
      <div className="flex items-start justify-between gap-3">
        <h2 id="delete-game-h" className="text-[20px] font-bold leading-tight text-primary-900">
          {REMOVE_COPY.title}
        </h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-primary-100 disabled:opacity-50">
          <X className="h-5 w-5 text-primary-700" aria-hidden />
        </button>
      </div>
      <p className="mt-1 text-[15px] font-medium leading-snug text-primary-700 break-words">{removeGameLine(game, venue)}</p>

      {!answer && (
        <p role="status" className="mt-5 mb-2 flex items-center gap-2 text-[15px] text-primary-600">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          {REMOVE_COPY.checking}
        </p>
      )}

      {answer && !words && (
        <>
          <p role="alert" className="mt-4 rounded-2xl bg-primary-50 px-4 py-3 text-[15px] leading-snug text-primary-800">
            {answer.error || REMOVE_COPY.failed}
          </p>
          <button type="button" onClick={onClose} className="mt-4 h-12 w-full rounded-full bg-primary-900 text-[16px] font-semibold text-white hover:bg-primary-800">
            {REMOVE_COPY.close}
          </button>
        </>
      )}

      {blocked && (
        <>
          <p className="mt-4 rounded-2xl bg-primary-50 px-4 py-3 text-[15px] leading-snug text-primary-800">{blocked}</p>
          <button type="button" onClick={onClose} className="mt-4 h-12 w-full rounded-full bg-primary-900 text-[16px] font-semibold text-white hover:bg-primary-800">
            {REMOVE_COPY.close}
          </button>
        </>
      )}

      {lines && (
        <>
          <p className="mt-4 flex items-start gap-3 rounded-2xl bg-primary-50 px-4 py-3 text-[15px] font-semibold leading-snug text-primary-900">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" aria-hidden />
            <span>{lines[0]}</span>
          </p>
          <ul className="mt-3 space-y-2 pl-1">
            {lines.slice(1).map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[15px] leading-snug text-primary-700">
                <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-primary-300" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="mt-3 text-[14px] font-medium text-hot-600">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-hot-600 text-[16px] font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            {busy ? REMOVE_COPY.deleting : REMOVE_COPY.confirm}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="mt-1 min-h-12 w-full rounded-full text-[15px] font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50">
            {REMOVE_COPY.keep}
          </button>
        </>
      )}
    </Sheet>
  );
}
