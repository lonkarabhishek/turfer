import { createClient } from "@/lib/supabase/client";

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
  return { data: data || [], error: error?.message || null };
}
