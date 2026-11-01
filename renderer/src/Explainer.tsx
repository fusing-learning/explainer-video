import React, { useMemo } from "react";
import { AbsoluteFill, Html5Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { SceneContext, enter } from "./lib/anim";
import { CAPTION_TOP, H, MONO, PAD, PaletteContext, SANS, TOP, VIS_BOTTOM, VIS_TOP, W, makePalette, usePalette } from "./lib/theme";
import type { Scene, Timeline } from "./lib/types";
import { VisualView } from "./visuals";

const FADE = 10;
const CENTERED = new Set(["text", "quote", "takeaway", "points", "compare", "cards", "table", "chips", "flow"]);

function SceneFrame({ scene }: { scene: Scene }) {
  const p = usePalette();
  const frame = useCurrentFrame();
  const out = interpolate(frame, [scene.dur - FADE, scene.dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const inn = interpolate(frame, [0, FADE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hasTitle = Boolean(scene.title);
  const top = hasTitle ? (scene.subtitle ? VIS_TOP + 6 : VIS_TOP - 36) : TOP + 20;
  const box = { w: W - PAD * 2, h: VIS_BOTTOM - top };
  // Word-led visuals sit in the middle of the frame; data visuals hang from the title like a chart.
  const v = scene.visual;
  const centered = v.valign
    ? v.valign === "center"
    : (CENTERED.has(v.type) && !(v.type === "chips" && v.swarm)) || (v.type === "stat" && !v.chart);
  return (
    <AbsoluteFill style={{ opacity: Math.min(out, inn) }}>
      {hasTitle && (
        <div style={{ position: "absolute", left: PAD, top: TOP, ...enter(frame, 0, 14, 6) }}>
          <div style={{ fontFamily: SANS, fontSize: 40, fontWeight: 500, color: p.text }}>{scene.title}</div>
          {scene.subtitle && <div style={{ fontFamily: MONO, fontSize: 24, color: p.muted, marginTop: 10 }}>{scene.subtitle}</div>}
        </div>
      )}
      <div style={{ position: "absolute", left: PAD, top, width: box.w, height: box.h, display: "flex", flexDirection: "column", justifyContent: centered ? "center" : "flex-start", paddingBottom: centered ? 40 : 0, boxSizing: "border-box" }}>
        <VisualView v={centered ? { ...scene.visual, top: scene.visual.top ?? 0 } : scene.visual} box={box} />
      </div>
    </AbsoluteFill>
  );
}

interface Cap {
  text: string;
  from: number;
  to: number;
}

function Captions({ caps }: { caps: Cap[] }) {
  const p = usePalette();
  const frame = useCurrentFrame();
  const cur = caps.find((c) => frame >= c.from && frame < c.to);
  if (!cur) return null;
  const o = interpolate(frame, [cur.from, cur.from + 5, cur.to - 5, cur.to], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: PAD, top: CAPTION_TOP, width: 1320, fontFamily: SANS, fontSize: 44, fontWeight: 500, lineHeight: 1.3, color: p.text, opacity: o }}>
      {cur.text}
    </div>
  );
}

/** Thin progress strip at the bottom, drawn from the narration's loudness. */
function ProgressWave({ env, step, total }: { env: number[]; step: number; total: number }) {
  const p = usePalette();
  const frame = useCurrentFrame();
  const width = W - PAD * 2;
  const n = env.length || 1;
  const bw = width / n;
  const played = frame / step;
  return (
    <svg width={width} height={34} style={{ position: "absolute", left: PAD, top: H - 54 }}>
      <line x1={0} x2={width} y1={33} y2={33} stroke={p.line} strokeWidth={2} />
      <line x1={0} x2={Math.min(width, (frame / total) * width)} y1={33} y2={33} stroke={p.accent3} strokeWidth={2} />
      {env.map((e, i) =>
        i <= played && e > 0.02 ? <rect key={i} x={i * bw} y={33 - e * 30} width={Math.max(1, bw * 0.6)} height={e * 30} fill={p.accent} opacity={0.35 + 0.5 * e} /> : null,
      )}
    </svg>
  );
}

export const Explainer: React.FC<Timeline> = (t) => {
  const palette = useMemo(() => makePalette(t.theme), [t.theme]);
  const caps = useMemo(() => {
    const out: Cap[] = [];
    for (const s of t.scenes) {
      s.lines.forEach((l, i) => {
        const next = s.lines[i + 1];
        const from = s.from + l.start;
        const to = next ? s.from + next.start : Math.min(s.from + s.dur - 4, s.from + l.end + 18);
        if (l.text) out.push({ text: l.text, from, to: Math.max(to, from + 8) });
      });
    }
    return out;
  }, [t.scenes]);
  return (
    <PaletteContext.Provider value={palette}>
      <AbsoluteFill style={{ background: palette.bg }}>
        {t.audio && <Html5Audio src={staticFile(t.audio)} />}
        {t.scenes.map((s) => (
          <Sequence key={s.id} from={s.from} durationInFrames={Math.max(1, s.dur)} name={s.id} layout="none">
            <SceneContext.Provider value={s}>
              <SceneFrame scene={s} />
            </SceneContext.Provider>
          </Sequence>
        ))}
        {t.captions !== false && <Captions caps={caps} />}
        {t.envelope?.length > 0 && <ProgressWave env={t.envelope} step={t.envelopeStep} total={t.durationInFrames} />}
      </AbsoluteFill>
    </PaletteContext.Provider>
  );
};
