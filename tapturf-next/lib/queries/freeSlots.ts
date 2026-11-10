import { createReadOnlyClient } from "@/lib/supabase/server";
import { makeFreeReader } from "@/lib/availability/freeReader";

/**
 * Free hours nearby, for the lists' "Free hours marked" filter (GET
 * /api/turfs/list), GET /api/availability/free/<city> and Ask TapTurf: the
 * one cached reader (lib/availability/freeReader.ts), on the anon key.
 * public.free_slots_now (20261111_free_slots_nearby.sql) gives the turfs
 * whose free slots players see now, one city or all of India; the turfs'
 * numbers are read only to leave out a page with nothing to call or
 * WhatsApp, and never leave this process. No page calls this: nothing is
 * added to any page's HTML or build.
 */
export const getFreeSlots = makeFreeReader(
  async (city, hours) => {
    const { data, error } = await createReadOnlyClient().rpc("free_slots_now", { p_city: city, p_hours: hours });
    return { data, error };
  },
  async (ids) => {
    const { data, error } = await createReadOnlyClient().from("turfs").select("id, owner_phone, contact_info, landline_phone, whatsapp_phone").in("id", ids);
    return { data, error };
  },
);
