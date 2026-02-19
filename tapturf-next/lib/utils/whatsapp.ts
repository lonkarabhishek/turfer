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

  const cleanPhone = phone.replace(/\D/g, "");
  const formattedPhone = cleanPhone.startsWith("91")
    ? cleanPhone
    : `91${cleanPhone}`;
  const encodedText = encodeURIComponent(text);
  return `https://wa.me/${formattedPhone}?text=${encodedText}`;
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
