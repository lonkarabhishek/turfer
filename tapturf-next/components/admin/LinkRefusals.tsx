import { istDateTime } from "@/lib/admin/people";
import { refusalText, refusalsOf, type Refusal } from "@/lib/admin/links";
import { linkRefusalRows } from "@/lib/queries/adminLinks";
import { signupPeople } from "@/lib/queries/adminUsers";

/**
 * What people couldn't add to their account in the last 90 days (a Google
 * account or a number another account holds), and Google accounts added
 * over their own empty account, with both accounts a tap away, so the
 * owner can follow up by hand. Nothing is ever joined or moved. Server
 * component; nothing shows before 20261026_account_links.sql.
 */
const day = (t: number) => istDateTime(t).split(",")[0];

export async function LinkRefusals() {
  const [rows, { people }] = await Promise.all([linkRefusalRows(), signupPeople()]);
  const all = refusalsOf(rows);
  if (!all.length) return null;
  const names = new Map((people ?? []).map((p) => [p.id, p.name ?? (p.username ? `@${p.username}` : null)]));
  const refused = all.filter((r) => r.kind !== "over_empty");
  const over = all.filter((r) => r.kind === "over_empty");

  return (
    <section className="mb-8 rounded-2xl bg-white border border-primary-200 p-5">
      {refused.length > 0 && (
        <>
          <h2 className="font-semibold text-primary-900 mb-1">Couldn&rsquo;t add (last 90 days)</h2>
          <p className="text-[13px] text-primary-500 mb-3">Another account already has it, so nothing was added. Check both and sort it out by hand if they belong to one person.</p>
          <List rows={refused} names={names} />
        </>
      )}
      {over.length > 0 && (
        <div className={refused.length ? "mt-5" : ""}>
          <h2 className="font-semibold text-primary-900 mb-1">Added over an empty account (last 90 days)</h2>
          <p className="text-[13px] text-primary-500 mb-3">The Google account had its own TapTurf account that was never used. It is left as it is; that Google account now opens the phone account.</p>
          <List rows={over} names={names} />
        </div>
      )}
    </section>
  );
}

function List({ rows, names }: { rows: Refusal[]; names: Map<string, string | null> }) {
  return (
    <ul className="space-y-2 text-[13px] text-primary-800">
      {rows.map((r, i) => {
        const who = r.userId ? (names.get(r.userId) ?? "Someone") : "Someone";
        return (
          <li key={`${r.at}-${r.userId}-${i}`} className="break-words">
            <span className="font-mono text-[11px] text-primary-400">{istDateTime(r.at)}</span>
            <span className="block">
              <span className="font-semibold text-primary-900">{who}</span> {refusalText(r, day)}
            </span>
            <span className="block text-[12px]">
              {r.userId && (
                <a href={`/admin?person=${r.userId}#people`} className="font-semibold text-accent-700 hover:underline">
                  Open {who === "Someone" ? "their account" : who}
                </a>
              )}
              {r.userId && r.otherUserId && <span className="text-primary-300"> · </span>}
              {r.otherUserId && (
                <a href={`/admin?person=${r.otherUserId}#people`} className="font-semibold text-accent-700 hover:underline">
                  Open the other account{names.get(r.otherUserId) ? ` (${names.get(r.otherUserId)})` : ""}
                </a>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
