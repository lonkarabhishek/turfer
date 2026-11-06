import type { CardLines } from "@/lib/turfSession/share";

/**
 * The session's picture for WhatsApp: a 1080x1350 portrait card drawn on
 * the phone from share.ts cardLines (no server copy, works offline, and
 * the phone's own fonts draw any script a name is typed in). Dark like the
 * scorecard maker's card, the series score huge, every match under it.
 * fitText and roundRect as in ScorecardMaker.tsx.
 */

export const CARD_W = 1080;
export const CARD_H = 1350;

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif';
const DARK = "#1D1D1F";
const GREEN = "#16A34A";
const LIGHT_GREEN = "#86EFAC";

/** Shrink the font until the text fits the width. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight = "700", min = 24): number {
  let s = size;
  for (;;) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth || s <= min) return s;
    s -= 2;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Cut a line with an ellipsis until it fits at this size. */
function clip(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export function drawSessionCard(canvas: HTMLCanvasElement, c: CardLines) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const pad = 72;
  const W = CARD_W - pad * 2;

  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, 0, CARD_W, 14);
  ctx.textBaseline = "alphabetic";

  // Eyebrow
  ctx.textAlign = "left";
  ctx.fillStyle = LIGHT_GREEN;
  const eb = fitText(ctx, c.eyebrow, W, 30, "800", 22);
  ctx.font = `800 ${eb}px ${FONT}`;
  ctx.fillText(clip(ctx, c.eyebrow, W), pad, pad + 44);

  // The score: names either side of a huge "4 – 2".
  const top = 210;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `900 220px ${FONT}`;
  ctx.fillText(`${c.scoreA} – ${c.scoreB}`, CARD_W / 2, top + 210);
  const nameW = W / 2 - 24;
  for (const [i, name] of [c.nameA, c.nameB].entries()) {
    const size = fitText(ctx, name, nameW, 52, "800", 28);
    ctx.font = `800 ${size}px ${FONT}`;
    ctx.textAlign = i === 0 ? "left" : "right";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(clip(ctx, name, nameW), i === 0 ? pad : CARD_W - pad, top + 300);
  }

  // Verdict band
  const bandY = top + 350;
  ctx.fillStyle = GREEN;
  roundRect(ctx, pad, bandY, W, 104, 24);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  const vs = fitText(ctx, c.verdict, W - 60, 46, "800", 26);
  ctx.font = `800 ${vs}px ${FONT}`;
  ctx.fillText(clip(ctx, c.verdict, W - 60), CARD_W / 2, bandY + 66);
  if (c.extras) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(c.extras, CARD_W / 2, bandY + 148);
  }

  // Every match
  let y = bandY + (c.extras ? 214 : 180);
  ctx.textAlign = "left";
  const rows = c.matches.length;
  // Room above the footer: the match lines get smaller when there are many of them and the stars too.
  const starsH = c.stars.length ? 34 + c.stars.length * 46 : 0;
  const room = CARD_H - pad - 44 - y - starsH;
  const step = Math.max(36, Math.min(54, rows ? Math.floor(room / rows) : 54));
  const lineSize = Math.min(34, step - 14);
  for (const line of c.matches) {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `700 ${lineSize}px ${FONT}`;
    ctx.fillText(clip(ctx, line, W), pad, y);
    y += step;
  }

  // Stars
  if (c.stars.length) {
    y += 16;
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(pad, y - 34, W, 2);
    y += 18;
    for (const s of c.stars) {
      ctx.fillStyle = LIGHT_GREEN;
      ctx.font = `700 30px ${FONT}`;
      ctx.fillText(clip(ctx, s, W), pad, y);
      y += 46;
    }
  }

  // Footer
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `700 26px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(c.footer, pad, CARD_H - pad + 6);
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.arc(CARD_W - pad - 8, CARD_H - pad - 2, 9, 0, Math.PI * 2);
  ctx.fill();
}

/** The card as a PNG. */
export function cardBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/png");
    } catch {
      resolve(null);
    }
  });
}
