import { AVATAR_PRESETS, type AvatarPresetId } from "./avatar";

/**
 * The sports avatars, drawn here as SVG (64 x 64, a full square: every
 * place shows it in a circle). Served at /avatars/<id>.svg by
 * app/avatars/[file]/route.ts, so any <img> of a profile picture shows
 * one with no special case. Brand greens and black, with the colour the
 * sport's own gear has (a red ball, an orange basketball). Static markup
 * only: no scripts, links or outside references. Relative imports only
 * (npm run test:account).
 */

const INK = "#1D1D1F";
const r1 = (n: number) => Math.round(n * 10) / 10;

/** A regular polygon's points: n corners at radius r around (cx, cy), the first at angle a0 (degrees, 0 = right, clockwise). */
function poly(cx: number, cy: number, r: number, n: number, a0: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((a0 + (360 / n) * i) * Math.PI) / 180;
    pts.push(`${r1(cx + r * Math.cos(a))},${r1(cy + r * Math.sin(a))}`);
  }
  return pts.join(" ");
}

/** A football: a black pentagon in the middle, five more at the edge, seams between. */
function football(): string {
  const angles = [-90, -18, 54, 126, 198];
  const rad = (a: number) => (a * Math.PI) / 180;
  const at = (a: number, r: number) => `${r1(32 + r * Math.cos(rad(a)))} ${r1(32 + r * Math.sin(rad(a)))}`;
  const edge = angles.map((a) => `<polygon points="${poly(32 + 19 * Math.cos(rad(a)), 32 + 19 * Math.sin(rad(a)), 7, 5, a + 180)}"/>`).join("");
  const seams = angles.map((a) => `M${at(a, 6.5)}L${at(a, 12.6)}`).join("");
  return (
    `<defs><clipPath id="b"><circle cx="32" cy="32" r="19"/></clipPath></defs>` +
    `<circle cx="32" cy="32" r="19" fill="#fff"/>` +
    `<g clip-path="url(#b)" fill="${INK}"><polygon points="${poly(32, 32, 6.5, 5, -90)}"/>${edge}</g>` +
    `<path d="${seams}" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<circle cx="32" cy="32" r="19" fill="none" stroke="${INK}" stroke-opacity=".18" stroke-width="1.5"/>`
  );
}

const ART: Record<AvatarPresetId, { bg: string; body: () => string }> = {
  football: { bg: "#16A34A", body: football },
  "cricket-ball": {
    bg: "#14532D",
    body: () =>
      `<circle cx="32" cy="32" r="18" fill="#DC2626"/>` +
      `<circle cx="26" cy="25" r="7" fill="#fff" fill-opacity=".16"/>` +
      `<g transform="rotate(-32 32 32)" fill="none" stroke="#FEF3C7" stroke-linecap="round">` +
      `<path d="M14.5 31A17.5 5 0 0 0 49.5 31" stroke-width="1.5"/>` +
      `<path d="M14.5 33A17.5 9 0 0 0 49.5 33" stroke-width="1.5"/>` +
      `<path d="M15.5 32A16.5 7 0 0 0 48.5 32" stroke-width="2.6" stroke-dasharray=".1 2.6"/>` +
      `</g>` +
      `<circle cx="32" cy="32" r="18" fill="none" stroke="#000" stroke-opacity=".15" stroke-width="1.2"/>`,
  },
  bat: {
    bg: "#DCFCE7",
    body: () =>
      `<g transform="rotate(38 32 32)">` +
      `<rect x="29.6" y="5" width="4.8" height="17" rx="2.2" fill="${INK}"/>` +
      `<path d="M29.6 10.5h4.8M29.6 14.5h4.8M29.6 18.5h4.8" stroke="#4B5563" stroke-width="1"/>` +
      `<path d="M25.5 22.5h13v25.5a4.5 4.5 0 0 1-4.5 4.5h-4a4.5 4.5 0 0 1-4.5-4.5Z" fill="#E8B866" stroke="#A16207" stroke-width="1.3"/>` +
      `<path d="M32 25v24" stroke="#A16207" stroke-opacity=".45" stroke-width="1.2"/>` +
      `</g>` +
      `<circle cx="47" cy="46" r="5.5" fill="#DC2626"/>` +
      `<path d="M43.2 43.6q3.8 2.6 7.6 4.8" fill="none" stroke="#FEF3C7" stroke-width="1.1" stroke-dasharray="1 1.4"/>`,
  },
  stumps: {
    bg: "#0284C7",
    body: () =>
      `<g fill="#FEF3C7"><rect x="20.5" y="19" width="5" height="31" rx="2"/><rect x="29.5" y="19" width="5" height="31" rx="2"/><rect x="38.5" y="19" width="5" height="31" rx="2"/></g>` +
      `<g fill="#F59E0B"><rect x="19.5" y="14.5" width="12" height="3.2" rx="1.6"/><rect x="32.5" y="14.5" width="12" height="3.2" rx="1.6"/></g>` +
      `<rect x="12" y="51" width="40" height="2.4" rx="1.2" fill="#fff" fill-opacity=".55"/>`,
  },
  racquet: {
    bg: "#EF4444",
    body: () =>
      `<defs><clipPath id="h"><ellipse cx="32" cy="23" rx="9.6" ry="12.4"/></clipPath></defs>` +
      `<g transform="rotate(-35 32 32)">` +
      `<g clip-path="url(#h)" stroke="#fff" stroke-opacity=".8" stroke-width=".9">` +
      [22.4, 25.6, 28.8, 32, 35.2, 38.4, 41.6].map((x) => `<path d="M${x} 9v28"/>`).join("") +
      [12, 15.2, 18.4, 21.6, 24.8, 28, 31.2, 34.4].map((y) => `<path d="M20 ${y}h24"/>`).join("") +
      `</g>` +
      `<ellipse cx="32" cy="23" rx="11" ry="13.8" fill="none" stroke="#fff" stroke-width="3"/>` +
      `<path d="M28.6 35.6 31 43h2l2.4-7.4" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/>` +
      `<rect x="29.8" y="42" width="4.4" height="15" rx="2.2" fill="${INK}"/>` +
      `</g>` +
      `<circle cx="47.5" cy="46.5" r="6" fill="#FDE047"/>` +
      `<path d="M42.2 44.6q5.6 0.4 6.6 7.6M52.8 48.4q-5.6-0.4-6.6-7.6" fill="none" stroke="#fff" stroke-width="1.3"/>`,
  },
  shuttlecock: {
    bg: INK,
    body: () =>
      `<g transform="rotate(-28 32 32)">` +
      `<path d="M24.5 39 17.5 13.5q2.4-2.2 4.6 0 2.3-2.2 4.6 0 2.3-2.2 4.6 0 2.3-2.2 4.6 0 2.3-2.2 4.6 0 2.3-2.2 4.6 0L39.5 39Z" fill="#fff"/>` +
      `<path d="M27.5 39 22.6 14M32 39V14M36.5 39l4.9-25" stroke="#9CA3AF" stroke-width="1"/>` +
      `<path d="M21.7 27.5h20.6" stroke="#9CA3AF" stroke-width="1"/>` +
      `<rect x="24" y="37.6" width="16" height="3" fill="#16A34A"/>` +
      `<path d="M24 40.6h16v1.4a8 8 0 0 1-16 0Z" fill="#FBBF24"/>` +
      `</g>`,
  },
  basketball: {
    bg: "#FFEDD5",
    body: () =>
      `<defs><clipPath id="k"><circle cx="32" cy="32" r="18"/></clipPath></defs>` +
      `<circle cx="32" cy="32" r="18" fill="#EA580C"/>` +
      `<g clip-path="url(#k)" fill="none" stroke="${INK}" stroke-width="1.8">` +
      `<path d="M32 13v38M13 32h38M21 16q9.5 16 0 32M43 16q-9.5 16 0 32"/>` +
      `</g>` +
      `<circle cx="32" cy="32" r="18" fill="none" stroke="${INK}" stroke-width="1.8"/>`,
  },
  volleyball: {
    bg: "#F59E0B",
    body: () =>
      `<defs><clipPath id="v"><circle cx="32" cy="32" r="18"/></clipPath></defs>` +
      `<circle cx="32" cy="32" r="18" fill="#fff"/>` +
      `<g clip-path="url(#v)">` +
      `<path d="M32 32C31 23 25.5 17 17 14.5L13 22c8 1.5 14 5 19 10Z" fill="#2563EB"/>` +
      `<path d="M32 32c7.5-4.5 15.6-4.4 20.6.6l-3 8.4c-5-4.2-11-5.6-17.6-9Z" fill="#FACC15"/>` +
      `<path d="M32 32c-1 8.5-6 15-13.6 18.6l7.6 3.4c5-4.8 6.8-12 6-22Z" fill="#2563EB"/>` +
      `</g>` +
      `<g clip-path="url(#v)" fill="none" stroke="${INK}" stroke-width="1.4">` +
      `<path d="M32 32C31 23 25.5 17 17 14.5M32 32c7.5-4.5 15.6-4.4 20.6.6M32 32c-1 8.5-6 15-13.6 18.6"/>` +
      `</g>` +
      `<circle cx="32" cy="32" r="18" fill="none" stroke="${INK}" stroke-width="1.6"/>`,
  },
  whistle: {
    bg: "#7C3AED",
    body: () =>
      `<path d="M15 31C9 22 12 12 22 9" fill="none" stroke="#FACC15" stroke-width="2.6" stroke-linecap="round"/>` +
      `<circle cx="16" cy="32.5" r="3" fill="none" stroke="#E5E7EB" stroke-width="2"/>` +
      `<path d="M24.5 26H49a2.5 2.5 0 0 1 2.5 2.5v3A2.5 2.5 0 0 1 49 34H34.6A10.5 10.5 0 1 1 24.5 26Z" fill="#F3F4F6" stroke="#9CA3AF" stroke-width="1.2"/>` +
      `<circle cx="24.5" cy="36.5" r="5" fill="#D1D5DB"/>` +
      `<rect x="29" y="27.6" width="7" height="3" rx="1" fill="#6B7280"/>`,
  },
  trophy: {
    bg: "#E0F2FE",
    body: () =>
      `<path d="M22 17h-4a5 5 0 0 0 5 8.5M42 17h4a5 5 0 0 1-5 8.5" fill="none" stroke="#D97706" stroke-width="2.6" stroke-linecap="round"/>` +
      `<path d="M21.5 13h21v10.5a10.5 10.5 0 0 1-21 0Z" fill="#F59E0B"/>` +
      `<polygon points="${poly(32, 22, 4.6, 5, -90)}" fill="#FEF3C7"/>` +
      `<rect x="29.8" y="33.5" width="4.4" height="7" fill="#D97706"/>` +
      `<rect x="24.5" y="40.5" width="15" height="4" rx="1.2" fill="#D97706"/>` +
      `<rect x="21" y="44.5" width="22" height="6" rx="1.6" fill="#92400E"/>`,
  },
  jersey: {
    bg: "#FDE68A",
    body: () =>
      `<path d="M24.5 13 17 15.5 9.5 23.5l5.5 7 4.5-3.2V52h25V27.3l4.5 3.2 5.5-7-7.5-8L39.5 13q-7.5 6.5-15 0Z" fill="#16A34A"/>` +
      `<path d="M24.5 13q7.5 6.5 15 0" fill="none" stroke="#14532D" stroke-width="2.2"/>` +
      `<path d="M19.5 27.3 15 30.5M44.5 27.3l4.5 3.2" stroke="#14532D" stroke-width="1.4"/>` +
      // "10", drawn so it never depends on a font.
      `<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M25.5 30.5l3-2.2v14"/>` +
      `<rect x="33" y="28.3" width="7" height="14" rx="3.5"/>` +
      `</g>`,
  },
  hockey: {
    bg: "#0F766E",
    body: () =>
      `<path d="M41 9 27 44.5q-2.4 5.6-8 4.6-4.6-.9-3.4-5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M41 9l-3.4 8.4" stroke="${INK}" stroke-width="5.6" stroke-linecap="round"/>` +
      `<circle cx="44.5" cy="46" r="4.8" fill="#FDE047"/>`,
  },
};

/** An avatar's SVG file. */
export function avatarSvg(id: AvatarPresetId): string {
  const { bg, body } = ART[id];
  const label = AVATAR_PRESETS.find((p) => p.id === id)?.label ?? id;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${label}">` +
    `<title>${label}</title><rect width="64" height="64" fill="${bg}"/>${body()}</svg>`
  );
}
