import React from "react";
import { Composition } from "remotion";
import { Explainer } from "./Explainer";
import type { Timeline } from "./lib/types";

// Rendered with --props=<job>/timeline.json (written by pipeline/build.py).
const sample: Timeline = {
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 150,
  audio: "",
  source: { title: "Sample" },
  scenes: [
    {
      id: "hello",
      from: 0,
      dur: 150,
      lines: [{ text: "Render a job with pipeline/build.py.", start: 10, end: 120, words: [] }],
      visual: { type: "headline", lines: ["explainer", { text: "renderer ready.", color: "accent" }] },
    },
  ],
};

// Same timeline, two frames. ExplainerVertical is laid out at 900x1600 and rendered with
// --scale=1.2 to 1080x1920 (see lib/theme.ts).
export const Root: React.FC = () => (
  <>
    <Composition
      id="Explainer"
      component={Explainer}
      defaultProps={sample}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={150}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, Math.round(props.durationInFrames)),
        fps: props.fps || 30,
        width: props.width || 1920,
        height: props.height || 1080,
      })}
    />
    <Composition
      id="ExplainerVertical"
      component={Explainer}
      defaultProps={sample}
      fps={30}
      width={900}
      height={1600}
      durationInFrames={150}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, Math.round(props.durationInFrames)),
        fps: props.fps || 30,
      })}
    />
  </>
);
