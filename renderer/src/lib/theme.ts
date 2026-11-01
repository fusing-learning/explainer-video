import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { createContext, useContext } from "react";
import type { Color } from "./types";

const geist = loadGeist("normal", { weights: ["400", "500", "600"], subsets: ["latin", "latin-ext"] });
const geistMono = loadGeistMono("normal", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] });

export const SANS = geist.fontFamily;
export const MONO = geistMono.fontFamily;

export const W = 1920;
export const H = 1080;
export const PAD = 120; // left/right margin
export const TOP = 96; // scene title baseline area
export const VIS_TOP = 236; // where visuals start when a scene has a title
export const VIS_BOTTOM = 800; // visuals must stay above the caption band
export const CAPTION_TOP = 858;

export interface Palette {
  bg: string;
  panel: string;
  text: string;
  muted: string;
  faint: string;
  line: string;
  accent: string;
  accent2: string;
  accent3: string;
  warn: string;
  amber: string;
  blue: string;
  violet: string;
}

export const DEFAULT_PALETTE: Palette = {
  bg: "#0a0b0a",
  panel: "#111312",
  text: "#ececec",
  muted: "#8b918c",
  faint: "#2a2e2b",
  line: "#1d211e",
  accent: "#4ade80",
  accent2: "#2f8f55",
  accent3: "#1f5236",
  warn: "#f2735f",
  amber: "#f8cb93",
  blue: "#7cc4fa",
  violet: "#b69cff",
};

export const PaletteContext = createContext<Palette>(DEFAULT_PALETTE);
export const usePalette = () => useContext(PaletteContext);

export function makePalette(theme?: { accent?: string; accent2?: string; accent3?: string }): Palette {
  if (!theme?.accent) return DEFAULT_PALETTE;
  const a = theme.accent;
  return {
    ...DEFAULT_PALETTE,
    accent: a,
    accent2: theme.accent2 ?? mix(a, DEFAULT_PALETTE.bg, 0.4),
    accent3: theme.accent3 ?? mix(a, DEFAULT_PALETTE.bg, 0.68),
  };
}

export function resolveColor(p: Palette, c: Color | undefined, fallback: keyof Palette = "accent"): string {
  if (!c) return p[fallback];
  if (c in p) return p[c as keyof Palette];
  return c;
}

export function mix(hexA: string, hexB: string, t: number): string {
  const pa = parse(hexA);
  const pb = parse(hexB);
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function alpha(hex: string, a: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function parse(hex: string): number[] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
}
