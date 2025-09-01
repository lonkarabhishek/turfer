// WhatsApp integration utilities for TapTurf

export function buildWhatsAppLink({ 
  phone, 
  text 
}: { 
  phone: string; 
  text: string; 
}): string {
  // Add null/undefined checks
  if (!phone || !text) {
    console.error('buildWhatsAppLink: phone and text are required');
    return '#';
  }
  
  const cleanPhone = phone.replace(/\D/g, ''); // Remove non-digits
  const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
  const encodedText = encodeURIComponent(text);
  return `https://wa.me/${formattedPhone}?text=${encodedText}`;
}

// General WhatsApp share (no specific contact)
export function buildWhatsAppShareLink(text: string): string {
  if (!text) {
    console.error('buildWhatsAppShareLink: text is required');
    return '#';
  }
  
  const encodedText = encodeURIComponent(text);
  return `https://wa.me/?text=${encodedText}`;
}

export function generateBookingMessage({
  turfName,
  date,
  slot,
  players,
  notes = ''
}: {
  turfName: string;
  address: string;
  date: string;
  slot: string;
  players: number;
  notes?: string;
}): string {
  return `Hi! I'd like to book ${turfName} for ${slot} on ${date}.

Details:
📍 Venue: ${turfName}
📅 Date: ${date}
⏰ Time: ${slot}
👥 Players: ${players}
${notes ? `📝 Notes: ${notes}` : ''}

Found via TapTurf - https://tapturf.in

Please confirm availability and total cost. Thanks!`;
}

export function generateGameInviteMessage({
  hostName,
  turfName,
  date,
  slot,
  format,
  currentPlayers,
  maxPlayers,
  costPerPerson,
  skillLevel = 'All levels'
}: {
  hostName: string;
  turfName: string;
  date: string;
  slot: string;
  format: string;
  currentPlayers: number;
  maxPlayers: number;
  costPerPerson: number;
  skillLevel?: string;
}): string {
  const spotsLeft = maxPlayers - currentPlayers;
  return `🏟️ Hey! Want to join our ${format} game?

🎯 *Game Details:*
📅 Date: ${date}
⏰ Time: ${slot}
📍 Venue: ${turfName}
👥 Players: ${spotsLeft} spots available (${currentPlayers}/${maxPlayers} confirmed)
💰 Cost: ₹${costPerPerson}/person
🏆 Skill Level: ${skillLevel}

Host: ${hostName}

*Ready to play?* Just reply "YES" and I'll send you the location details!

Found this game on TapTurf 🏃‍♂️
https://tapturf.in`;
}

export function generateVenueInquiryMessage({
  venueName,
  ownerName = ''
}: {
  venueName: string;
  ownerName?: string;
}): string {
  return `Hello${ownerName ? ` ${ownerName}` : ''}! 👋

I'm interested in listing ${venueName} on TapTurf to reach more players and fill empty slots.

TapTurf helps venues:
🎯 Fill off-peak hours with our community
📈 Increase bookings through smart matching
💬 Handle inquiries via WhatsApp (no new apps!)

Could we schedule a quick 5-minute call to discuss?

From: TapTurf Partnership Team
https://tapturf.in/venues`;
}

// Analytics helper for WhatsApp CTA clicks
export function trackWhatsAppClick(action: 'booking' | 'join_game' | 'venue_inquiry', metadata: Record<string, any> = {}) {
  // In a real app, this would send to your analytics service
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'whatsapp_cta_clicked', {
      action,
      ...metadata
    });
  }
  
  console.log('WhatsApp CTA clicked:', action, metadata);
}