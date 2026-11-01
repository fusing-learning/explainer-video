import React from "react";
import { Bars, Blocks, Series, Spark, Stat, TimelineVisual, Waffle, setChartRegistry } from "./data";
import { Chips, Flow, Network } from "./diagram";
import { Cards, Compare, Headline, ImageVisual, Points, Quote, Table, Takeaway, TextStatement } from "./text";
import { Outro } from "./outro";
import type { Box } from "../lib/ui";
import type { Visual } from "../lib/types";

type C = (p: { v: Visual; box: Box }) => React.ReactElement | null;

export const VISUALS: Record<string, C> = {
  headline: Headline,
  text: TextStatement,
  quote: Quote,
  takeaway: Takeaway,
  points: Points,
  compare: Compare,
  cards: Cards,
  table: Table,
  image: ImageVisual,
  stat: Stat,
  bars: Bars,
  series: Series,
  waffle: Waffle,
  blocks: Blocks,
  spark: Spark,
  timeline: TimelineVisual,
  chips: Chips,
  flow: Flow,
  network: Network,
  outro: Outro,
};

setChartRegistry(VISUALS);

export function VisualView({ v, box }: { v: Visual; box: Box }) {
  const Comp = VISUALS[v?.type] ?? TextStatement;
  return <Comp v={VISUALS[v?.type] ? v : { type: "text", text: v?.text ?? "" }} box={box} />;
}
