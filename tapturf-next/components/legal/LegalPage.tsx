import Link from "next/link";
import { Mail } from "lucide-react";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/contact";

export type LegalSection = {
  id: string;
  title: string;
  body: React.ReactNode;
};

/**
 * Shared shell for /privacy and /terms: title, date, a short table of
 * contents, numbered sections and a contact box. Plain server markup
 * so the pages are light and fully crawlable.
 */
export function LegalPage({
  title,
  intro,
  updated,
  sections,
  sibling,
}: {
  title: string;
  intro: string;
  /** ISO date, shown as "Last updated". */
  updated: string;
  sections: LegalSection[];
  /** Link to the other legal page. */
  sibling: { href: string; label: string };
}) {
  const updatedLabel = new Date(`${updated}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-14">
      <header className="mb-8 md:mb-10">
        <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-accent-600">Legal</p>
        <h1 className="font-display tracking-tight text-primary-900 text-3xl sm:text-4xl md:text-5xl leading-[1.05] mt-2">
          {title}
        </h1>
        <p className="mt-4 text-[17px] text-primary-600 leading-relaxed">{intro}</p>
        <p className="mt-3 text-[13px] text-primary-400">
          Last updated {updatedLabel} ·{" "}
          <Link href={sibling.href} className="underline underline-offset-2 hover:text-primary-600">
            {sibling.label}
          </Link>
        </p>
      </header>

      <nav aria-label="Contents" className="rounded-2xl bg-primary-50 px-5 py-4 mb-10">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-primary-500 mb-2">On this page</p>
        <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[15px] text-primary-800 list-decimal list-inside marker:text-primary-400">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="hover:text-accent-600">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-10">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="font-display text-primary-900 text-xl md:text-2xl leading-snug">
              <span className="text-primary-300 tabular-nums mr-2">{i + 1}.</span>
              {s.title}
            </h2>
            <div className="legal-body mt-3 text-[16px] text-primary-700 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-primary-900 [&_strong]:font-semibold [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-accent-600">
              {s.body}
            </div>
          </section>
        ))}
      </div>

      <aside className="mt-14 rounded-2xl border border-primary-100 bg-white shadow-soft px-5 py-5 sm:px-7 sm:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="font-semibold text-primary-900 text-[17px]">Questions about this?</p>
          <p className="text-[14px] text-primary-500 mt-0.5">Write to us and a person will reply, usually within a week.</p>
        </div>
        <a
          href={CONTACT_MAILTO}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-primary-900 hover:bg-primary-800 text-white text-[15px] font-semibold px-5 h-11 whitespace-nowrap"
        >
          <Mail className="w-4 h-4" />
          {CONTACT_EMAIL}
        </a>
      </aside>
    </article>
  );
}
