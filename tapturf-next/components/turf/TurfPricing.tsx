import Link from "next/link";
import { ExternalLink, IndianRupee } from "lucide-react";
import type { PriceMention, Turf } from "@/types/turf";
import {
  bandRows,
  bandsCheckedOn,
  formatPrice,
  ownerSetPrices,
  positivePrice,
  priceRangeText,
  priceUnitSuffix,
  reportedMentions,
  showsPriceBands,
} from "@/lib/utils/prices";
import { publicLink } from "@/lib/utils/bookingApps";
import { PriceBands } from "./PriceBands";
import { SuggestInfoButton } from "./TurfSuggestions";

/** What the page can offer a player who wants the rate: a call, WhatsApp, both or neither. */
export type TurfContact = { call: boolean; whatsapp: boolean };

/** "Call or WhatsApp for slot rates", or null when the page has no number. */
export function slotRatesHint({ call, whatsapp }: TurfContact): string | null {
  if (call && whatsapp) return "Call or WhatsApp for slot rates";
  if (call) return "Call for slot rates";
  if (whatsapp) return "WhatsApp the turf for slot rates";
  return null;
}

/** What players shared on the page (playerPriceRange of its suggestions). */
export type PlayerPrice = { min: number; max: number; count: number } | null;

export function TurfPricing({
  turf,
  claimed = false,
  contact,
  playerPrice = null,
}: {
  turf: Turf;
  claimed?: boolean;
  contact: TurfContact;
  playerPrice?: PlayerPrice;
}) {
  // Listed prices by format and time band are the richest we have,
  // unless the owner set their own on myTapturf: theirs win.
  if (showsPriceBands(turf)) {
    // PriceBands runs in the browser: it gets only what it shows (the
    // bands' source notes name the booking app they came from).
    return (
      <div className="section-divider">
        <h2 className="text-[22px] font-bold text-primary-800 mb-5 font-serif">Pricing</h2>
        <PriceBands bands={bandRows(turf.pricing_bands)} checked={bandsCheckedOn(turf.pricing_bands)} />
      </div>
    );
  }
  const ownerSet = ownerSetPrices(turf);
  const unit = priceUnitSuffix(turf);
  // Research notes ("Rs 500 per hour (Day), Rs 600 (Night)" with a
  // source), then bare numbers from reviews: the header shows those as a
  // "reported" range, so this section says where it came from. Shown
  // when we have no price table of our own. Cleaned of booking apps
  // before anything is decided: a note that was only an app's listing
  // never makes this view show.
  const mentions: PriceMention[] = reportedMentions(turf);

  // Only real, positive prices make a row or a cell; a missing slot is a
  // dash with no unit, never "N/A/hr" or ₹0.
  const rows = [
    { slot: "Morning", emoji: "🌅", time: "6AM – 12PM", weekday: turf.morning_price, weekend: turf.weekend_morning_price },
    { slot: "Afternoon", emoji: "☀️", time: "12PM – 5PM", weekday: turf.afternoon_price, weekend: turf.weekend_afternoon_price },
    { slot: "Evening", emoji: "🌙", time: "5PM – Close", weekday: turf.evening_price, weekend: turf.weekend_evening_price },
  ]
    .map((r) => ({ ...r, weekday: positivePrice(r.weekday), weekend: positivePrice(r.weekend) }))
    .filter((r) => r.weekday != null || r.weekend != null);
  // Weekend-only turfs (20 on 26 Oct) get a Weekend column alone, not a
  // Weekday column of dashes.
  const hasWeekday = rows.some((r) => r.weekday != null);
  const hasWeekend = rows.some((r) => r.weekend != null);

  if (rows.length === 0 && mentions.length === 0) {
    return <NoPrices turfId={turf.id} claimed={claimed} contact={contact} playerPrice={playerPrice} />;
  }

  if (rows.length === 0) {
    return (
      <div className="section-divider">
        <h2 className="text-[22px] font-bold text-primary-800 mb-2 font-serif">Pricing</h2>
        <p className="text-[13px] text-primary-500 mb-4">
          Reported prices, not confirmed by the turf. Check the rate with the turf before you book.
        </p>
        <ul className="space-y-3">
          {mentions.map((m, i) => {
            // A plain web page only: "external-listing" rendered as a link to /turf/external-listing.
            const source = publicLink(m.source_url);
            return (
              <li key={i} className="rounded-2xl border border-cream-300 bg-cream-50 px-4 py-3">
                <p className="text-[15px] leading-snug text-primary-800">
                  <span className="font-semibold text-primary-500">Reported: </span>
                  {m.text?.trim() ? (
                    m.text
                  ) : (
                    <>
                      {formatPrice(m.price_inr)}
                      {unit}
                      {m.context ? `, ${m.context}` : ""}
                    </>
                  )}
                </p>
                {(m.date || source) && (
                  <p className="mt-1.5 text-[12px] text-primary-400 flex flex-wrap items-center gap-x-3">
                    {m.date && <span>{formatMentionDate(m.date)}</span>}
                    {source && (
                      <a
                        href={source}
                        target="_blank"
                        rel="noopener nofollow"
                        className="inline-flex items-center gap-1 text-accent-600 hover:text-accent-700"
                      >
                        Source <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const cell = (price: number | null, tone: string) =>
    price != null ? (
      <>
        <span className={`text-base font-bold font-serif ${tone}`}>{formatPrice(price)}</span>
        <span className="text-xs text-primary-400">{unit}</span>
      </>
    ) : (
      <span className="text-base font-bold text-primary-300 font-serif">–</span>
    );

  return (
    <div className="section-divider">
      <h2 className="text-[22px] font-bold text-primary-800 mb-5 font-serif">Pricing</h2>
      {ownerSet && <p className="-mt-3 mb-4 text-[13px] text-accent-700 font-medium">Prices confirmed by the turf</p>}
      <div className="overflow-x-auto rounded-2xl border border-cream-300">
        <table className="w-full">
          <thead>
            <tr className="bg-primary-50 border-b border-cream-300">
              <th className="text-left py-3.5 px-5 text-xs font-semibold text-primary-500">
                Time Slot
              </th>
              {hasWeekday && (
                <th className="text-right py-3.5 px-5 text-xs font-semibold text-primary-500">
                  Weekday
                </th>
              )}
              {hasWeekend && (
                <th className="text-right py-3.5 px-5 text-xs font-semibold text-primary-500">
                  Weekend
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.slot}
                className={`border-b border-cream-200 last:border-0 ${
                  i % 2 === 0 ? "bg-white" : "bg-cream-50"
                }`}
              >
                <td className="py-4 px-5">
                  <span className="text-base text-primary-700 font-medium">
                    {row.emoji} {row.slot}
                  </span>
                  <span className="text-xs text-primary-400 ml-2">{row.time}</span>
                </td>
                {hasWeekday && <td className="py-4 px-5 text-right">{cell(row.weekday, "text-primary-800")}</td>}
                {hasWeekend && <td className="py-4 px-5 text-right">{cell(row.weekend, "text-accent-600")}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!hasWeekday && <p className="mt-2 text-[12px] text-primary-400">Only weekend rates are listed. Ask the turf for weekdays.</p>}
    </div>
  );
}

/**
 * No price, band or report at all (1,608 of 3,120 active turfs on 26
 * Oct). Says so plainly where a player looks for the rate, with the two
 * ways it gets filled: the owner adds it on myTapturf, or a player who
 * knows it shares it. When players already shared one (From players,
 * below), it points there instead of asking for the rate again.
 */
function NoPrices({
  turfId,
  claimed,
  contact,
  playerPrice,
}: {
  turfId: string;
  claimed: boolean;
  contact: TurfContact;
  playerPrice: PlayerPrice;
}) {
  const hint = slotRatesHint(contact);
  const reported = playerPrice ? priceRangeText(playerPrice.min, playerPrice.max) : null;
  const confirm =
    contact.call && contact.whatsapp ? " Call or WhatsApp the turf to confirm." : contact.call ? " Call the turf to confirm." : contact.whatsapp ? " WhatsApp the turf to confirm." : "";
  // The headline already says the rates are missing: the line under it
  // says what the page can offer next, or what else is missing.
  const subline =
    playerPrice && reported
      ? `${playerPrice.count === 1 ? "A player reports" : "Players report"} ${reported} an hour, under From players below.${confirm}`
      : hint
        ? `${hint}.`
        : "Contact details not listed yet either.";
  return (
    <div className="section-divider">
      <h2 className="text-[22px] font-bold text-primary-800 mb-4 font-serif">Pricing</h2>
      <div className="rounded-2xl border border-cream-300 bg-cream-50 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-soft shrink-0">
            <IndianRupee className="w-4 h-4 text-primary-500" />
          </span>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-primary-800">
              {reported ? "Not listed by the turf yet" : claimed ? "The owner hasn't added prices yet" : "Prices not listed yet"}
            </p>
            <p className="mt-0.5 text-[14px] text-primary-500 leading-snug">{subline}</p>
          </div>
        </div>
        {claimed ? (
          // A verified turf already has its owner on myTapturf: players get the
          // button, the owner a quiet link (a big "Manage this turf?" read as if
          // the listing still needed claiming, 26 Oct).
          <>
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <SuggestInfoButton className="press-tight inline-flex items-center justify-center h-11 px-5 rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[14px] font-semibold transition-colors cursor-pointer">
                {reported ? "Paid a different rate? Share it" : "Played here? Share the rate"}
              </SuggestInfoButton>
            </div>
            <p className="mt-3 text-[13px] text-primary-500">
              Manage this turf?{" "}
              <Link href="/my" prefetch={false} className="font-semibold text-accent-700 hover:text-accent-800">
                Add prices on myTapturf
              </Link>
            </p>
          </>
        ) : (
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <Link
              href={`/my?claim=${turfId}`}
              prefetch={false}
              className="press-tight inline-flex items-center justify-center h-11 px-5 rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[14px] font-semibold transition-colors"
            >
              Own this turf? Add your prices free
            </Link>
            <SuggestInfoButton className="press-tight inline-flex items-center justify-center h-11 px-5 rounded-full bg-white border border-primary-200 hover:bg-primary-50 text-primary-900 text-[14px] font-semibold transition-colors cursor-pointer">
              {reported ? "Paid a different rate? Share it" : "Played here? Share the rate"}
            </SuggestInfoButton>
          </div>
        )}
      </div>
    </div>
  );
}

/** "2026-09-30" -> "Sep 2026"; anything else is shown as stored. */
function formatMentionDate(d: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(d);
  if (!m) return d;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}
