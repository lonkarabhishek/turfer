import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { ALL_POSTS, getPostBySlug } from "@/content/blog";

// GET /api/og/blog/<slug>: the share card for a post with no raster hero
// of its own (lib/seo/blogMeta.ts blogShareImage), 1200x630 PNG. Built
// at deploy for every post and served as a static file; any other slug
// is a 404. Under /api, so proxy.ts never runs for it.
//
// Text in the bundled Noto Sans, and the app icon read from public/, so
// nothing is fetched: an emoji would come from a CDN while the build
// runs, and a failed fetch would fail the build.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return ALL_POSTS.map((p) => ({ slug: p.slug }));
}

const SIZE = { width: 1200, height: 630 };

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return new Response("Not found", { status: 404 });
  const title = post.title;
  const size = title.length <= 45 ? 76 : title.length <= 70 ? 64 : 54;
  const mark = `data:image/png;base64,${(await readFile(join(process.cwd(), "public", "apple-icon.png"))).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #00A699 0%, #00756C 100%)",
          color: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* The home-screen icon: the logo's stadium and ball on white. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark} alt="" width={72} height={72} style={{ borderRadius: 16 }} />
          <div style={{ marginLeft: 22, fontSize: 40, letterSpacing: -0.5 }}>TapTurf</div>
          <div
            style={{
              marginLeft: "auto",
              fontSize: 24,
              textTransform: "uppercase",
              letterSpacing: 3,
              padding: "10px 22px",
              borderRadius: 999,
              border: "2px solid rgba(255,255,255,0.55)",
            }}
          >
            {post.category}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: size, lineHeight: 1.12, letterSpacing: -1, maxWidth: 1056 }}>{title}</div>

        <div style={{ display: "flex", fontSize: 26, opacity: 0.9 }}>
          {`tapturf.in/blog · ${post.readMinutes} min read`}
        </div>
      </div>
    ),
    SIZE,
  );
}
