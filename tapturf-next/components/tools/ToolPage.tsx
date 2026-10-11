import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { TOOLS, TOOLS_BASE, toolPath, type ToolDef } from "@/lib/tools/registry";

export type Faq = { q: string; a: string };
export type Explainer = { title: string; body: ReactNode };

/**
 * Shared shell for every tool page. Everything that matters for search
 * (H1, intro, explainer, FAQ, links) is plain server markup; only the
 * tool itself is a client component passed as children, and it sits
 * right under the intro so nobody scrolls past copy to reach it.
 */
export function ToolPage({ tool, intro, children, explainer, faq }: { tool: ToolDef; intro: string; children: ReactNode; explainer: Explainer[]; faq: Faq[] }) {
  const url = `${TOOLS_BASE}/${tool.slug}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "TapTurf", item: "https://www.tapturf.in" },
        { "@type": "ListItem", position: 2, name: "Tools", item: TOOLS_BASE },
        { "@type": "ListItem", position: 3, name: tool.name, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: tool.name,
      url,
      applicationCategory: "SportsApplication",
      operatingSystem: "Any",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      publisher: { "@type": "Organization", name: "TapTurf", url: "https://www.tapturf.in" },
    },
    // FAQ schema mirrors the visible questions below, nothing hidden.
    faq.length
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }
      : null,
  ].filter(Boolean);

  const related = tool.related.map((s) => TOOLS.find((t) => t.slug === s)).filter((t): t is ToolDef => !!t);

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-6 md:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Breadcrumb" className="text-[13px] text-primary-500 mb-4 flex items-center gap-1">
        <Link href="/tools" className="hover:text-primary-900">
          Tools
        </Link>
        <ChevronRight className="w-3.5 h-3.5" aria-hidden />
        <span className="text-primary-700 truncate">{tool.name}</span>
      </nav>

      <header className="mb-6">
        <h1 className="font-display tracking-tight text-primary-900 text-3xl sm:text-4xl md:text-[44px] leading-[1.05]">{tool.h1}</h1>
        <p className="mt-3 text-[16px] md:text-[17px] text-primary-600 leading-relaxed">{intro}</p>
        <p className="mt-1.5 text-[13px] text-primary-400">Free, no sign-up, works on your phone.</p>
      </header>

      {/* The tool. */}
      <section aria-label={tool.name}>{children}</section>

      {explainer.length > 0 && (
        <section className="mt-12 space-y-8">
          {explainer.map((e) => (
            <div key={e.title}>
              <h2 className="text-[22px] font-display text-primary-900 mb-3">{e.title}</h2>
              <div className="prose-tool text-[15px] leading-relaxed text-primary-700 space-y-3">{e.body}</div>
            </div>
          ))}
        </section>
      )}

      {faq.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[22px] font-display text-primary-900 mb-4">Quick answers</h2>
          <div className="space-y-2">
            {faq.map((f) => (
              <details key={f.q} className="group rounded-2xl bg-primary-50 open:bg-white open:ring-1 open:ring-primary-200">
                <summary className="cursor-pointer list-none px-5 py-4 flex items-start justify-between gap-4">
                  <span className="font-semibold text-primary-900 text-[15px]">{f.q}</span>
                  <span aria-hidden className="text-primary-400 group-open:rotate-45 transition-transform text-xl leading-none">
                    +
                  </span>
                </summary>
                <p className="px-5 pb-5 text-[15px] leading-relaxed text-primary-700">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[20px] font-display text-primary-900 mb-3">More free cricket tools</h2>
          <ul className="grid sm:grid-cols-2 gap-3">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={toolPath(r.slug)} className="press-tight block rounded-2xl border border-primary-200 bg-white px-4 py-3.5 hover:border-accent-400 transition-colors">
                  <span className="block font-semibold text-primary-900 text-[15px]">{r.name}</span>
                  <span className="block text-[13px] text-primary-500 mt-0.5">{r.tagline}</span>
                </Link>
              </li>
            ))}
            <li>
              <Link href="/tools" className="press-tight block rounded-2xl border border-dashed border-primary-300 px-4 py-3.5 text-[15px] font-semibold text-primary-700 hover:border-accent-400 hover:text-accent-700 transition-colors">
                All TapTurf tools
              </Link>
            </li>
          </ul>
        </section>
      )}
    </article>
  );
}
