import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /report: the owners' lead reports (signed links, noindex; app/report/[token]/route.ts).
        disallow: ["/admin", "/profile", "/dashboard", "/notifications", "/report/"],
      },
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ChatGPT-User", allow: "/" },
      // ChatGPT search's own crawler: what it indexes is what ChatGPT can cite and link.
      { userAgent: "OAI-SearchBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "anthropic-ai", allow: "/" },
      { userAgent: "Claude-Web", allow: "/" },
    ],
    sitemap: "https://www.tapturf.in/sitemap.xml",
  };
}
