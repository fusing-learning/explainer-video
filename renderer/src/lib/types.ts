// Shapes of timeline.json, which pipeline/build.py writes from script.json.
// All times are in frames. Line/word frames are relative to the scene start.

export type ColorName = "accent" | "accent2" | "accent3" | "text" | "muted" | "faint" | "warn" | "amber" | "blue" | "violet";
export type Color = ColorName | string;
/** Line index in the scene (0-based, fractions allowed), or "word:<text>" for the moment that word is spoken. */
export type Cue = number | string;

export interface Word {
  w: string;
  s: number;
  e: number;
}

export interface Line {
  text: string;
  start: number;
  end: number;
  words: Word[];
}

export interface Scene {
  id: string;
  from: number; // absolute start frame of the scene window
  dur: number; // frames the scene is on screen
  title?: string;
  subtitle?: string;
  lines: Line[];
  visual: Visual;
}

export interface Source {
  title: string;
  author?: string;
  handle?: string;
  site?: string;
  url?: string;
}

export type Timeline = Record<string, unknown> & {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  audio: string; // path relative to the job folder (the public dir)
  envelope: number[]; // narration loudness 0..1, one value per envelopeStep frames
  envelopeStep: number;
  theme?: { accent?: string; accent2?: string; accent3?: string };
  source: Source;
  scenes: Scene[];
  captions?: boolean;
};

// Visuals are loosely typed: each component reads the fields it knows and
// falls back to defaults, so a slightly-off spec still renders.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Visual = { type: string; at?: Cue; [k: string]: any };
