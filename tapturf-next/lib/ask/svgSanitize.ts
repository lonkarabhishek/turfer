/**
 * Drawings from Claude for Ask TapTurf (lib/ai/blogArt.ts), made safe to
 * show. The model's SVG is read with a strict tokeniser and a new SVG is
 * written from what was read: allowlisted elements and attributes only,
 * attribute values held to a small set of characters, text escaped.
 * None of the original text is copied through, so whatever the model
 * wrote (or was talked into writing by a question), the result can only
 * be shapes and labels. Anything that doesn't read as plain SVG gives
 * null, and the chat says it couldn't draw this one.
 *
 * The chat shows the result as an <img> data URL, which can't run
 * script or load anything in the first place. This is the second wall,
 * and keeps the markup safe should it ever go into a page as it is.
 * Pure, relative imports only (svgSanitize.test.ts).
 */

const MAX_IN = 120 * 1024;
const MAX_OUT = 120 * 1024;
const MAX_ELEMENTS = 3000;
const MAX_DEPTH = 24;
/** A long path's d is a few thousand characters; anything far past that is not a drawing. */
const MAX_VALUE = 20_000;
/** The root's size is its viewBox's: no side past this, and no more than 3 times as long as it is wide, either way. */
const MAX_SIDE = 4000;
const MAX_ASPECT = 3;

const ELEMENTS = new Set([
  "svg", "g", "defs", "title", "desc", "linearGradient", "radialGradient", "stop", "clipPath",
  "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan",
]);
/** Where text is part of the drawing. Text anywhere else is never rendered, so it is left out. */
const TEXT_IN = new Set(["text", "tspan", "title", "desc"]);
/** Something to look at: a drawing with none of these (outside defs and clip paths) is blank. */
const DRAWN = new Set(["rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text"]);
const UNSEEN = new Set(["defs", "clipPath"]);
/** Left out with everything inside them: comments, CDATA sections, processing instructions. */
const SKIPPED: [string, string][] = [["<!--", "-->"], ["<![CDATA[", "]]>"], ["<?", "?>"]];

const ATTRIBUTES = new Set([
  "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy",
  "d", "points", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "stroke-opacity", "fill-opacity", "fill-rule", "opacity", "transform", "font-size", "font-weight",
  "font-family", "font-style", "text-anchor", "dominant-baseline", "letter-spacing", "offset", "stop-color",
  "stop-opacity", "gradientUnits", "gradientTransform", "clip-path", "id", "preserveAspectRatio",
]);
/** The only attributes that may point at something, and then only at a gradient or clip path in the drawing. */
const URL_ATTRIBUTES = new Set(["fill", "stroke", "clip-path"]);

// XML whitespace is these four only: a no-break space between attributes is malformed.
const WS = "[ \\t\\r\\n]";
const NAME = "[A-Za-z_][A-Za-z0-9_.:-]*";
const START_TAG = new RegExp(`<(${NAME})`, "y");
const ATTRIBUTE = new RegExp(`${WS}+(${NAME})${WS}*=${WS}*(?:"([^"<]*)"|'([^'<]*)')`, "y");
const TAG_CLOSE = new RegExp(`${WS}*(/?)>`, "y");
const END_TAG = new RegExp(`</(${NAME})${WS}*>`, "y");
const ROOT = /<svg[ \t\r\n/>]/;

/**
 * Attribute values are numbers, colours, path data, transforms, keywords
 * and font names: letters, digits, spaces and # % ( ) , . + _ -. That
 * leaves out every quote, < > & ; : / \ and @, so no URL, entity, escape
 * or CSS can be spelled in one.
 */
const VALUE_CHARS = /^[A-Za-z0-9 #%(),.+_-]*$/;
const VALUE_BANNED = /javascript|vbscript|data:|http|\/\/|expression|@import|\\/i;
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,40}$/;
const LOCAL_URL = /url\(#[A-Za-z][A-Za-z0-9_-]{0,40}\)/g;
const NUM = "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?";
const VIEW_BOX = new RegExp(`^(${NUM})[ ,]+(${NUM})[ ,]+(${NUM})[ ,]+(${NUM})$`);

// Text may use the five XML entities and character references; any other
// named entity (&nbsp;, or one a DOCTYPE would define) is malformed here.
const ENTITY = /&(?:#([0-9]{1,7})|#x([0-9A-Fa-f]{1,6})|(amp|lt|gt|quot|apos));/y;
const ENTITY_LIKE = /&[^\s&<;]{1,32};/y;
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
// Characters XML 1.0 has no place for (controls, lone surrogates, U+FFFE/FFFF).
const NOT_XML = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu;

/** A code point XML 1.0 allows in a document. */
function xmlChar(cp: number): boolean {
  return (
    cp === 0x9 || cp === 0xa || cp === 0xd ||
    (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff)
  );
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Text with its entities read, or null when one is unknown or names a character XML can't hold. */
function decodeText(t: string): string | null {
  if (!t.includes("&")) return t;
  let out = "";
  let i = 0;
  for (;;) {
    const k = t.indexOf("&", i);
    if (k < 0) return out + t.slice(i);
    out += t.slice(i, k);
    ENTITY.lastIndex = k;
    const m = ENTITY.exec(t);
    if (m) {
      if (m[3]) out += NAMED[m[3]];
      else {
        const cp = m[1] ? parseInt(m[1], 10) : parseInt(m[2], 16);
        if (!xmlChar(cp)) return null;
        out += String.fromCodePoint(cp);
      }
      i = ENTITY.lastIndex;
      continue;
    }
    ENTITY_LIKE.lastIndex = k;
    if (ENTITY_LIKE.test(t)) return null;
    // A lone "&" ("Bat & ball") is just the character; it is escaped on the way out.
    out += "&";
    i = k + 1;
  }
}

/**
 * The value as written out, or null to leave the attribute off. Values
 * are never decoded: an entity in one fails the character check, so a
 * value spelled with references ("&#106;avascript:") is simply dropped.
 */
function cleanValue(name: string, raw: string): string | null {
  if (raw.length > MAX_VALUE) return null;
  const v = raw.replace(/[ \t\r\n]+/g, " ").trim();
  if (!v || !VALUE_CHARS.test(v) || VALUE_BANNED.test(v)) return null;
  if (/url/i.test(v) && (!URL_ATTRIBUTES.has(name) || /url/i.test(v.replace(LOCAL_URL, "")))) return null;
  if (name === "id" && !ID.test(v)) return null;
  return v;
}

type Tag = { name: string; attrs: [string, string][]; selfClosing: boolean; end: number };

/** A start tag at s[i]: a name, then quoted attributes each after whitespace, then > or />. Null when malformed. */
function readTag(s: string, i: number): Tag | null {
  START_TAG.lastIndex = i;
  const m = START_TAG.exec(s);
  if (!m) return null;
  const attrs: [string, string][] = [];
  const seen = new Set<string>();
  let j = START_TAG.lastIndex;
  for (;;) {
    TAG_CLOSE.lastIndex = j;
    const close = TAG_CLOSE.exec(s);
    if (close) return { name: m[1], attrs, selfClosing: close[1] === "/", end: TAG_CLOSE.lastIndex };
    ATTRIBUTE.lastIndex = j;
    const a = ATTRIBUTE.exec(s);
    // Unquoted, valueless, unspaced or unterminated attributes, or a "<" inside a value.
    if (!a || seen.has(a[1])) return null;
    seen.add(a[1]);
    attrs.push([a[1], a[2] ?? a[3]]);
    j = ATTRIBUTE.lastIndex;
  }
}

/** The allowed attributes of an element, written out. */
function attributesOut(attrs: [string, string][], skip?: Set<string>): string {
  let out = "";
  for (const [name, raw] of attrs) {
    if (!ATTRIBUTES.has(name) || skip?.has(name)) continue;
    const v = cleanValue(name, raw);
    if (v !== null) out += ` ${name}="${escape(v)}"`;
  }
  return out;
}

const ROOT_OWN = new Set(["viewBox", "width", "height"]);

/**
 * The root's start tag, rebuilt; null without a viewBox of four numbers
 * and a positive, bounded size. width and height are always the
 * viewBox's: the chat shows the drawing full width at its own aspect
 * ratio, so a size of the model's (a height of 10^20, a sliver 1 wide
 * and 100,000 tall) could push the rest of the chat out of reach.
 */
function rootOut(attrs: [string, string][]): string | null {
  const get = (n: string) => attrs.find(([k]) => k === n)?.[1].replace(/[ \t\r\n]+/g, " ").trim();
  const vb = VIEW_BOX.exec(get("viewBox") ?? "");
  if (!vb) return null;
  const [minX, minY, w, h] = vb.slice(1, 5).map(Number);
  if (![minX, minY, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  if (w > MAX_SIDE || h > MAX_SIDE || w > h * MAX_ASPECT || h > w * MAX_ASPECT) return null;
  const rest = attributesOut(attrs, ROOT_OWN);
  // An <img> SVG can't load fonts and the browser's default is a serif:
  // when no font survives, labels use the system sans like the rest of the chat.
  const font = /\sfont-family="/.test(rest) ? "" : ' font-family="system-ui, sans-serif"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}"${rest}${font}`;
}

/**
 * The first <svg>…</svg> in `raw` rebuilt from its parsed tokens, or
 * null when there is none, it is malformed (unclosed or mismatched tags,
 * unquoted or repeated attributes, unknown entities, a doctype inside),
 * too big or too deep, has no usable viewBox (four numbers, sides of
 * 4000 at most, between 1:3 and 3:1), or nothing to look at is
 * left. Comments, CDATA sections and processing instructions are left
 * out; elements off the list go with everything inside them; attributes
 * off the list, or with a value that isn't plainly a number, colour,
 * path, keyword or url(#id), are left off.
 */
export function sanitizeSvg(raw: string): string | null {
  if (typeof raw !== "string" || raw.length > MAX_IN) return null;
  const start = raw.search(ROOT);
  if (start < 0) return null;
  const s = raw;
  const out: string[] = [];
  const stack: { name: string; kept: boolean }[] = [];
  let elements = 0;
  let drawn = 0;
  let closed = false;
  let i = start;
  while (i < s.length && !closed) {
    if (s[i] !== "<") {
      const k = s.indexOf("<", i);
      const end = k < 0 ? s.length : k;
      const text = decodeText(s.slice(i, end));
      if (text === null) return null;
      const top = stack[stack.length - 1];
      if (top?.kept && TEXT_IN.has(top.name)) {
        const t = text.replace(NOT_XML, "").replace(/[ \t\r\n]+/g, " ");
        if (t) out.push(escape(t));
      }
      i = end;
      continue;
    }
    const skip = SKIPPED.find(([open]) => s.startsWith(open, i));
    if (skip) {
      const k = s.indexOf(skip[1], i + skip[0].length);
      if (k < 0) return null;
      i = k + skip[1].length;
      continue;
    }
    if (s.startsWith("</", i)) {
      END_TAG.lastIndex = i;
      const m = END_TAG.exec(s);
      const top = stack.pop();
      if (!m || !top || top.name !== m[1]) return null;
      if (top.kept) out.push(`</${top.name}>`);
      i = END_TAG.lastIndex;
      closed = stack.length === 0;
      continue;
    }
    // A doctype, entity or element declaration inside the drawing, or a "<" that starts nothing.
    const tag = readTag(s, i);
    if (!tag) return null;
    if (++elements > MAX_ELEMENTS || stack.length + 1 > MAX_DEPTH) return null;
    const root = stack.length === 0;
    const parentKept = root || stack[stack.length - 1].kept;
    // Nested <svg>s go: one viewBox is enough, and inner ones can carry what the root can't.
    const kept = parentKept && (root || (tag.name !== "svg" && ELEMENTS.has(tag.name)));
    if (root) {
      const head = rootOut(tag.attrs);
      if (!head) return null;
      out.push(head);
    } else if (kept) {
      out.push(`<${tag.name}${attributesOut(tag.attrs)}`);
      if (DRAWN.has(tag.name) && !stack.some((e) => UNSEEN.has(e.name))) drawn++;
    }
    if (tag.selfClosing) {
      if (kept) out.push("/>");
      closed = root;
    } else {
      if (kept) out.push(">");
      stack.push({ name: tag.name, kept });
    }
    i = tag.end;
  }
  if (!closed || drawn === 0) return null;
  const svg = out.join("");
  return new TextEncoder().encode(svg).length <= MAX_OUT ? svg : null;
}
