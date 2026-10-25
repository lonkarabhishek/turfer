import { createReadOnlyClient } from "@/lib/supabase/server";

/**
 * The x-revalidate-secret header the database sends (pg_net posts from
 * the cache queue and the owner photo sweep). If REVALIDATE_SECRET is set
 * in Vercel it's matched directly; otherwise Supabase checks it
 * (check_revalidate_secret), as it holds the same secret.
 */
export async function revalidateSecretOk(header: string | null): Promise<boolean> {
  if (!header) return false;
  const secret = process.env.REVALIDATE_SECRET;
  if (secret) return header === secret;
  try {
    const { data, error } = await createReadOnlyClient().rpc("check_revalidate_secret", {
      p_secret: header,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
