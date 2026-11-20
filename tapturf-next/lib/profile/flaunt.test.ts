import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BANNED_COPY } from "../seo/defaults";
import { FLAUNT_COPY, FLAUNT_LINKS, flauntLink, flauntState, leadsWithShare } from "./flaunt";
import { MEDALS, type MedalArt } from "./medals";
import { MEDAL_GLYPHS, MEDAL_SHAPES, MEDAL_TONES, medalLook, mixHex } from "./medalShapes";

// "Flaunt my medals": the sheet's words and choices, and the one drawing behind every medal.

const src = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

test("who can have a story picture: a username, and \"Let others find and tag me\" not turned off", () => {
  assert.equal(flauntState({ username: "asha", taggable: true }), "ok");
  assert.equal(flauntState({ username: "asha" }), "ok", "an account that never said is on");
  assert.equal(flauntState({ username: "asha", taggable: false }), "hidden");
  assert.equal(flauntState({ taggable: true }), "username");
  assert.equal(flauntState({ username: "" }), "username");
  assert.equal(flauntState(null), "username");
  assert.match(FLAUNT_LINKS.hidden, /^\/dashboard\?tab=profile#find-and-tag$/);
  // The switch the link goes to is there, under that id.
  assert.match(src("components", "dashboard", "ProfileSection.tsx"), /id="find-and-tag"/);
  assert.match(FLAUNT_COPY.hidden, /“Let others find and tag me”/, "the switch by its own name");
});

test("the sheet leads with the share sheet only on a phone that can share the file", () => {
  assert.equal(leadsWithShare({ canShareFile: true, coarsePointer: true }), true);
  assert.equal(leadsWithShare({ canShareFile: true, coarsePointer: false }), false, "a desktop has no Instagram to hand it to");
  assert.equal(leadsWithShare({ canShareFile: false, coarsePointer: true }), false, "an in-app browser that cannot share files");
  assert.equal(leadsWithShare({ canShareFile: false, coarsePointer: false }), false);
});

test("the profile link to paste", () => {
  assert.equal(flauntLink("https://www.tapturf.in", "Asha"), "https://www.tapturf.in/u/asha");
  assert.equal(flauntLink("https://www.tapturf.in/", "asha_r"), "https://www.tapturf.in/u/asha_r");
});

test("the words never say \"book\", hurry nobody, and promise no link that opens Instagram", () => {
  const [book, , , hurry] = BANNED_COPY;
  for (const [k, line] of Object.entries(FLAUNT_COPY)) {
    assert.equal(book.test(line), false, k);
    assert.equal(hurry.test(line), false, k);
    assert.equal(/[—]/.test(line), false, `${k}: no dash for a pause`);
  }
  // What Share does is said as it is: the phone's own share sheet, then Instagram, then Story.
  assert.match(FLAUNT_COPY.shareHint, /share sheet/);
  assert.match(FLAUNT_COPY.shareHint, /Instagram, then Story/);
  for (const line of Object.values(FLAUNT_COPY)) assert.equal(/opens? (in )?Instagram|straight to Instagram|post(s|ed)? (it )?for you/i.test(line), false, line);
});

test("the sheet shares inside the tap: the file is made when it opens, and Share awaits nothing first", () => {
  const sheet = src("components", "profile", "FlauntSheet.tsx");
  const share = sheet.slice(sheet.indexOf("const share = () => {"), sheet.indexOf("const link ="));
  assert.ok(share.includes("navigator.share({ files: [pic.file] })"), "only the file is shared");
  assert.equal(/\bawait\b/.test(share), false, "an await before navigator.share loses the tap on iOS Safari");
  assert.equal(/\basync\b/.test(share), false);
  assert.match(sheet, /navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(sheet, /new File\(\[await res\.blob\(\)\]/);
  // Open, share, save and copy are counted, through gaEvent alone (only with consent).
  const button = src("components", "profile", "FlauntMedals.tsx");
  assert.match(button, /gaEvent\("medal_story_open"/);
  for (const e of ["medal_story_share", "medal_story_save", "medal_story_copy_link"]) assert.ok(sheet.includes(`ga("${e}")`), e);
  // Nothing else leaves the page: one read of the picture from TapTurf itself.
  assert.deepEqual(sheet.match(/\bfetch\(/g), ["fetch("]);
  assert.match(sheet, /fetch\(medalStoryPath\(username\)/);
  assert.equal(/https?:\/\//.test(sheet + button), false, "no outside address");
});

test("the public profile's page keeps its metadata, and its owner-only buttons render nothing on the server", () => {
  const page = src("app", "u", "[username]", "page.tsx");
  // The metadata, exactly as before this work (SEO-sensitive: the site owner's call to change).
  assert.ok(
    page.includes(`  const robots = { index: false, follow: true };
  if (!found || !("profile" in found)) return { title: "Player not found", robots };
  const { u, name } = found.profile;
  return {
    title: \`\${name} (@\${u})\`,
    description: \`\${name} plays on TapTurf.\`,
    robots,
    alternates: { canonical: \`https://www.tapturf.in/u/\${u}\` },
  };`),
  );
  assert.equal(/openGraph|twitter|ld\+json|jsonLdHtml/.test(page), false, "no og tags and no JSON-LD were added");
  assert.match(page, /export const revalidate = 60;/);
  // Flaunt and Share are client components that return null without the signed-in owner.
  for (const f of ["FlauntMedals.tsx", "ShareProfile.tsx", "NotOwner.tsx"]) assert.match(src("components", "profile", f), /^"use client";/);
  assert.match(src("components", "profile", "FlauntMedals.tsx"), /if \(!hydrated \|\| !user \|\| count <= 0 \|\| \(username && username !== user\.username\)\) return null;/);
  // "Yours to earn" leads to /games and to hosting, with no number and no hurry.
  assert.match(page, /href="\/games"/);
  assert.match(page, /href="\/game\/create"/);
  const [book, , , hurry] = BANNED_COPY;
  const words = page.slice(page.indexOf("return (")).replace(/\{\/\*[^]*?\*\/\}/g, "");
  assert.equal(book.test(words), false);
  assert.equal(hurry.test(words), false);
});

test("one drawing for every medal: each catalog medal has its shape, tone and glyph, and the site and the story both draw from it", () => {
  for (const m of MEDALS) {
    assert.ok(MEDAL_SHAPES[m.art.shape], `${m.id}: shape`);
    assert.ok(MEDAL_TONES[m.art.tone], `${m.id}: tone`);
    assert.ok(MEDAL_GLYPHS[m.art.glyph]?.length > 0, `${m.id}: glyph`);
  }
  assert.ok(MEDAL_GLYPHS.lock.length > 0);
  for (const [name, strokes] of Object.entries(MEDAL_GLYPHS)) {
    for (const s of strokes) {
      const nums = "d" in s ? [] : "circle" in s ? [...s.circle] : [...s.rect];
      assert.ok(nums.every((n) => Number.isFinite(n) && n >= 0 && n <= 24), `${name}: inside its 24 x 24 box`);
      if ("d" in s) assert.match(s.d, /^[Mm][0-9a-zA-Z .,-]+$/, name);
    }
  }
  for (const t of Object.values(MEDAL_TONES)) for (const c of t) assert.match(c, /^#[0-9A-F]{6}$/);
  // Both draw through medalDrawing, and neither keeps a copy of the shapes.
  const site = src("components", "profile", "MedalArt.tsx");
  const story = src("lib", "og", "medalStoryDesign.tsx");
  assert.match(site, /medalDrawing\(art, locked\)/);
  assert.match(story, /medalDrawing\(art\)/);
  assert.equal(/lucide-react|<circle|<polygon/.test(site), false);
  // next/og writes an <svg>'s elements out as text: the drawing has plain elements only, never a component.
  const drawing = src("lib", "profile", "medalDrawing.tsx");
  assert.deepEqual([...new Set(drawing.match(/<[A-Z][A-Za-z]*/g) ?? [])], []);
});

/** WCAG contrast of two "#rrggbb" colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [0, 1, 2].map((i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("a profile dressed in its top medal's colours stays readable: small print reads on both tints", () => {
  assert.equal(mixHex("#000000", "#FFFFFF", 0.5), "#808080");
  assert.equal(mixHex("#FFFFFF", "#000000", 0), "#FFFFFF");
  const tones = [...new Set(MEDALS.map((m) => m.art.tone))] as MedalArt["tone"][];
  assert.equal(tones.length, 7);
  for (const tone of tones) {
    const look = medalLook(tone);
    for (const bg of [look.soft, look.wash, "#FFFFFF"]) assert.ok(contrast(look.text, bg) >= 4.5, `${tone}: ${look.text} on ${bg} is ${contrast(look.text, bg).toFixed(2)}`);
    assert.ok(contrast("#1D1D1F", look.wash) >= 12, `${tone}: the page's own ink on the wash`);
    assert.match(look.glow, /^rgba\(\d+, \d+, \d+, 0\.45\)$/);
  }
});
