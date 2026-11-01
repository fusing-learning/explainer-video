import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE, formatNumber, prog } from "./anim";
import { MONO, SANS, resolveColor, usePalette } from "./theme";
import type { Color } from "./types";

export interface Box {
  w: number;
  h: number;
}

export function Mono({ children, size = 22, color, style }: { children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }) {
  const p = usePalette();
  return <span style={{ fontFamily: MONO, fontSize: size, color: color ?? p.muted, letterSpacing: "0.01em", ...style }}>{children}</span>;
}

export function Sans({ children, size = 34, color, weight = 500, style }: { children: React.ReactNode; size?: number; color?: string; weight?: number; style?: React.CSSProperties }) {
  const p = usePalette();
  return <span style={{ fontFamily: SANS, fontSize: size, color: color ?? p.text, fontWeight: weight, ...style }}>{children}</span>;
}

/** Splits "$3.1m" into prefix "$", 3.1 (1 decimal), suffix "m" so the number part can count up. */
export function splitNumber(v: string | number): { prefix: string; num: number | null; decimals: number; suffix: string; sep: boolean } {
  if (typeof v === "number") {
    const d = Number.isInteger(v) ? 0 : Math.min(2, (String(v).split(".")[1] ?? "").length);
    return { prefix: "", num: v, decimals: d, suffix: "", sep: Math.abs(v) >= 1000 };
  }
  const m = /^([^0-9-]*)(-?[0-9][0-9,]*(?:\.[0-9]+)?)(.*)$/.exec(v);
  if (!m) return { prefix: v, num: null, decimals: 0, suffix: "", sep: false };
  // "SEV-0": a hyphen right after letters is part of the label, not a minus sign.
  if (m[2].startsWith("-") && /[A-Za-z]$/.test(m[1])) {
    m[1] += "-";
    m[2] = m[2].slice(1);
  }
  const raw = m[2];
  const num = parseFloat(raw.replace(/,/g, ""));
  const decimals = (raw.split(".")[1] ?? "").length;
  return { prefix: m[1], num, decimals, suffix: m[3], sep: raw.includes(",") };
}

/** A number that counts up from `from` when `start` is reached. Non-numeric strings type in instead. */
export function CountUp({ value, from = 0, start, dur = 36, prefix = "", suffix = "", decimals, style, progress }: {
  value: number | string;
  from?: number;
  start: number;
  dur?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  style?: React.CSSProperties;
  /** 0..1 override, e.g. to follow a chart's sweep instead of a fixed duration */
  progress?: number;
}) {
  const frame = useCurrentFrame();
  const sp = splitNumber(value);
  if (sp.num === null) {
    const n = Math.round(interpolate(frame, [start, start + Math.max(8, String(value).length * 2)], [0, String(value).length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
    return <span style={style}>{prefix}{String(value).slice(0, n)}{suffix}</span>;
  }
  const t = progress ?? prog(frame, start, dur, EASE);
  const d = decimals ?? sp.decimals;
  const cur = from + (sp.num - from) * t;
  return (
    <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      {prefix}
      {sp.prefix}
      {formatNumber(t >= 1 ? sp.num : cur, d, sp.sep || Math.abs(sp.num) >= 1000)}
      {sp.suffix}
      {suffix}
    </span>
  );
}

export function Legend({ items, at }: { items: { label: string; color?: Color }[]; at?: number }) {
  const p = usePalette();
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: 26, rowGap: 8, opacity: at === undefined ? 1 : prog(frame, at, 14) }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
          <div style={{ width: 14, height: 14, background: resolveColor(p, it.color ?? (["accent", "accent2", "accent3"][i] as Color)) }} />
          <Mono size={21}>{it.label}</Mono>
        </div>
      ))}
    </div>
  );
}

export function Panel({ children, style, accent }: { children: React.ReactNode; style?: React.CSSProperties; accent?: string }) {
  const p = usePalette();
  return (
    <div
      style={{
        background: p.panel,
        borderLeft: accent ? `5px solid ${accent}` : undefined,
        padding: "30px 36px",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
