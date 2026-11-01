import React, { useMemo } from "react";
import { AbsoluteFill, Html5Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { SceneContext, enter } from "./lib/anim";
import { MONO, PaletteContext, SANS, makePalette, oriented, useLayout, usePalette } from "./lib/theme";
import type { Scene, Timeline } from "./lib/types";
import { VisualView } from "./visuals";

const FADE = 10;
const CENTERED = new Set(["text", "quote", "takeaway", "points", "compare", "cards", "table", "chips", "flow"]);

function SceneFrame({ scene }: { scene: Scene }) {
  const p = usePalette();
  const L = useLayout();
  const frame = useCurrentFrame();
  const out = interpolate(frame, [scene.dur - FADE, scene.dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const inn = interpolate(frame, [0, FADE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hasTitle = Boolean(scene.title);
  const top = hasTitle ? (scene.subtitle ? L.VIS_TOP + 6 : L.VIS_TOP - 36) : L.TOP + 20;
  const box = { w: L.W - L.PAD * 2, h: L.VIS_BOTTOM - top };
  const v = oriented(scene.visual, L.portrait);
  const title = hasTitle && (
    <div style={{ width: box.w, ...enter(frame, 0, 14, 6) }}>
      <div style={{ fontFamily: SANS, fontSize: 40, fontWeight: 500, color: p.text }}>{scene.title}</div>
      {scene.subtitle && <div style={{ fontFamily: MONO, fontSize: 24, color: p.muted, marginTop: 10 }}>{scene.subtitle}</div>}
    </div>
  );
  // Vertical: title and visual sit together in the middle of the space above the captions.
  if (L.portrait) {
    return (
      <AbsoluteFill style={{ opacity: Math.min(out, inn) }}>
        <div style={{ position: "absolute", left: L.PAD, top: L.TOP, width: box.w, height: L.VIS_BOTTOM - L.TOP, display: "flex", flexDirection: "column", justifyContent: "safe center" }}>
          {title && <div style={{ marginBottom: 50 }}>{title}</div>}
          <VisualView v={{ ...v, top: v.top ?? 0 }} box={box} />
        </div>
      </AbsoluteFill>
    );
  }
  // Word-led visuals sit in the middle of the frame; data visuals hang from the title like a chart.
  const centered = v.valign
    ? v.valign === "center"
    : (CENTERED.has(v.type) && !(v.type === "chips" && v.swarm)) || (v.type === "stat" && !v.chart);
  return (
    <AbsoluteFill style={{ opacity: Math.min(out, inn) }}>
      {title && <div style={{ position: "absolute", left: L.PAD, top: L.TOP }}>{title}</div>}
      <div style={{ position: "absolute", left: L.PAD, top, width: box.w, height: box.h, display: "flex", flexDirection: "column", justifyContent: centered ? "center" : "flex-start", paddingBottom: centered ? 40 : 0, boxSizing: "border-box" }}>
        <VisualView v={centered ? { ...v, top: v.top ?? 0 } : v} box={box} />
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
  const L = useLayout();
  const frame = useCurrentFrame();
  const cur = caps.find((c) => frame >= c.from && frame < c.to);
  if (!cur) return null;
  const o = interpolate(frame, [cur.from, cur.from + 5, cur.to - 5, cur.to], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: L.PAD, top: L.CAPTION_TOP, width: L.CAPTION_W, fontFamily: SANS, fontSize: 44, fontWeight: 500, lineHeight: 1.3, color: p.text, opacity: o }}>
      {cur.text}
    </div>
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
      </AbsoluteFill>
    </PaletteContext.Provider>
  );
};
