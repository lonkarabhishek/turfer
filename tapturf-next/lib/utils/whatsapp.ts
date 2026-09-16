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

export function generateTurfInquiryMessage(turf: {
  name: string;
  address?: string;
}): string {
  return `Hi! I'm interested in booking *${turf.name}*.

📍 ${turf.address || "Your venue"}

Found your venue via TapTurf - https://tapturf.in

Could you please share:
✅ Available time slots
💰 Pricing details
📋 Booking process

Thanks!`;
}
