import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE, EASE_IN_OUT, cueFrame, enter, formatNumber, prog, rand, useScene } from "../lib/anim";
import { MONO, alpha, oriented, resolveColor, useLayout, usePalette } from "../lib/theme";
import { Box, CountUp, Legend, Mono, splitNumber } from "../lib/ui";
import type { Scene, Visual } from "../lib/types";

type Props = { v: Visual; box: Box };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChartRenderer = (p: Props) => React.ReactElement | null;
let chartRegistry: Record<string, ChartRenderer> = {};
export function setChartRegistry(r: Record<string, ChartRenderer>) {
  chartRegistry = r;
}

/** Big number with an optional label line, note, and an embedded chart below or beside it. */
export function Stat({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const at = cueFrame(scene, v.at ?? 0);
  const color = resolveColor(p, v.color);
  const { portrait } = useLayout();
  const chart = v.chart ? oriented(v.chart as Visual, portrait) : undefined;
  // Vertical: a side chart goes below the number instead.
  const side = v.chartSide === "right" && !portrait;
  const cw = side ? v.chartWidth ?? Math.round(box.w * 0.42) : 0;
  // Shrink a long value to fit the width it has (Geist Mono glyphs are 0.6em wide).
  const sp = splitNumber(v.value ?? 0);
  const shown = sp.num === null ? String(v.value) : sp.prefix + formatNumber(sp.num, v.decimals ?? sp.decimals, sp.sep || Math.abs(sp.num) >= 1000) + sp.suffix;
  const chars = String(v.prefix ?? "").length + shown.length + String(v.suffix ?? "").length;
  const size = Math.min(v.size ?? 190, Math.floor((side ? box.w - cw - 40 : box.w) / (Math.max(1, chars) * 0.6)));
  // A total over a time series counts up in step with the sweep unless told otherwise.
  const followsChart = chart?.type === "series" && v.countUntil === undefined && v.countWithChart !== false;
  const belowAt = cueFrame(scene, v.belowAt ?? v.at ?? 0);
  const numberBlock = (
    <div>
      {v.label && <div style={{ fontFamily: MONO, fontSize: 26, color: p.muted, marginBottom: 6, ...enter(frame, at - 8) }}>{v.label}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 30, rowGap: 12, ...enter(frame, at - 6, 14, 8) }}>
        <div style={{ fontFamily: MONO, fontSize: size, lineHeight: 1, color, letterSpacing: "-0.03em" }}>
          <CountUp value={v.value ?? 0} from={v.from ?? 0} start={at} dur={v.countUntil !== undefined ? Math.max(20, cueFrame(scene, v.countUntil) - at) : v.countDur ?? 40}
            progress={followsChart ? seriesCumulative(scene, { ...chart, at: chart!.at ?? v.chartAt ?? v.at ?? 0 }, frame) : undefined} prefix={v.prefix ?? ""} suffix={v.suffix ?? ""} decimals={v.decimals} />
        </div>
        {v.note && <Mono size={26}>{v.note}</Mono>}
      </div>
      {v.below && (
        <div style={{ marginTop: 18, ...enter(frame, belowAt) }}>
          <Mono size={26} color={resolveColor(p, v.belowColor ?? "amber")}>{v.below}</Mono>
        </div>
      )}
      {v.legend && (
        <div style={{ marginTop: 22 }}>
          <Legend items={v.legend} at={cueFrame(scene, v.legendAt ?? v.chartAt ?? v.at ?? 0)} />
        </div>
      )}
    </div>
  );
  if (!chart) return numberBlock;
  const Chart = chartRegistry[chart.type];
  const chartV = { ...chart, at: chart.at ?? v.chartAt ?? v.at ?? 0 };
  const numH = size + (v.label ? 40 : 0) + (v.below ? 56 : 0) + (v.legend ? 50 : 0) + 40;
  if (side) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: box.w }}>
        {numberBlock}
        <div style={{ width: cw }}>{Chart ? <Chart v={chartV} box={{ w: cw, h: Math.min(box.h, v.chartHeight ?? box.h) }} /> : null}</div>
      </div>
    );
  }
  return (
    <div>
      {numberBlock}
      <div style={{ marginTop: 34 }}>{Chart ? <Chart v={chartV} box={{ w: Math.min(box.w, v.chartWidth ?? box.w), h: Math.max(140, box.h - numH) }} /> : null}</div>
    </div>
  );
}

/** Bar chart: simple, stacked, with optional dots (a second measure) above each bar. */
export function Bars({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const bars: { label?: string; value?: number; stack?: number[]; dot?: number | string; color?: string; at?: number | string; valueLabel?: string }[] = v.bars ?? [];
  const at = cueFrame(scene, v.at ?? 0);
  const stagger = v.stagger ?? 4;
  const hasDots = bars.some((b) => b.dot !== undefined);
  const W = Math.min(box.w, v.width ?? box.w);
  const n = Math.max(1, bars.length);
  const slot = W / n;
  // Labels too wide for their slot alternate between two rows.
  const staggerLabels = bars.some((b) => (b.label ?? "").length * 12 > slot - 8);
  const labelH = staggerLabels ? 64 : 40;
  const topPad = hasDots ? 70 : v.showValues ? 44 : 10;
  const legendH = v.legend ? 44 : 0;
  const noteH = v.note ? 44 : 0;
  const { portrait } = useLayout();
  const H = Math.min(v.height ?? (portrait ? 560 : 420), box.h - legendH - noteH);
  const chartH = H - labelH - topPad;
  const bw = Math.min(v.barWidth ?? 130, slot * 0.66);
  const totals = bars.map((b) => (b.stack ? b.stack.reduce((a, c) => a + c, 0) : b.value ?? 0));
  const max = v.max ?? Math.max(1, ...totals);
  const stackColors: string[] = (v.stackColors ?? ["accent", "accent2", "accent3", "amber"]).map((c: string) => resolveColor(p, c));
  const hl = v.highlight;
  return (
    <div>
      {v.legend && <div style={{ marginBottom: 16 }}><Legend items={v.legend} at={at} /></div>}
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        <line x1={0} x2={W} y1={topPad + chartH} y2={topPad + chartH} stroke={p.faint} strokeWidth={2} />
        {bars.map((b, i) => {
          const start = b.at !== undefined ? cueFrame(scene, b.at) : at + i * stagger;
          const t = prog(frame, start, 26, EASE);
          const x = slot * i + (slot - bw) / 2;
          const parts = b.stack ?? [b.value ?? 0];
          let y = topPad + chartH;
          const baseColor = b.color ? resolveColor(p, b.color) : hl !== undefined && hl !== i ? p.accent3 : stackColors[0];
          const rects = parts.map((val, k) => {
            const h = (val / max) * chartH * t;
            y -= h;
            const fill = parts.length > 1 ? stackColors[k % stackColors.length] : baseColor;
            return <rect key={k} x={x} y={y} width={bw} height={Math.max(0, h - (parts.length > 1 ? 2 : 0))} fill={fill} />;
          });
          const topY = topPad + chartH - (totals[i] / max) * chartH * t;
          const dotT = prog(frame, start + 14, 14);
          return (
            <g key={i}>
              {rects}
              {v.showValues && (
                <text x={x + bw / 2} y={topY - 14} fill={p.text} opacity={t} fontFamily={MONO} fontSize={22} textAnchor="middle">
                  {b.valueLabel ?? totals[i].toLocaleString("en-US")}
                </text>
              )}
              {b.dot !== undefined && (
                <g opacity={dotT}>
                  <circle cx={x + bw / 2} cy={topY - 26} r={9} fill={resolveColor(p, v.dotColor ?? "amber")} />
                  <text x={x + bw / 2} y={topY - 48} fill={p.text} fontFamily={MONO} fontSize={22} textAnchor="middle">{String(b.dot)}</text>
                </g>
              )}
              {b.label && (
                <text x={x + bw / 2} y={topPad + chartH + 32 + (staggerLabels && i % 2 ? 26 : 0)} fill={p.muted} fontFamily={MONO} fontSize={20} textAnchor="middle" opacity={prog(frame, at - 6, 12)}>
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {v.note && <div style={{ marginTop: 12, ...enter(frame, at + 20) }}><Mono size={22}>{v.note}</Mono></div>}
    </div>
  );
}

/** How far a series sweep has got: bars revealed (fractional) out of n. */
function seriesSweep(scene: Scene, v: Visual, frame: number) {
  const n = Math.max(1, (v.values ?? []).length);
  const at = cueFrame(scene, v.at ?? 0);
  const until = v.until !== undefined ? cueFrame(scene, v.until) : Math.max(at + 45, Math.round(at + (scene.dur - at) * 0.7));
  const reveal = interpolate(frame, [at, until], [0, n], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_IN_OUT });
  return { n, at, until, reveal };
}

/** Share of the series total that has been revealed, so a headline number can count along with the sweep. */
function seriesCumulative(scene: Scene, v: Visual, frame: number): number {
  const vals: number[] = v.values ?? [];
  const total = vals.map((x, i) => x + (v.values2?.[i] ?? 0));
  const sum = total.reduce((a, b) => a + b, 0) || 1;
  const { reveal } = seriesSweep(scene, v, frame);
  const whole = Math.floor(reveal);
  let acc = 0;
  for (let i = 0; i < Math.min(whole, total.length); i++) acc += total[i];
  if (whole < total.length) acc += total[whole] * (reveal - whole);
  return Math.min(1, acc / sum);
}

/** Dense time series (dozens to hundreds of values) revealed left-to-right like a sweep. */
export function Series({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const vals: number[] = v.values ?? [];
  const vals2: number[] | undefined = v.values2;
  const { n, at, until, reveal } = seriesSweep(scene, v, frame);
  const W = Math.min(box.w, v.width ?? box.w);
  const tickH = 36;
  const noteH = v.note ? 44 : 0;
  const legendH = v.legend ? 44 : 0;
  const { portrait } = useLayout();
  const H = Math.min(v.height ?? (portrait ? 520 : 380), box.h - noteH - legendH);
  const topPad = 40;
  const chartH = H - tickH - topPad;
  const total = vals.map((x, i) => x + (vals2?.[i] ?? 0));
  const max = v.max ?? Math.max(1, ...total);
  const step = W / n;
  const bw = Math.max(1.5, step * (v.style === "thin" ? 0.5 : 0.72));
  const c1 = resolveColor(p, v.color ?? "accent");
  const c2 = resolveColor(p, v.color2 ?? "accent2");
  let peakI = 0;
  total.forEach((x, i) => x > total[peakI] && (peakI = i));
  const markers: { i: number; label: string; color?: string; at?: number | string }[] = v.markers ?? [];
  // Skip tick labels that would run into the one before (dense ticks, narrow frame).
  let tickEnd = -Infinity;
  const ticks = ((v.ticks ?? []) as { i: number; label: string }[]).filter((t) => {
    const x = t.i * step;
    if (x < tickEnd) return false;
    tickEnd = x + t.label.length * 12 + 16;
    return true;
  });
  return (
    <div>
      {v.legend && <div style={{ marginBottom: 16 }}><Legend items={v.legend} at={at} /></div>}
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        <line x1={0} x2={W} y1={topPad + chartH} y2={topPad + chartH} stroke={p.faint} strokeWidth={2} />
        {vals.map((x, i) => {
          const vis = Math.max(0, Math.min(1, reveal - i));
          if (vis <= 0) return null;
          const h1 = (x / max) * chartH * vis;
          const h2 = ((vals2?.[i] ?? 0) / max) * chartH * vis;
          const base = topPad + chartH;
          return (
            <g key={i}>
              <rect x={i * step} y={base - h1} width={bw} height={h1} fill={c1} opacity={v.flat ? 1 : 0.55 + 0.45 * rand(i + 3)} />
              {h2 > 0 && <rect x={i * step} y={base - h1 - h2} width={bw} height={h2} fill={c2} />}
            </g>
          );
        })}
        {markers.map((m, k) => {
          const mAt = m.at !== undefined ? cueFrame(scene, m.at) : at;
          const shown = reveal >= m.i && frame >= mAt;
          const o = shown ? prog(frame, Math.max(mAt, at + ((until - at) * m.i) / n), 12) : 0;
          const x = m.i * step + bw / 2;
          const col = resolveColor(p, m.color ?? "accent");
          // markers close together get stacked labels so they don't collide
          const row = markers.slice(0, k).filter((o) => Math.abs(o.i - m.i) * step < 260).length;
          const ly = topPad + 10 + row * 28;
          return (
            <g key={k} opacity={o}>
              <line x1={x} x2={x} y1={topPad - 6} y2={topPad + chartH} stroke={col} strokeDasharray="3 5" strokeWidth={1.5} />
              <text x={x + 10} y={ly} fill={col} fontFamily={MONO} fontSize={21}>{m.label}</text>
            </g>
          );
        })}
        {v.peakLabel !== false && reveal > peakI + 1 && (
          <text x={Math.min(W - 10, peakI * step + bw)} y={topPad + chartH - (total[peakI] / max) * chartH - 14} fill={p.text} fontFamily={MONO} fontSize={22} textAnchor="end" opacity={prog(frame, at + ((until - at) * (peakI + 1)) / n, 10)}>
            {typeof v.peakLabel === "string" ? v.peakLabel : total[peakI].toLocaleString("en-US")}
          </text>
        )}
        {ticks.map((t, k) => (
          <text key={k} x={t.i * step} y={topPad + chartH + 30} fill={p.muted} fontFamily={MONO} fontSize={20} opacity={prog(frame, at - 6, 12)}>
            {t.label}
          </text>
        ))}
      </svg>
      {v.note && <div style={{ marginTop: 10, ...enter(frame, v.noteAt !== undefined ? cueFrame(scene, v.noteAt) : until) }}><Mono size={22}>{v.note}</Mono></div>}
    </div>
  );
}

/** Grid of squares (one per thing), filled in groups; phases can recolor it later. */
export function Waffle({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const total = Math.max(1, Math.min(4000, Math.round(v.total ?? 100)));
  const ratio = box.w / Math.max(1, box.h);
  const cols = v.cols ?? Math.max(5, Math.round(Math.sqrt(total * ratio)));
  const rows = Math.ceil(total / cols);
  const gap = v.gap ?? 3;
  const cell = Math.max(3, Math.min(v.cell ?? 40, Math.floor((box.w - gap * cols) / cols), Math.floor((box.h - (v.legend === false ? 0 : 50) - gap * rows) / rows)));
  type G = { count: number; color?: string; label?: string };
  const phases: { at: number; groups: G[] }[] = [
    { at: cueFrame(scene, v.at ?? 0), groups: v.groups ?? [{ count: total, color: v.color ?? "accent" }] },
    ...((v.phases ?? []) as { at?: number | string; groups: G[] }[]).map((ph) => ({ at: cueFrame(scene, ph.at ?? 1), groups: ph.groups })),
  ];
  const fillDur = v.fillDur ?? 40;
  const order = Array.from({ length: total }, (_, i) => i);
  if (v.order !== "sequential") order.sort((a, b) => rand(a + 11) - rand(b + 11));
  const rank = new Array(total);
  order.forEach((cellIdx, k) => (rank[cellIdx] = k));
  const colorOf = (groups: G[], idx: number): string | null => {
    let acc = 0;
    for (const g of groups) {
      acc += g.count;
      if (idx < acc) return resolveColor(p, g.color ?? "accent");
    }
    return null;
  };
  // Which phase applies to each cell: phase k takes over a cell once its own staggered moment passes.
  const legendGroups = (() => {
    let cur = phases[0].groups;
    phases.forEach((ph) => frame >= ph.at && (cur = ph.groups));
    return cur.filter((g) => g.label);
  })();
  const W = cols * (cell + gap);
  return (
    <div style={{ width: W }}>
      <svg width={W} height={rows * (cell + gap)}>
        {Array.from({ length: total }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const k = rank[i] / total;
          let fill: string | null = null;
          let o = 0;
          phases.forEach((ph, pi) => {
            const t = ph.at + k * (pi === 0 ? fillDur : 30);
            if (frame >= t) {
              // phase 0 assigns by cell order (sequential fill), later phases by shuffled rank
              const idx = pi === 0 ? (v.order === "sequential" ? i : rank[i]) : rank[i];
              fill = colorOf(ph.groups, idx);
              o = pi === 0 ? prog(frame, t, 6) : 1;
            }
          });
          return <rect key={i} x={c * (cell + gap)} y={r * (cell + gap)} width={cell} height={cell} fill={fill ?? p.faint} opacity={fill ? o : v.empty === false ? 0 : 0.35} />;
        })}
      </svg>
      {v.legend !== false && legendGroups.length > 0 && (
        <div style={{ marginTop: 16 }}><Legend items={legendGroups.map((g) => ({ label: g.label!, color: g.color }))} /></div>
      )}
      {v.note && <div style={{ marginTop: 10 }}><Mono size={21}>{v.note}</Mono></div>}
    </div>
  );
}

/** A row of slots filled one by one (hours, days, steps); some can be marked. */
export function Blocks({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const count = Math.max(1, Math.min(60, v.count ?? 12));
  const at = cueFrame(scene, v.at ?? 0);
  const gap = 12;
  const size = Math.min(v.size ?? 100, (box.w - gap * (count - 1)) / count);
  const fillTo = v.filled ?? count;
  const step = v.stepFrames ?? 6;
  const marks = new Map<number, { color?: string; hollow?: boolean; label?: string }>();
  (v.marks ?? v.highlight ?? []).forEach((m: { i: number; color?: string; hollow?: boolean; label?: string }) => marks.set(m.i, m));
  const col = resolveColor(p, v.color);
  return (
    <div>
      <svg width={count * (size + gap)} height={size + 50} style={{ overflow: "visible" }}>
        {Array.from({ length: count }, (_, i) => {
          const t = prog(frame, at + i * step, 8);
          const m = marks.get(i);
          const filled = i < fillTo && t > 0;
          const mc = m ? resolveColor(p, m.color ?? "warn") : col;
          return (
            <g key={i}>
              <rect x={i * (size + gap) + 1} y={1} width={size - 2} height={size - 2} fill="none" stroke={p.faint} strokeWidth={2} />
              {filled && (m?.hollow ? (
                <rect x={i * (size + gap) + 2} y={2} width={size - 4} height={size - 4} fill="none" stroke={mc} strokeWidth={3} opacity={t} />
              ) : (
                <rect x={i * (size + gap)} y={0} width={size} height={size} fill={mc} opacity={t} />
              ))}
              {m?.label && filled && (
                <text x={i * (size + gap) + size / 2} y={size + 34} fill={mc} fontFamily={MONO} fontSize={21} textAnchor="middle" opacity={t}>{m.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {(v.startLabel || v.endLabel) && (
        <div style={{ display: "flex", justifyContent: "space-between", width: count * (size + gap) - gap, marginTop: 4 }}>
          <Mono size={20}>{v.startLabel ?? ""}</Mono>
          <Mono size={20}>{v.endLabel ?? ""}</Mono>
        </div>
      )}
      {v.note && <div style={{ marginTop: 12 }}><Mono size={22}>{v.note}</Mono></div>}
    </div>
  );
}

/** A line that draws itself; good for spikes, trends and before/after shapes. */
export function Spark({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const vals: number[] = v.values ?? [];
  const n = Math.max(2, vals.length);
  const at = cueFrame(scene, v.at ?? 0);
  const dur = v.dur ?? 50;
  // Vertical: the side value goes under the line, which takes the full width.
  const { portrait } = useLayout();
  const W = portrait ? box.w : Math.min(box.w, v.width ?? box.w * (v.side ? 0.6 : 1));
  const H = Math.min(v.height ?? (portrait ? 300 : 220), box.h - (portrait && v.side ? 240 : 60));
  const max = v.max ?? Math.max(...vals);
  const min = v.min ?? Math.min(0, ...vals);
  const pts = vals.map((y, i) => [(i / (n - 1)) * W, H - ((y - min) / Math.max(1e-6, max - min)) * (H - 20) - 10]);
  const t = prog(frame, at, dur, EASE_IN_OUT);
  const shownN = t * (n - 1);
  const shown = pts.filter((_, i) => i <= shownN);
  const fi = Math.floor(shownN);
  if (fi < n - 1 && shown.length) {
    const a = pts[fi];
    const b = pts[fi + 1];
    const f = shownN - fi;
    shown.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  const col = resolveColor(p, v.color ?? "accent");
  const anns: { i: number; text: string; color?: string; below?: boolean }[] = v.annotations ?? [];
  const side = v.side as { value: number | string; note?: string; color?: string; at?: number | string } | undefined;
  const sideAt = side ? cueFrame(scene, side.at ?? v.at ?? 0) : 0;
  return (
    <div style={{ display: "flex", flexDirection: portrait ? "column" : "row", alignItems: portrait ? "flex-start" : "flex-end", justifyContent: "space-between", gap: portrait ? 30 : 0, width: box.w }}>
      <div>
        {v.label && <div style={{ marginBottom: 14, ...enter(frame, at - 6) }}><Mono size={22}>{v.label}</Mono></div>}
        <svg width={W} height={H + 40} style={{ overflow: "visible" }}>
          <line x1={0} x2={W} y1={H} y2={H} stroke={p.faint} strokeWidth={1.5} />
          <polyline points={shown.map((q) => q.join(",")).join(" ")} fill="none" stroke={col} strokeWidth={3} strokeLinejoin="round" />
          {anns.map((a, k) => {
            const o = shownN >= a.i ? prog(frame, at + (dur * a.i) / (n - 1), 12) : 0;
            const [x, y] = pts[Math.min(a.i, n - 1)];
            const ac = resolveColor(p, a.color ?? "text");
            const flip = x + 8 + a.text.length * 12.6 > W;
            return (
              <g key={k} opacity={o}>
                <line x1={x} x2={x} y1={a.below ? y + 8 : y - 8} y2={a.below ? H + 10 : y - 40} stroke={ac} strokeWidth={1.5} strokeDasharray="3 4" />
                <text x={flip ? x - 8 : x + 8} y={a.below ? H + 34 : y - 46} fill={ac} fontFamily={MONO} fontSize={21} textAnchor={flip ? "end" : "start"}>{a.text}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {side && (
        <div style={{ textAlign: portrait ? "left" : "right", ...enter(frame, sideAt) }}>
          <div style={{ fontFamily: MONO, fontSize: Math.min(130, Math.floor((portrait ? box.w : box.w - W - 40) / (Math.max(4, String(side.value).length) * 0.6))), lineHeight: 1, whiteSpace: "nowrap", color: resolveColor(p, side.color ?? "accent") }}>
            <CountUp value={side.value} start={sideAt} />
          </div>
          {side.note && <Mono size={24}>{side.note}</Mono>}
        </div>
      )}
    </div>
  );
}

/** Horizontal axis with spans (durations) and events (moments). */
export function TimelineVisual({ v, box }: Props) {
  const p = usePalette();
  const scene = useScene();
  const frame = useCurrentFrame();
  const at = cueFrame(scene, v.at ?? 0);
  const min = v.min ?? 0;
  const max = v.max ?? 100;
  const W = Math.min(box.w, v.width ?? box.w);
  const H = Math.min(v.height ?? 300, box.h);
  const axisY = H - 56;
  const barY = axisY - 150;
  const X = (t: number) => ((t - min) / Math.max(1e-6, max - min)) * (W - 40) + 20;
  const step = v.step ?? niceStep((max - min) / 7);
  const ticks: number[] = v.ticks ?? range(Math.ceil(min / step) * step, max, step);
  const fmt = (x: number) => (v.tickFormat ? String(v.tickFormat).replace("{v}", (x > 0 && v.signed ? "+" : "") + x) : (x > 0 && v.signed ? "+" : "") + x);
  const spans: { from: number; to: number; color?: string; label?: string; at?: number | string; thin?: boolean }[] = v.spans ?? [];
  const events: { t: number; label: string; sub?: string; color?: string; at?: number | string; below?: boolean }[] = v.events ?? [];
  const labels = placeLabels(events.map((e) => ({ x: X(e.t), w: Math.max(e.label.length * 13.2, (e.sub?.length ?? 0) * 11.4) })), W);
  return (
    <svg width={W} height={H} style={{ overflow: "visible" }}>
      {ticks.map((t, k) => (
        <g key={k} opacity={prog(frame, at - 6, 12)}>
          <line x1={X(t)} x2={X(t)} y1={barY - 70} y2={axisY - 14} stroke={p.line} strokeWidth={1.5} />
          <text x={X(t)} y={axisY + 18} fill={p.muted} fontFamily={MONO} fontSize={20} textAnchor="middle">{fmt(t)}</text>
        </g>
      ))}
      {v.unit && <text x={W} y={axisY + 50} fill={p.muted} fontFamily={MONO} fontSize={20} textAnchor="end">{v.unit}</text>}
      {spans.map((s, k) => {
        const sAt = cueFrame(scene, s.at ?? v.at ?? 0);
        const t = prog(frame, sAt, 30, EASE_IN_OUT);
        const x1 = X(s.from);
        const x2 = x1 + (X(s.to) - x1) * t;
        const col = resolveColor(p, s.color ?? "accent");
        const h = s.thin ? 4 : 44;
        return (
          <g key={k}>
            <rect x={x1} y={barY - h / 2} width={Math.max(0, x2 - x1)} height={h} fill={s.thin ? col : alpha(col, 0.42)} />
            {s.label && <text x={x1} y={barY + h / 2 + 30} fill={col} fontFamily={MONO} fontSize={21} opacity={t}>{s.label}</text>}
          </g>
        );
      })}
      {events.map((e, k) => {
        const eAt = cueFrame(scene, e.at ?? v.at ?? 0);
        const o = prog(frame, eAt, 12);
        const col = resolveColor(p, e.color ?? "accent");
        const x = X(e.t);
        const { anchor, row } = labels[k];
        const lx = anchor === "start" ? x - 3 : anchor === "end" ? x + 3 : x;
        const ly = barY - 76 - row * 52;
        return (
          <g key={k} opacity={o}>
            <rect x={x - 3} y={barY - 36} width={6} height={72} fill={col} />
            <text x={lx} y={ly} fill={col} fontFamily={MONO} fontSize={22} textAnchor={anchor}>{e.label}</text>
            {e.sub && <text x={lx} y={ly + 26} fill={p.muted} fontFamily={MONO} fontSize={19} textAnchor={anchor}>{e.sub}</text>}
          </g>
        );
      })}
    </svg>
  );
}

type Anchor = "start" | "middle" | "end";

/** Anchor and row for labels over points on an axis, so neighbours don't overlap: centered when
 * there is room, else pushed to one side of the point, else raised a row. */
function placeLabels(items: { x: number; w: number }[], W: number): { anchor: Anchor; row: number }[] {
  const placed: { a: number; b: number; row: number }[] = [];
  const order = items.map((_, i) => i).sort((i, j) => items[i].x - items[j].x);
  const out: { anchor: Anchor; row: number }[] = new Array(items.length);
  for (const i of order) {
    const { x, w } = items[i];
    const preferred: Anchor = x > W - 200 ? "end" : "middle";
    const anchors: Anchor[] = [preferred, ...(["middle", "start", "end"] as Anchor[]).filter((a) => a !== preferred)];
    const span = (a: Anchor): [number, number] => (a === "middle" ? [x - w / 2, x + w / 2] : a === "start" ? [x - 3, x - 3 + w] : [x + 3 - w, x + 3]);
    const free = (a: number, b: number, row: number) => a > -20 && b < W + 20 && !placed.some((p) => p.row === row && a < p.b + 14 && b > p.a - 14);
    let pick: { anchor: Anchor; row: number } | null = null;
    for (let row = 0; row < 4 && !pick; row++) {
      for (const anchor of anchors) {
        const [a, b] = span(anchor);
        if (free(a, b, row)) {
          pick = { anchor, row };
          placed.push({ a, b, row });
          break;
        }
      }
    }
    out[i] = pick ?? { anchor: preferred, row: 0 };
  }
  return out;
}

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const m = raw / pow;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * pow;
}

function range(a: number, b: number, s: number): number[] {
  const out: number[] = [];
  for (let x = a; x <= b + 1e-9; x += s) out.push(Math.round(x * 1000) / 1000);
  return out;
}
