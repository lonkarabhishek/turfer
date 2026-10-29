import { Ban, History, Users } from "lucide-react";

const NOTES = {
  full: { Icon: Users, title: "This game is full", body: (taken: string) => taken },
  ended: { Icon: History, title: "This game has ended", body: () => "Joining is closed." },
  cancelled: { Icon: Ban, title: "The host cancelled this game", body: () => "Joining is closed." },
} as const;

/** Why a player can't join: full, ended or cancelled. Neutral colours, said in words. */
export function GameStatusNote({ kind, taken }: { kind: "full" | "ended" | "cancelled"; taken: string }) {
  const { Icon, title, body } = NOTES[kind];
  return (
    <div className="rounded-2xl bg-primary-50 p-4 flex gap-3 items-center">
      <span className="size-10 shrink-0 rounded-full bg-white grid place-items-center text-primary-700 shadow-soft">
        <Icon className="w-5 h-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[16px] font-semibold text-primary-900 leading-snug">{title}</p>
        <p className="text-[14px] text-primary-700 leading-snug">{body(taken)}</p>
      </div>
    </div>
  );
}
