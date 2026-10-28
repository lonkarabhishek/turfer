import { test } from "node:test";
import assert from "node:assert/strict";
import { blogSeoDescription, blogSeoTitle, blogShareImage, isRasterShareImage } from "./blogMeta";
import { ALL_POSTS } from "../../content/blog";
import { titleFits } from "./width";

test("search title: seoTitle first, brand only while it fits", () => {
  assert.equal(
    blogSeoTitle({ title: "Pickleball for Beginners: Rules, Scoring and Courts in Pune", seoTitle: "Pickleball Rules for Beginners: Serve, Kitchen & Scoring" }),
    "Pickleball Rules for Beginners: Serve, Kitchen & Scoring",
  );
  assert.equal(blogSeoTitle({ title: "12 Turf Rules Every Player Should Know" }), "12 Turf Rules Every Player Should Know | TapTurf");
  assert.equal(blogSeoDescription({ description: "long", seoDescription: "short" }), "short");
  assert.equal(blogSeoDescription({ description: "only" }), "only");
});

test("share image: card raster, then raster hero, then the generated card; never a Google Maps photo", () => {
  const og = blogShareImage({ slug: "a", title: "A", heroImage: { url: "/blog/art/a.svg", alt: "Art", og: "https://www.tapturf.in/blog/art/a.png" } });
  assert.deepEqual(og, { url: "https://www.tapturf.in/blog/art/a.png", alt: "Art", generated: false });
  const raster = blogShareImage({ slug: "b", title: "B", heroImage: { url: "/blog/art/b.png", alt: "B art" } });
  assert.equal(raster.url, "https://www.tapturf.in/blog/art/b.png");
  const lh3 = blogShareImage({ slug: "c", title: "C", heroImage: { url: "https://lh3.googleusercontent.com/gps-cs-s/x=w1200-h900-k-no", alt: "C" } });
  assert.deepEqual(lh3, { url: "https://www.tapturf.in/api/og/blog/c", alt: "C", width: 1200, height: 630, generated: true });
  const none = blogShareImage({ slug: "d", title: "D" });
  assert.equal(none.url, "https://www.tapturf.in/api/og/blog/d");
  assert.equal(isRasterShareImage("/blog/art/x.svg"), false);
  assert.equal(isRasterShareImage("https://example.com/x.jpg?w=2"), true);
});

test("every post's search title fits and its description is 110 to 155 characters", () => {
  for (const p of ALL_POSTS) {
    const t = blogSeoTitle(p);
    assert.ok(titleFits(t), `${p.slug}: ${t}`);
    const d = blogSeoDescription(p);
    assert.ok(d.length >= 110 && d.length <= 155, `${p.slug}: ${d.length}c`);
    assert.ok(blogShareImage(p).url.startsWith("https://www.tapturf.in/"), p.slug);
  }
});
