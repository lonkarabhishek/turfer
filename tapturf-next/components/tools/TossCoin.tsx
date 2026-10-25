"use client";

import { memo, useEffect, useImperativeHandle, useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { preload } from "react-dom";
import { COIN_D, COIN_R, COIN_T, EDGE_SEGS, REST_Y, STAGE_H, restPose, restStyles, type Face, type TossFrame } from "@/lib/tools/tossSim";
import { createTossPlayer, type TossPlayer } from "./tossPlayer";

export type TossCoinHandle = {
  /** Start a toss that lands on `face`. Returns ms from the coin's first frame to the result. */
  toss(face: Face): number;
};

// Server and first client render show heads at rest; the player takes over after mount.
const REST = restStyles(restPose("heads"));
const SEG = Math.PI / EDGE_SEGS;
// Geometry for the .toss-* rules in globals.css, from the same numbers the sim uses.
const STAGE_STYLE = {
  height: STAGE_H,
  "--toss-y": `${REST_Y}px`,
  "--toss-d": `${COIN_D}px`,
  "--toss-t": `${COIN_T}px`,
  "--toss-el": `${(2 * COIN_R * Math.sin(SEG) + 1).toFixed(3)}px`,
  "--toss-ap": `${(COIN_R * Math.cos(SEG) - 0.13).toFixed(3)}px`,
  "--toss-seg": `${360 / EDGE_SEGS}deg`,
} as CSSProperties;

const style = (k: TossFrame): CSSProperties => ({ transform: k.transform, opacity: k.opacity });
const EDGES = Array.from({ length: EDGE_SEGS }, (_, i) => i);
const FACES = [0, 1] as const;

/**
 * One layer of the coin with its own 3D context. The coin is convex and every
 * part hides its back, so the parts that face the viewer never overlap and the
 * layers can simply paint in order: edge, edge shading, faces, then the light
 * on the faces. Nothing has to be depth-sorted against anything coplanar.
 * Smooth layers are drawn at 1x; the faces and the reeded edge at --k.
 */
function Layer({ sharp, children }: { sharp?: boolean; children: ReactNode }) {
  return (
    <div className={`toss-coin${sharp ? "" : " toss-1x"}`} style={{ transform: REST.coin }}>
      <div className="toss-scale">{children}</div>
    </div>
  );
}

/**
 * The 3D coin: two baked faces, a reeded edge of 32 facets, and light that
 * moves over it. Decorative; the result is announced by the caller.
 */
export const TossCoin = memo(function TossCoin({ ref, onResult, sound }: { ref?: Ref<TossCoinHandle>; onResult: (face: Face) => void; sound: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const player = useRef<TossPlayer | null>(null);
  const live = useRef({ onResult, sound });

  useEffect(() => {
    live.current = { onResult, sound };
  }, [onResult, sound]);

  // Built once per mount; Strict Mode's second mount gets a fresh player.
  useEffect(() => {
    const p = createTossPlayer(root.current!, live);
    player.current = p;
    return () => {
      p.dispose();
      player.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({ toss: (face: Face) => player.current?.toss(face) ?? 0 }), []);

  // Fetch the resting face with the page, not after the CSS. Picks the file globals.css
  // picks: 672 from 2.5 dppx up (220px puts the switch there), 448 below.
  preload("/tools/toss/heads-448.webp", {
    as: "image",
    imageSrcSet: "/tools/toss/heads-448.webp 448w, /tools/toss/heads-672.webp 672w",
    imageSizes: "220px",
    fetchPriority: "high",
  });

  return (
    <div ref={root} className="toss-stage" style={STAGE_STYLE} aria-hidden>
      <div className="toss-shadow">
        <i className="toss-sh-soft" style={style(REST.soft)} />
        <i className="toss-sh-contact" style={style(REST.contact)} />
      </div>
      <Layer sharp>
        {EDGES.map((i) => (
          <i key={i} className="toss-edge" style={{ "--i": i } as CSSProperties} />
        ))}
      </Layer>
      <Layer>
        {EDGES.map((i) => (
          <i key={i} className="toss-edge toss-edge-shade" style={{ "--i": i, opacity: REST.edges[i] } as CSSProperties} />
        ))}
      </Layer>
      <Layer sharp>
        <i className="toss-face toss-front toss-heads" />
        <i className="toss-face toss-back toss-tails" />
      </Layer>
      <Layer>
        {FACES.map((f) => (
          <i key={f} className={`toss-face toss-shade ${f ? "toss-back" : "toss-front"}`} style={style(REST.faces[f].shade)} />
        ))}
      </Layer>
      <Layer>
        {FACES.map((f) => (
          <i key={f} className="toss-face toss-lathe" style={style(REST.faces[f].lathe)} />
        ))}
      </Layer>
      <Layer>
        {FACES.map((f) => (
          <i key={f} className="toss-face toss-glint" style={style(REST.faces[f].glint)} />
        ))}
      </Layer>
      <div className="toss-spark" />
      <div className="toss-veil" />
    </div>
  );
});
