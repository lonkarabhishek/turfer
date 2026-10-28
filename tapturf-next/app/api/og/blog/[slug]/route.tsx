import { ImageResponse } from "next/og";
import { ALL_POSTS, getPostBySlug } from "@/content/blog";

// GET /api/og/blog/<slug>: the share card for a post with no raster hero
// of its own (lib/seo/blogMeta.ts blogShareImage), 1200x630 PNG. Built
// at deploy for every post and served as a static file; any other slug
// is a 404. Under /api, so proxy.ts never runs for it.
//
// Text only, in the bundled Noto Sans: an emoji would be fetched from a
// CDN while the build runs, and a failed fetch would fail the build.
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
          {/* The favicon's mark: a white T on the brand green. */}
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: "#FFFFFF",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: 15,
            }}
          >
            <div style={{ width: 45, height: 12, background: "#00A699", borderRadius: 2 }} />
            <div style={{ width: 13, height: 33, background: "#00A699", borderRadius: 2 }} />
          </div>
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
