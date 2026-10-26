import { createClient } from "@/lib/supabase/client";
import { cleanVenueName } from "@/lib/utils/bookingApps";

export async function searchTurfs(query?: string) {
  const supabase = createClient();
  let q = supabase
    .from("turfs")
    .select("id, name, address")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(20);

  if (query) {
    // Escape special PostgREST/SQL pattern chars to prevent injection
    const escaped = query.replace(/[%_\\(),"']/g, "");
    if (escaped) {
      q = q.or(`name.ilike.%${escaped}%,address.ilike.%${escaped}%`);
    }
  }

  const { data, error } = await q;
  // Names without a booking app's attribution, as on the turf's own page.
  return { data: (data || []).map((t) => ({ ...t, name: cleanVenueName(t.name) })), error: error?.message || null };
}
