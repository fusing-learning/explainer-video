import React from "react";
import { useCurrentFrame } from "remotion";
import { enter } from "../lib/anim";
import { MONO, SANS, usePalette } from "../lib/theme";
import { Mono } from "../lib/ui";
import type { Box } from "../lib/ui";
import type { Visual } from "../lib/types";

/** Closing card: what this was based on, and how much reading time it replaced. */
export function Outro({ v, box }: { v: Visual; box: Box }) {
  const p = usePalette();
  const frame = useCurrentFrame();
  const where = v.handle && v.site ? `${v.handle} on ${v.site}` : v.handle || v.site;
  const by = [v.author, where].filter(Boolean).join(", ");
  return (
    <div style={{ paddingTop: v.top ?? 250 }}>
      <div style={{ ...enter(frame, 4) }}>
        <Mono size={24}>source</Mono>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 56, fontWeight: 500, color: p.text, marginTop: 14, maxWidth: Math.min(1500, box.w), lineHeight: 1.2, ...enter(frame, 8) }}>{v.title}</div>
      {by && <div style={{ fontFamily: MONO, fontSize: 26, color: p.muted, marginTop: 18, ...enter(frame, 14) }}>by {by}</div>}
      {v.saved && (
        <div style={{ fontFamily: MONO, fontSize: 24, color: p.accent, marginTop: 56, ...enter(frame, 22) }}>{v.saved}</div>
      )}
    </div>
  );
}
