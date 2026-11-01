import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { EASE_IN_OUT, cueFrame, enter, prog, useScene } from "../lib/anim";
import { MONO, SANS, alpha, resolveColor, useLayout, usePalette } from "../lib/theme";
import { Box, Mono, Panel } from "../lib/ui";
import type { Visual } from "../lib/types";

type Props = { v: Visual; box: Box };

/** Text with *accent* spans. */
export function Rich({ text, accent }: { text: string; accent?: string }) {
  const p = usePalette();
  const parts = String(text ?? "").split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((s, i) =>
        s.startsWith("*") && s.endsWith("*") && s.length > 2 ? (
          <span key={i} style={{ color: accent ?? p.accent }}>{s.slice(1, -1)}</span>
        ) : (
          <React.Fragment key={i}>{s}</React.Fragment>
        ),
      )}
    </>
  );
}

const monoSize = (chars: number, width: number, max: number) => Math.min(max, Math.floor(width / (Math.max(chars, 1) * 0.6)));

/** Changing sub-line: [{text, at}] shows the latest one whose cue has passed. */
function Swap({ items, style }: { items: { text: string; at?: number | string }[]; style?: React.CSSProperties }) {
  const frame = useCurrentFrame();
  const scene = useScene();
  const starts = items.map((it, i) => cueFrame(scene, it.at ?? i));
  let cur = -1;
  starts.forEach((s, i) => {
    if (frame >= s) cur = i;
  });
  if (cur < 0) return null;
  return <div style={{ ...style, ...enter(frame, starts[cur], 14, 6) }}>{items[cur].text}</div>;
}

export function Headline({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const lines: { text: string; color?: string; at?: number | string }[] = (v.lines ?? [v.text ?? ""]).map((l: unknown) =>
    typeof l === "string" ? { text: l } : (l as { text: string }),
  );
  const longest = Math.max(...lines.map((l) => l.text.length));
  // Vertical: long lines wrap at ~14 characters rather than shrinking to fit the narrow frame.
  const { portrait } = useLayout();
  const longestWord = Math.max(...lines.flatMap((l) => l.text.split(/\s+/).map((w) => w.length)));
  const size = v.size ?? monoSize(portrait ? Math.max(longestWord, Math.min(longest, 14)) : longest, box.w, 112);
  const subs = v.sub === undefined ? [] : Array.isArray(v.sub) ? v.sub : [{ text: v.sub, at: v.subAt ?? 0 }];
  return (
    <div style={{ paddingTop: v.top ?? 40 }}>
      {lines.map((l, i) => {
        const at = cueFrame(scene, l.at ?? (i === 0 ? 0 : Math.min(i, scene.lines.length - 1)));
        return (
          <div
            key={i}
            style={{
              fontFamily: MONO,
              fontSize: size,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              color: resolveColor(p, l.color ?? (i === 0 ? "text" : "accent")),
              ...enter(frame, at - 4, 18, 18),
            }}
          >
            {l.text}
          </div>
        );
      })}
      {subs.length > 0 && <Swap items={subs} style={{ fontFamily: MONO, fontSize: 28, color: p.muted, marginTop: 34 }} />}
    </div>
  );
}

export function TextStatement({ v, box }: Props) {
  const p = usePalette();
  const frame = useCurrentFrame();
  const at = cueFrame(useScene(), v.at);
  const size = { md: 52, lg: 68, xl: 88 }[(v.size as string) ?? "lg"] ?? 68;
  return (
    <div style={{ paddingTop: v.top ?? 60, maxWidth: Math.min(1500, box.w), ...enter(frame, at - 4, 18, 18) }}>
      {v.kicker && <div style={{ fontFamily: MONO, fontSize: 26, color: p.muted, marginBottom: 26 }}>{v.kicker}</div>}
      <div style={{ fontFamily: SANS, fontSize: size, fontWeight: 500, lineHeight: 1.2, color: resolveColor(p, v.color, "text"), letterSpacing: "-0.01em" }}>
        <Rich text={v.text} />
      </div>
    </div>
  );
}

export function Quote({ v }: Props) {
  const p = usePalette();
  const frame = useCurrentFrame();
  const at = cueFrame(useScene(), v.at);
  const len = String(v.text ?? "").length;
  const size = len > 160 ? 44 : len > 90 ? 52 : 62;
  return (
    <div style={{ paddingTop: 30, display: "flex", gap: 40, ...enter(frame, at - 4, 18, 16) }}>
      <div style={{ width: 6, background: p.accent, flexShrink: 0 }} />
      <div style={{ maxWidth: 1450 }}>
        <div style={{ fontFamily: SANS, fontSize: size, lineHeight: 1.3, color: p.text, fontWeight: 500 }}>
          “<Rich text={v.text} />”
        </div>
        {v.by && <div style={{ fontFamily: MONO, fontSize: 26, color: p.muted, marginTop: 30, ...enter(frame, at + 14) }}>— {v.by}</div>}
      </div>
    </div>
  );
}

export function Takeaway({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const kAt = cueFrame(scene, v.kickerAt ?? 0);
  const at = cueFrame(scene, v.at ?? 0);
  const subAt = cueFrame(scene, v.subAt ?? Math.min(1, scene.lines.length - 1));
  const text = String(v.text ?? "");
  const size = v.size ?? monoSize(text.length + 2, box.w - 140, 116);
  const icon = v.icon ?? "circle";
  const drawn = prog(frame, at, 30, EASE_IN_OUT);
  const r = size * 0.36;
  const sub: string[] = Array.isArray(v.sub) ? v.sub : v.sub ? [v.sub] : [];
  return (
    <div style={{ paddingTop: v.top ?? 50 }}>
      {v.kicker && <div style={{ fontFamily: SANS, fontSize: 42, color: p.muted, marginBottom: 34, ...enter(frame, kAt - 6) }}>{v.kicker}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: size * 0.32, ...enter(frame, at - 4, 18, 10) }}>
        {icon !== "none" && (
          <svg width={r * 2 + 10} height={r * 2 + 10} style={{ flexShrink: 0 }}>
            {icon === "circle" && (
              <circle cx={r + 5} cy={r + 5} r={r} fill="none" stroke={p.accent} strokeWidth={size * 0.07}
                strokeDasharray={2 * Math.PI * r} strokeDashoffset={2 * Math.PI * r * (1 - drawn)} transform={`rotate(-90 ${r + 5} ${r + 5})`} />
            )}
            {icon === "check" && (
              <polyline points={`${r * 0.3},${r * 1.05} ${r * 0.85},${r * 1.6} ${r * 1.8},${r * 0.45}`} fill="none" stroke={p.accent} strokeWidth={size * 0.08}
                strokeLinecap="square" strokeDasharray={r * 3} strokeDashoffset={r * 3 * (1 - drawn)} transform="translate(5 5)" />
            )}
            {icon === "arrow" && (
              <path d={`M5 ${r + 5} H ${2 * r} M ${r + 5} 10 L ${2 * r + 5} ${r + 5} L ${r + 5} ${2 * r}`} fill="none" stroke={p.accent} strokeWidth={size * 0.07}
                strokeDasharray={r * 6} strokeDashoffset={r * 6 * (1 - drawn)} />
            )}
          </svg>
        )}
        <div style={{ fontFamily: MONO, fontSize: size, color: resolveColor(p, v.color), letterSpacing: "-0.02em", lineHeight: 1.1 }}>{text}</div>
      </div>
      {sub.length > 0 && (
        <div style={{ marginTop: 44, ...enter(frame, subAt - 4) }}>
          {sub.map((s, i) => (
            <div key={i} style={{ fontFamily: SANS, fontSize: 44, lineHeight: 1.35, color: p.text, fontWeight: 500 }}>{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Key ideas as a list (or grid); the newest item is bright, older ones settle back. */
export function Points({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const items: { title: string; text?: string; at?: number | string }[] = (v.items ?? []).map((it: unknown) =>
    typeof it === "string" ? { title: it } : it,
  );
  const { portrait } = useLayout();
  const cols = portrait ? v.vertical?.columns ?? 1 : v.columns ?? (items.length > 4 ? 2 : 1);
  const starts = items.map((it, i) => cueFrame(scene, it.at ?? Math.min(i, Math.max(0, scene.lines.length - 1))));
  let active = -1;
  starts.forEach((s, i) => frame >= s && (active = i));
  const focus = v.focus !== false;
  const titleSize = items.length > 4 || cols > 1 ? 40 : 48;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, columnGap: 70, rowGap: cols > 1 ? 44 : portrait && items.length > 4 ? 28 : 38, paddingTop: 16, width: box.w }}>
      {items.map((it, i) => {
        const dim = focus && active > i ? 0.45 : 1;
        return (
          <div key={i} style={{ display: "flex", gap: 30, ...enter(frame, starts[i] - 4), opacity: prog(frame, starts[i] - 4, 16) * dim }}>
            {v.numbered !== false && <div style={{ fontFamily: MONO, fontSize: 26, color: p.accent, paddingTop: titleSize * 0.28, minWidth: 44 }}>{String(i + 1).padStart(2, "0")}</div>}
            <div>
              <div style={{ fontFamily: SANS, fontSize: titleSize, fontWeight: 500, color: p.text, lineHeight: 1.2 }}><Rich text={it.title} /></div>
              {it.text && <div style={{ fontFamily: MONO, fontSize: 24, color: p.muted, marginTop: 12, lineHeight: 1.45, maxWidth: cols > 1 ? 720 : 1300 }}>{it.text}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Compare({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const sides = [v.left ?? {}, v.right ?? {}];
  const ats = [cueFrame(scene, v.leftAt ?? v.at ?? 0), cueFrame(scene, v.rightAt ?? Math.min(1, scene.lines.length - 1))];
  const colors = [resolveColor(p, sides[0].color ?? "muted"), resolveColor(p, sides[1].color ?? "accent")];
  // Vertical: the panels stack, one above the other.
  const { portrait } = useLayout();
  const w = portrait ? box.w : (box.w - 120) / 2;
  return (
    <div style={{ display: "flex", flexDirection: portrait ? "column" : "row", gap: portrait ? 20 : 40, alignItems: "stretch", paddingTop: 10 }}>
      {sides.map((s, k) => (
        <React.Fragment key={k}>
          {k === 1 && (
            <div style={{ display: "flex", alignItems: "center", paddingLeft: portrait ? 36 : 0, fontFamily: MONO, fontSize: 30, color: p.muted, ...enter(frame, ats[1] - 8) }}>{v.vs ?? (portrait ? "↓" : "→")}</div>
          )}
          <Panel accent={colors[k]} style={{ width: w, ...enter(frame, ats[k] - 4) }}>
            <div style={{ fontFamily: MONO, fontSize: 46, color: colors[k], marginBottom: 8 }}>{s.title}</div>
            {s.sub && <div style={{ fontFamily: MONO, fontSize: 23, color: p.muted, marginBottom: 18 }}>{s.sub}</div>}
            {(s.items ?? []).map((it: string, i: number) => (
              <div key={i} style={{ fontFamily: SANS, fontSize: 35, color: k === 0 && v.dimLeft !== false ? alpha(p.text, 0.75) : p.text, lineHeight: 1.35, marginTop: 14, ...enter(frame, ats[k] + 6 + i * 5) }}>
                <Rich text={it} />
              </div>
            ))}
          </Panel>
        </React.Fragment>
      ))}
    </div>
  );
}

export function Cards({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const items = v.items ?? [];
  const n = Math.max(1, items.length);
  const { portrait } = useLayout();
  const w = portrait ? box.w : Math.min(820, (box.w - (n - 1) * 34) / n);
  return (
    <div style={{ display: "flex", flexDirection: portrait ? "column" : "row", gap: portrait ? 24 : 34, alignItems: "stretch" }}>
      {items.map((c: Record<string, unknown>, i: number) => {
        const at = cueFrame(scene, (c.at as number | string | undefined) ?? Math.min(i, scene.lines.length - 1));
        const col = resolveColor(p, c.color as string | undefined);
        const quotes = (c.quotes as string[] | undefined) ?? [];
        return (
          <Panel key={i} accent={col} style={{ width: w, ...enter(frame, at - 4) }}>
            <div style={{ fontFamily: MONO, fontSize: 46, color: col }}>{c.title as string}</div>
            {c.sub ? <div style={{ fontFamily: MONO, fontSize: 23, color: p.muted, marginTop: 8 }}>{c.sub as string}</div> : null}
            {c.body ? <div style={{ fontFamily: SANS, fontSize: n <= 2 ? 36 : 30, color: p.text, marginTop: 26, lineHeight: 1.35, fontWeight: 500 }}><Rich text={c.body as string} /></div> : null}
            {quotes.map((q, k) => (
              <div key={k} style={{ fontFamily: SANS, fontSize: n <= 2 ? 30 : 26, color: p.text, marginTop: k ? 16 : 26, lineHeight: 1.35, ...enter(frame, at + 8 + k * 8) }}>“<Rich text={q} />”</div>
            ))}
            {c.foot ? <div style={{ fontFamily: MONO, fontSize: 20, color: p.muted, marginTop: 22 }}>{c.foot as string}</div> : null}
          </Panel>
        );
      })}
    </div>
  );
}

export function Table({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const cols: string[] = v.columns ?? [];
  const rows: (string | number)[][] = v.rows ?? [];
  const at = cueFrame(scene, v.at ?? 0);
  const stagger = v.stagger ?? 8;
  const hl = new Set<number>([].concat(v.highlight ?? []));
  const rowAts: number[] = rows.map((_, i) => (v.rowAt?.[i] !== undefined ? cueFrame(scene, v.rowAt[i]) : at + i * stagger));
  const size = rows.length > 7 ? 28 : rows.length > 4 ? 34 : 40;
  return (
    <div style={{ width: Math.min(box.w, v.width ?? box.w), fontFamily: SANS }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length}, 1fr)`, borderBottom: `1px solid ${p.faint}`, paddingBottom: 14, ...enter(frame, at - 6) }}>
        {cols.map((c, i) => <Mono key={i} size={24}>{c}</Mono>)}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length}, 1fr)`, padding: `${rows.length > 6 ? 14 : 22}px 0`, borderBottom: `1px solid ${p.line}`, ...enter(frame, rowAts[i]) }}>
          {r.map((cell, k) => (
            <div key={k} style={{ fontSize: size, color: hl.has(i) ? p.accent : k === 0 ? p.text : alpha(p.text, 0.8), fontFamily: k === 0 ? SANS : MONO, fontWeight: k === 0 ? 500 : 400 }}>
              {String(cell)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A figure from the source: fits the box, drifts slowly, can zoom to a focus region at a cue. */
export function ImageVisual({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const at = cueFrame(scene, v.at ?? 0);
  const capH = v.caption ? 50 : 0;
  const h = box.h - capH;
  const focus = v.focus as [number, number, number] | undefined; // [cx, cy, scale] in 0..1 image coords
  const fAt = cueFrame(scene, v.focusAt ?? 1);
  const drift = interpolate(frame, [0, scene.dur], [1, 1.04]);
  const fz = focus ? prog(frame, fAt, 40, EASE_IN_OUT) : 0;
  const scale = drift * (1 + (focus ? (focus[2] - 1) * fz : 0));
  const ox = focus ? (0.5 - focus[0]) * 100 * fz : 0;
  const oy = focus ? (0.5 - focus[1]) * 100 * fz : 0;
  return (
    <div style={{ ...enter(frame, at - 6, 18, 10) }}>
      <div style={{ width: box.w, height: h, overflow: "hidden", background: v.bg === false ? undefined : p.panel, display: "flex", alignItems: "center", justifyContent: v.align === "left" ? "flex-start" : "center", borderRadius: 4 }}>
        <Img
          src={staticFile(v.src)}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: (v.fit as React.CSSProperties["objectFit"]) ?? "contain",
            transform: `scale(${scale}) translate(${ox}%, ${oy}%)`,
            transformOrigin: "center center",
          }}
        />
      </div>
      {v.caption && <div style={{ marginTop: 16 }}><Mono size={22}>{v.caption}</Mono></div>}
    </div>
  );
}
