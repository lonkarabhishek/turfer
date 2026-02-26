import { createClient } from "@/lib/supabase/client";
import type { AppUser } from "@/types/user";

export async function getUserProfile(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, phone, role, profile_image_url")
    .eq("id", userId)
    .single();

  return { data: data as AppUser | null, error: error?.message || null };
}

export async function updateUserProfile(userId: string, updates: Partial<Pick<AppUser, "name" | "phone" | "profile_image_url">>) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  return { data: data as AppUser | null, error: error?.message || null };
}

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
