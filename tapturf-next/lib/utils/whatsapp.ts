import { normalizeIndianPhone } from "./phone";

export function buildWhatsAppLink({
  phone,
  text,
}: {
  phone: string;
  text: string;
}): string {
  if (!phone || !text) {
    return "#";
  }
  // Route every phone through the same normalizer as the tel: link so
  // we can't ever double the country code again.
  const normalized = normalizeIndianPhone(phone);
  if (!normalized) return "#";
  const encodedText = encodeURIComponent(text);
  return `https://wa.me/${normalized.digits}?text=${encodedText}`;
}

/**
 * The enquiry a player sends to a turf on WhatsApp. Includes the
 * turf's own TapTurf page so the owner sees exactly which listing the
 * player came from (and can check what we show about them).
 */
export function generateTurfInquiryMessage(turf: {
  name: string;
  address?: string;
  url?: string;
}): string {
  const lines = [
    `Hi! I'm interested in booking *${turf.name}*.`,
    "",
    ...(turf.address ? [`📍 ${turf.address}`, ""] : []),
    `Found you on TapTurf: ${turf.url ?? "https://www.tapturf.in"}`,
    "",
    "Could you share available slots and pricing?",
    "",
    "Thanks!",
  ];
  return lines.join("\n");
}
