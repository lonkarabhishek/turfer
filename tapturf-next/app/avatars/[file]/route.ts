import { AVATAR_PRESETS, OLD_PRESETS, presetIdOf } from "@/lib/account/avatar";
import { avatarSvg } from "@/lib/account/avatarArt";

// The avatars people pick for their profile picture, as files
// (/avatars/<id>.svg): users.profile_image_url holds that address, so any
// <img> of a picture shows one. Drawn in lib/account/avatarArt.ts, built
// once with the site. The first avatars' addresses (sports gear) show the
// player each became, so no saved picture ever breaks.

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [...AVATAR_PRESETS.map((p) => p.id), ...Object.keys(OLD_PRESETS)].map((id) => ({ file: `${id}.svg` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = file.endsWith(".svg") ? presetIdOf(file.slice(0, -4)) : null;
  if (!id) return new Response("Not found", { status: 404 });
  return new Response(avatarSvg(id), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      // Opened on its own, it is a picture and nothing else.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
