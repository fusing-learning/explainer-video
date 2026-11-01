import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_IN_OUT, cueFrame, enter, prog, rand, useScene } from "../lib/anim";
import { MONO, SANS, alpha, resolveColor, useLayout, usePalette } from "../lib/theme";
import { Box, Mono } from "../lib/ui";
import type { Visual } from "../lib/types";

type Props = { v: Visual; box: Box };

/** Named things in a row (teams, agents, parts), with tags and optional "swarm" grids under each. */
export function Chips({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const items: { label: string; sub?: string; at?: number | string }[] = (v.items ?? []).map((it: unknown) => (typeof it === "string" ? { label: it } : it));
  const tags: { label: string; at?: number | string }[] = (v.tags ?? []).map((t: unknown) => (typeof t === "string" ? { label: t } : t));
  const at = cueFrame(scene, v.at ?? 0);
  const n = Math.max(1, items.length);
  const gap = 26;
  const big = !v.swarm && n <= 4;
  const { portrait } = useLayout();
  const perRow = Math.min(n, portrait ? v.vertical?.perRow ?? (big ? 2 : 3) : v.perRow ?? 6);
  const w = Math.min(big ? 380 : 260, (box.w - gap * (perRow - 1)) / perRow);
  const swarmAt = v.swarm ? cueFrame(scene, v.swarm.at ?? 1) : 0;
  const cells = v.swarm?.cells ?? 10;
  return (
    <div>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: 26, rowGap: 12, marginBottom: 34 }}>
          {tags.map((t, i) => {
            const tAt = cueFrame(scene, t.at ?? at + i * 8);
            const on = prog(frame, tAt, 10);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.25 + 0.75 * on }}>
                <div style={{ width: 14, height: 14, background: on > 0.5 ? p.accent : p.faint }} />
                <Mono size={big ? 26 : 22} color={on > 0.5 ? p.text : p.muted}>{t.label}</Mono>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: `40px ${gap}px`, width: box.w }}>
        {items.map((it, i) => {
          const iAt = it.at !== undefined ? cueFrame(scene, it.at) : at + i * (v.stagger ?? 6);
          const on = prog(frame, iAt, 14);
          return (
            <div key={i} style={{ width: w, opacity: 0.2 + 0.8 * on }}>
              <div style={{ height: 3, background: on > 0 ? p.accent : p.faint, width: `${100 * Math.max(0.15, on)}%` }} />
              <div style={{ fontFamily: SANS, fontSize: big ? 46 : 34, color: p.accent, marginTop: 14, fontWeight: 500 }}>{it.label}</div>
              {it.sub && <Mono size={big ? 24 : 20} style={{ display: "block", marginTop: 8 }}>{it.sub}</Mono>}
              {v.swarm && (
                <svg width={w} height={w * 0.75} style={{ marginTop: 18 }}>
                  {Array.from({ length: cells * Math.round(cells * 0.75) }, (_, k) => {
                    const c = k % cells;
                    const r = Math.floor(k / cells);
                    const s = (w - (cells - 1) * 3) / cells;
                    const appear = swarmAt + rand(k * 7 + i * 131) * 45;
                    const flick = rand(k + i * 977 + Math.floor((frame - appear) / 9)) > 0.25;
                    const o = frame >= appear ? (flick ? 1 : 0.45) : 0;
                    return <rect key={k} x={c * (s + 3)} y={r * (s + 3)} width={s} height={s} fill={rand(k * 3 + i) > 0.5 ? p.accent : p.accent2} opacity={o} />;
                  })}
                </svg>
              )}
            </div>
          );
        })}
      </div>
      {v.note && <div style={{ marginTop: 22, ...enter(frame, v.swarm ? swarmAt + 20 : at + 20) }}><Mono size={big ? 24 : 21}>{v.note}</Mono></div>}
    </div>
  );
}

/** A process as a row of stages inside a frame; a pulse travels through them (and loops if loop=true).
 * Vertical: the stages stack as rows, and a stage glows while the pulse runs down its right edge. */
export function Flow({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const { portrait } = useLayout();
  const steps: { label?: string; text: string; at?: number | string }[] = (v.steps ?? []).map((s: unknown) => (typeof s === "string" ? { text: s } : s));
  const n = Math.max(1, steps.length);
  const at = cueFrame(scene, v.at ?? 0);
  const W = portrait ? box.w : Math.min(box.w, v.width ?? box.w);
  const H = portrait ? Math.min(box.h - (v.note ? 70 : 0), v.vertical?.height ?? n * 170) : v.height ?? 230;
  const colW = W / n;
  const rowH = H / n;
  const boxOn = prog(frame, at - 8, 18);
  // The pulse travels the perimeter once per `period` frames after the last stage has appeared.
  const stepAt = (s: { at?: number | string }, i: number) => (s.at !== undefined ? cueFrame(scene, s.at) : at + i * 10);
  const lastAt = Math.max(...steps.map(stepAt));
  const period = v.period ?? 75;
  const perim = 2 * (W + H);
  const travel = v.loop === false ? Math.min(1, Math.max(0, (frame - lastAt) / period)) : Math.max(0, (frame - lastAt) / period) % 1;
  const d = travel * perim;
  const pos = d < W ? [d, 0] : d < W + H ? [W, d - W] : d < 2 * W + H ? [W - (d - W - H), H] : [0, H - (d - 2 * W - H)];
  return (
    <div>
      <div style={{ position: "relative", width: W, height: H }}>
        <svg width={W} height={H} style={{ position: "absolute", overflow: "visible" }}>
          <rect x={1} y={1} width={W - 2} height={H - 2} fill="none" stroke={alpha(p.accent, 0.35)} strokeWidth={2}
            strokeDasharray={perim} strokeDashoffset={perim * (1 - boxOn)} />
          {frame > lastAt && <rect x={pos[0] - 9} y={pos[1] - 9} width={18} height={18} fill={p.accent} />}
          {steps.slice(1).map((_, i) =>
            portrait ? (
              <line key={i} x1={24} x2={W - 24} y1={rowH * (i + 1)} y2={rowH * (i + 1)} stroke={p.line} strokeWidth={1.5} opacity={boxOn} />
            ) : (
              <line key={i} x1={colW * (i + 1)} x2={colW * (i + 1)} y1={24} y2={H - 24} stroke={p.line} strokeWidth={1.5} opacity={boxOn} />
            ),
          )}
        </svg>
        <div style={{ display: "flex", flexDirection: portrait ? "column" : "row", position: "absolute", inset: 0 }}>
          {steps.map((s, i) => {
            const sAt = stepAt(s, i);
            // the stage currently being visited glows
            const visiting = frame > lastAt && (portrait ? pos[0] === W && Math.floor((pos[1] / H) * n) === i : Math.floor((pos[0] / W) * n) === i && pos[1] === 0);
            return (
              <div key={i} style={{ ...(portrait ? { height: rowH, padding: "0 36px", display: "flex", flexDirection: "column", justifyContent: "center" } : { width: colW, padding: "40px 36px" }), boxSizing: "border-box", ...enter(frame, sAt, 14, 8) }}>
                {s.label && <div style={{ fontFamily: MONO, fontSize: 21, color: p.accent, marginBottom: portrait ? 8 : 12 }}>{s.label}</div>}
                <div style={{ fontFamily: SANS, fontSize: portrait ? 36 : n > 4 ? 28 : 34, color: visiting ? p.accent : p.text, lineHeight: 1.3, fontWeight: 500 }}>{s.text}</div>
              </div>
            );
          })}
        </div>
      </div>
      {v.note && <div style={{ marginTop: 18, ...enter(frame, lastAt) }}><Mono size={22}>{v.note}</Mono></div>}
    </div>
  );
}

/** Paths growing across a dot grid (many independent workers / trails / connections).
 * events: [{at, label, color}] pop a marked node; sweep: {at, label} runs a scan line across. */
export function Network({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const at = cueFrame(scene, v.at ?? 0);
  const seed = v.seed ?? 7;
  // Vertical: the grid takes the full width and the side value goes under it.
  const { portrait } = useLayout();
  const side = v.side as { label: string; value: string | number; at?: number | string } | undefined;
  const W = portrait ? box.w : Math.min(box.w, v.width ?? box.w * 0.72);
  const H = portrait ? Math.min(box.h - (side ? 150 : 60), v.vertical?.height ?? 560) : Math.min(box.h - 40, v.height ?? 360);
  const g = v.grid ?? 34;
  const cols = Math.floor(W / g);
  const rows = Math.floor(H / g);
  const nPaths = v.paths ?? 14;
  const growDur = v.growDur ?? Math.max(60, (scene.dur - at) * 0.6);
  // Each path: a random walk of axis-aligned segments.
  const paths = Array.from({ length: nPaths }, (_, k) => {
    let x = Math.floor(rand(seed + k * 13) * cols);
    let y = Math.floor(rand(seed + k * 29) * rows);
    const pts: [number, number][] = [[x, y]];
    for (let s = 0; s < 9; s++) {
      const horiz = s % 2 === 0;
      const len = 1 + Math.floor(rand(seed + k * 101 + s * 7) * 6);
      const dir = rand(seed + k * 57 + s * 3) > 0.5 ? 1 : -1;
      if (horiz) x = Math.max(0, Math.min(cols - 1, x + dir * len));
      else y = Math.max(0, Math.min(rows - 1, y + dir * len));
      pts.push([x, y]);
    }
    return { pts, start: at + rand(seed + k * 5) * growDur * 0.6 };
  });
  const events: { at?: number | string; label: string; color?: string; x?: number; y?: number }[] = v.events ?? [];
  const sweep = v.sweep as { at?: number | string; label?: string } | undefined;
  const sweepAt = sweep ? cueFrame(scene, sweep.at ?? 1) : 0;
  const sweepX = sweep ? interpolate(frame, [sweepAt, sweepAt + 70], [0, W], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_IN_OUT }) : -1;
  return (
    <div style={{ display: "flex", flexDirection: portrait ? "column" : "row", gap: portrait ? 30 : 50, alignItems: "flex-start" }}>
      <div>
        <svg width={W} height={H}>
          {Array.from({ length: cols * rows }, (_, k) => (
            <circle key={k} cx={(k % cols) * g + g / 2} cy={Math.floor(k / cols) * g + g / 2} r={1.6} fill={p.faint} opacity={prog(frame, at - 10, 12)} />
          ))}
          {paths.map((pa, k) => {
            const t = prog(frame, pa.start, growDur * 0.5, EASE_IN_OUT);
            const segs = pa.pts.length - 1;
            const shown = t * segs;
            const pts = pa.pts.slice(0, Math.floor(shown) + 1).map(([x, y]) => [x * g + g / 2, y * g + g / 2]);
            const fi = Math.floor(shown);
            if (fi < segs) {
              const [ax, ay] = pa.pts[fi];
              const [bx, by] = pa.pts[fi + 1];
              const f = shown - fi;
              pts.push([(ax + (bx - ax) * f) * g + g / 2, (ay + (by - ay) * f) * g + g / 2]);
            }
            if (t <= 0) return null;
            const head = pts[pts.length - 1];
            return (
              <g key={k}>
                <polyline points={pts.map((q) => q.join(",")).join(" ")} fill="none" stroke={alpha(p.accent, 0.55)} strokeWidth={2} />
                <rect x={head[0] - 5} y={head[1] - 5} width={10} height={10} fill={p.accent} />
              </g>
            );
          })}
          {events.map((e, k) => {
            const eAt = cueFrame(scene, e.at ?? 1);
            const o = prog(frame, eAt, 10);
            const ex = (e.x ?? 0.55) * W;
            const ey = (e.y ?? 0.45) * H;
            const col = resolveColor(p, e.color ?? "warn");
            return (
              <g key={k} opacity={o}>
                <rect x={ex - 9} y={ey - 9} width={18} height={18} fill={col} />
                <text x={ex + 18} y={ey + 7} fill={col} fontFamily={MONO} fontSize={21}>{e.label}</text>
              </g>
            );
          })}
          {sweep && frame >= sweepAt && (
            <g>
              <line x1={sweepX} x2={sweepX} y1={0} y2={H} stroke={p.text} strokeWidth={2} opacity={0.8} />
            </g>
          )}
        </svg>
        {sweep?.label && <div style={{ marginTop: 12, ...enter(frame, sweepAt) }}><Mono size={21}>{sweep.label}</Mono></div>}
      </div>
      {side && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, ...enter(frame, cueFrame(scene, side.at ?? 1)) }}>
          <Mono size={22}>{side.label}</Mono>
          <span style={{ fontFamily: MONO, fontSize: 60, color: p.accent }}>{side.value}</span>
        </div>
      )}
    </div>
  );
}
