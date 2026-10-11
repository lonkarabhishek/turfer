"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { parseOvers } from "@/lib/cricket/overs";
import { describeResult } from "@/lib/cricket/nrr";
import { trackTool } from "@/lib/analytics/tools";
import { ToolCta } from "./ToolCta";
import { Field, NumberInput, OversInput, PrimaryButton, SecondaryButton, Segmented, TextInput } from "./inputs";

const TOOL = "scorecard_maker";
const SIZE = 1080;

type Card = {
  tournament: string;
  aName: string;
  aRuns: string;
  aWkts: string;
  aOvers: string;
  bName: string;
  bRuns: string;
  bWkts: string;
  bOvers: string;
  result: string;
  potm: string;
  topScorer: string;
  bestBowler: string;
  venue: string;
};

const EMPTY: Card = { tournament: "", aName: "", aRuns: "", aWkts: "", aOvers: "", bName: "", bRuns: "", bWkts: "", bOvers: "", result: "", potm: "", topScorer: "", bestBowler: "", venue: "" };

const score = (runs: string, wkts: string, overs: string) => {
  if (runs === "") return "";
  const w = wkts === "" ? "" : `/${wkts}`;
  const o = overs === "" ? "" : ` (${overs} ov)`;
  return `${runs}${w}${o}`;
};

/** Shrink the font until the text fits the width. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight = "700", min = 24): number {
  let s = size;
  for (;;) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth || s <= min) return s;
    s -= 2;
  }
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif';

/** Draw the card. Square, dark, one green stripe, big scores, the result in the middle. */
export function drawCard(canvas: HTMLCanvasElement, c: Card) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = SIZE;
  canvas.height = SIZE;
  const pad = 72;
  const W = SIZE - pad * 2;

  ctx.fillStyle = "#111113";
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Green stripe top, faint pitch lines
  ctx.fillStyle = "#16A34A";
  ctx.fillRect(0, 0, SIZE, 14);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 2;
  for (let y = 200; y < SIZE; y += 120) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SIZE, y);
    ctx.stroke();
  }

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  // Header
  ctx.fillStyle = "#86EFAC";
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText((c.tournament || "Match result").toUpperCase().slice(0, 48), pad, pad + 40);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `600 24px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(c.tournament ? "MATCH RESULT" : "", SIZE - pad, pad + 40);
  ctx.textAlign = "left";

  // Teams
  const rowTop = 230;
  const rowGap = 230;
  const teams = [
    { name: c.aName || "Team A", score: score(c.aRuns, c.aWkts, c.aOvers) },
    { name: c.bName || "Team B", score: score(c.bRuns, c.bWkts, c.bOvers) },
  ];
  teams.forEach((t, i) => {
    const y = rowTop + i * rowGap;
    ctx.fillStyle = "#FFFFFF";
    const nameSize = fitText(ctx, t.name, W - 400, 64, "800", 34);
    ctx.font = `800 ${nameSize}px ${FONT}`;
    ctx.fillText(t.name, pad, y + 60);
    ctx.textAlign = "right";
    ctx.fillStyle = "#FFFFFF";
    const scoreSize = fitText(ctx, t.score || "-", 380, 72, "800", 36);
    ctx.font = `800 ${scoreSize}px ${FONT}`;
    ctx.fillText(t.score || "-", SIZE - pad, y + 60);
    ctx.textAlign = "left";
    if (i === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(pad, y + 120, W, 2);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `700 22px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("VS", SIZE / 2, y + 170);
      ctx.textAlign = "left";
    }
  });

  // Result band
  const bandY = 700;
  ctx.fillStyle = "#16A34A";
  roundRect(ctx, pad, bandY, W, 110, 24);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  const res = c.result || "Result";
  const resSize = fitText(ctx, res, W - 60, 44, "800", 24);
  ctx.font = `800 ${resSize}px ${FONT}`;
  ctx.fillText(res, SIZE / 2, bandY + 70);
  ctx.textAlign = "left";

  // Extras
  const extras = [
    c.potm ? ["Player of the match", c.potm] : null,
    c.topScorer ? ["Top scorer", c.topScorer] : null,
    c.bestBowler ? ["Best bowler", c.bestBowler] : null,
    c.venue ? ["Venue", c.venue] : null,
  ].filter((x): x is [string, string] => !!x);
  let y = bandY + 170;
  for (const [k, v] of extras.slice(0, 4)) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(k.toUpperCase(), pad, y);
    ctx.fillStyle = "#FFFFFF";
    const vs = fitText(ctx, v, W - 330, 30, "700", 20);
    ctx.font = `700 ${vs}px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(v, SIZE - pad, y);
    ctx.textAlign = "left";
    y += 50;
  }

  // Footer branding, subtle
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText("Made with TapTurf.in", pad, SIZE - pad + 10);
  ctx.fillStyle = "#16A34A";
  ctx.beginPath();
  ctx.arc(SIZE - pad - 8, SIZE - pad + 2, 8, 0, Math.PI * 2);
  ctx.fill();
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

export function ScorecardMaker({ cta }: { cta: { label: string; href: string } }) {
  const [c, setC] = useState<Card>(EMPTY);
  const [battedFirst, setBattedFirst] = useState<"a" | "b">("a");
  const [resultEdited, setResultEdited] = useState(false);
  const [more, setMore] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const used = useRef(false);
  const reported = useRef(false);

  useEffect(() => {
    trackTool("tool_opened", TOOL);
    // After mount, so the server and first client render agree.
    const t = setTimeout(() => {
      try {
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        setCanShare(typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [new File([""], "x.png", { type: "image/png" })] }));
      } catch {
        setCanShare(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const set = (k: keyof Card) => (v: string) => {
    if (!used.current) {
      used.current = true;
      trackTool("tool_used", TOOL);
    }
    if (k === "result") setResultEdited(v.trim() !== "");
    setC((prev) => ({ ...prev, [k]: v }));
  };

  // Suggested result from the scores, unless the user typed their own.
  const suggested = useMemo(() => {
    if (c.aRuns === "" || c.bRuns === "") return "";
    const pa = parseOvers(c.aOvers || "0");
    const pb = parseOvers(c.bOvers || "0");
    const m = {
      id: "card",
      teamA: c.aName || "Team A",
      teamB: c.bName || "Team B",
      a: { runs: Number(c.aRuns), wickets: Number(c.aWkts || 0), balls: pa.ok ? pa.balls : 0 },
      b: { runs: Number(c.bRuns), wickets: Number(c.bWkts || 0), balls: pb.ok ? pb.balls : 0 },
      result: "auto" as const,
    };
    return describeResult(m, battedFirst);
  }, [c.aRuns, c.bRuns, c.aWkts, c.bWkts, c.aOvers, c.bOvers, c.aName, c.bName, battedFirst]);

  const card: Card = useMemo(() => ({ ...c, result: resultEdited ? c.result : suggested }), [c, resultEdited, suggested]);
  const ready = card.aName.trim() !== "" && card.bName.trim() !== "" && card.aRuns !== "" && card.bRuns !== "";

  useEffect(() => {
    if (canvasRef.current) drawCard(canvasRef.current, card);
    if (ready && !reported.current) {
      reported.current = true;
      trackTool("tool_result_generated", TOOL);
    }
  }, [card, ready]);

  const fileName = () => `${(card.aName || "team-a").replace(/\s+/g, "-")}-vs-${(card.bName || "team-b").replace(/\s+/g, "-")}-scorecard.png`.toLowerCase();

  const toBlob = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const cv = canvasRef.current;
        if (!cv) return resolve(null);
        drawCard(cv, card);
        cv.toBlob((b) => resolve(b), "image/png");
      }),
    [card],
  );

  const download = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    trackTool("tool_cta_clicked", TOOL, { href: "download" });
  };

  const share = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], fileName(), { type: "image/png" });
    try {
      await navigator.share({ files: [file], title: card.result || "Match result", text: `${card.aName} vs ${card.bName}: ${card.result}` });
    } catch {
      /* cancelled */
    }
  };

  const oversErr = (v: string) => {
    if (v === "") return null;
    const p = parseOvers(v);
    return p.ok ? null : p.error;
  };

  return (
    <div className="rounded-3xl border border-primary-200 bg-white p-4 sm:p-6 shadow-soft">
      <div className="grid lg:grid-cols-[1fr_360px] gap-5">
        <div className="space-y-4">
          <Field label="Tournament or series (optional)" htmlFor="sc-tournament">
            <TextInput id="sc-tournament" value={c.tournament} onChange={set("tournament")} placeholder="Sunday Box League" maxLength={48} />
          </Field>

          {(["a", "b"] as const).map((side) => (
            <fieldset key={side} className="rounded-2xl bg-primary-50 p-3 space-y-3">
              <legend className="sr-only">Team {side.toUpperCase()}</legend>
              <TextInput value={side === "a" ? c.aName : c.bName} onChange={set(side === "a" ? "aName" : "bName")} placeholder={side === "a" ? "Team A, e.g. Titans" : "Team B, e.g. Strikers"} ariaLabel={`Team ${side.toUpperCase()} name`} />
              <div className="grid grid-cols-3 gap-2">
                <Field label="Runs" htmlFor={`sc-${side}-runs`}>
                  <NumberInput id={`sc-${side}-runs`} value={side === "a" ? c.aRuns : c.bRuns} onChange={set(side === "a" ? "aRuns" : "bRuns")} placeholder="63" />
                </Field>
                <Field label="Wickets" htmlFor={`sc-${side}-wkts`}>
                  <NumberInput id={`sc-${side}-wkts`} value={side === "a" ? c.aWkts : c.bWkts} onChange={set(side === "a" ? "aWkts" : "bWkts")} placeholder="4" max={10} />
                </Field>
                <Field label="Overs" htmlFor={`sc-${side}-overs`} error={oversErr(side === "a" ? c.aOvers : c.bOvers)}>
                  <OversInput id={`sc-${side}-overs`} value={side === "a" ? c.aOvers : c.bOvers} onChange={set(side === "a" ? "aOvers" : "bOvers")} placeholder="6" invalid={!!oversErr(side === "a" ? c.aOvers : c.bOvers)} />
                </Field>
              </div>
            </fieldset>
          ))}

          <div>
            <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Who batted first</p>
            <Segmented
              value={battedFirst}
              onChange={setBattedFirst}
              ariaLabel="Who batted first"
              options={[
                { value: "a", label: c.aName || "Team A" },
                { value: "b", label: c.bName || "Team B" },
              ]}
            />
          </div>

          <Field label="Result" htmlFor="sc-result" hint={!resultEdited && suggested ? "Worked out from the scores. Edit it if you like." : undefined}>
            <TextInput id="sc-result" value={resultEdited ? c.result : suggested} onChange={set("result")} placeholder="Titans won by 8 runs" maxLength={60} />
          </Field>

          <button type="button" onClick={() => setMore((v) => !v)} className="text-[14px] font-semibold text-accent-700 hover:underline">
            {more ? "Hide extras" : "Add player of the match, venue and more"}
          </button>
          {more && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Player of the match" htmlFor="sc-potm">
                <TextInput id="sc-potm" value={c.potm} onChange={set("potm")} placeholder="Rohan" />
              </Field>
              <Field label="Top scorer" htmlFor="sc-top">
                <TextInput id="sc-top" value={c.topScorer} onChange={set("topScorer")} placeholder="Rohan 34 (12)" />
              </Field>
              <Field label="Best bowler" htmlFor="sc-bowl">
                <TextInput id="sc-bowl" value={c.bestBowler} onChange={set("bestBowler")} placeholder="Sahil 3/12" />
              </Field>
              <Field label="Venue" htmlFor="sc-venue">
                <TextInput id="sc-venue" value={c.venue} onChange={set("venue")} placeholder="Hindu Gymkhana, Kothrud" maxLength={48} />
              </Field>
            </div>
          )}
        </div>

        <div>
          <p className="text-[12px] font-bold uppercase tracking-wide text-primary-500 mb-2">Preview</p>
          <canvas ref={canvasRef} width={SIZE} height={SIZE} className="w-full h-auto rounded-2xl shadow-elevated bg-primary-900" aria-label="Scorecard preview" role="img" />
          <div className="mt-3 flex flex-col sm:flex-row lg:flex-col gap-2">
            <PrimaryButton onClick={download} disabled={!ready} className="w-full">
              <Download className="w-4 h-4" aria-hidden /> Download PNG
            </PrimaryButton>
            {canShare && (
              <SecondaryButton onClick={share} disabled={!ready} className="w-full">
                <Share2 className="w-4 h-4" aria-hidden /> Share
              </SecondaryButton>
            )}
          </div>
          {!ready && <p className="mt-2 text-[12px] text-primary-400 text-center">Add both team names and scores to enable download.</p>}
        </div>
      </div>

      <ToolCta tool={TOOL} label={cta.label} href={cta.href} />
    </div>
  );
}
