import { AVATAR_PRESETS, isPresetId } from "@/lib/account/avatar";
import { avatarSvg } from "@/lib/account/avatarArt";

// The sports avatars people pick for their profile picture, as files
// (/avatars/<id>.svg): users.profile_image_url holds that address, so any
// <img> of a picture shows one. Drawn in lib/account/avatarArt.ts, built
// once with the site.

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return AVATAR_PRESETS.map((p) => ({ file: `${p.id}.svg` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = file.replace(/\.svg$/, "");
  if (!file.endsWith(".svg") || !isPresetId(id)) return new Response("Not found", { status: 404 });
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
