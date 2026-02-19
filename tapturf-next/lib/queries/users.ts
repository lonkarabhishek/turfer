import { createClient } from "@/lib/supabase/client";
import type { AppUser } from "@/types/user";

const supabase = createClient();

export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, phone, role, profile_image_url")
    .eq("id", userId)
    .single();

  return { data: data as AppUser | null, error: error?.message || null };
}

export async function updateUserProfile(userId: string, updates: Partial<Pick<AppUser, "name" | "phone" | "profile_image_url">>) {
  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  return { data: data as AppUser | null, error: error?.message || null };
}

export async function searchTurfs(query?: string) {
  let q = supabase
    .from("turfs")
    .select("id, name, address")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(20);

  if (query) {
    q = q.or(`name.ilike.%${query}%,address.ilike.%${query}%`);
  }

  const { data, error } = await q;
  return { data: data || [], error: error?.message || null };
}
