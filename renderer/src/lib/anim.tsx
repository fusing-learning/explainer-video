import React, { createContext, useContext } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Cue, Scene } from "./types";

export const SceneContext = createContext<Scene | null>(null);

export function useScene(): Scene {
  const s = useContext(SceneContext);
  if (!s) throw new Error("useScene outside a scene");
  return s;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%$.]+/g, "");

/** Frame (relative to scene start) at which a cue fires. */
export function cueFrame(scene: Scene, cue: Cue | undefined, fallback = 0): number {
  const lines = scene.lines;
  const first = lines[0]?.start ?? 6;
  if (cue === undefined || cue === null) return fallback === 0 ? first : fallback;
  if (typeof cue === "number") {
    if (!lines.length) return 6 + cue * 45;
    if (cue >= lines.length) return lines[lines.length - 1].end;
    const i = Math.max(0, Math.floor(cue));
    const f = cue - i;
    const l = lines[i];
    return Math.round(l.start + f * (l.end - l.start));
  }
  const m = /^(?:word:)?(.+)$/.exec(String(cue));
  if (m) {
    const target = norm(m[1]);
    for (const l of lines) for (const w of l.words ?? []) if (norm(w.w).startsWith(target)) return w.s;
    // Numbers may be transcribed differently ("77,000" vs "seventy-seven thousand"); fall back by line text.
    for (const l of lines) if (norm(l.text).includes(target)) return l.start;
  }
  return first;
}

export function useCue(cue: Cue | undefined, fallback = 0): number {
  return cueFrame(useScene(), cue, fallback);
}

export const EASE = Easing.bezier(0.22, 1, 0.36, 1); // easeOutQuint-ish
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

/** 0..1 progress of an animation starting at `start` lasting `dur` frames. */
export function prog(frame: number, start: number, dur = 18, ease = EASE): number {
  return interpolate(frame, [start, start + Math.max(1, dur)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
}

/** Fade + slight rise, the default way things enter. */
export function enter(frame: number, start: number, dur = 16, dist = 14): React.CSSProperties {
  const p = prog(frame, start, dur);
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
}

export function Enter({ at, children, style, dist }: { at: number; children: React.ReactNode; style?: React.CSSProperties; dist?: number }) {
  const frame = useCurrentFrame();
  return <div style={{ ...style, ...enter(frame, at, 16, dist) }}>{children}</div>;
}

/** Deterministic pseudo-random in [0,1). */
export function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function formatNumber(v: number, decimals = 0, sep = true): string {
  const s = v.toFixed(decimals);
  if (!sep) return s;
  const [i, d] = s.split(".");
  const withSep = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d ? `${withSep}.${d}` : withSep;
}

export function useFps() {
  return useVideoConfig().fps;
}
