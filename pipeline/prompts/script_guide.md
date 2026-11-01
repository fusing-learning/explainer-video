# Explainer script guide

You are writing `script.json` for a narrated explainer video (1920x1080, dark
background, data-first motion graphics, one caption line at a time). The viewer
wants the substance of a piece they don't have time to read. Clear beats clever.
Faithful beats dramatic.

## Length and shape

Default 1.5–3 minutes: **8–14 scenes, 2–4 lines each, ~230–420 words** of
narration (about 2.6 words per second). Go shorter for thin sources. Go longer
(up to ~6 min, 20 scenes) only for dense long reads or when asked.

1. **Hook** (1 scene). Open on the most striking fact, ideally a number, and
   say who or what it's about in one breath. No preamble.
2. **Setup** (1–2 scenes). What this is and why it matters, or the problem.
3. **Body** (3–8 scenes). The key ideas in the order the source argues them,
   one per scene. Each is a claim plus concrete evidence: a number, an example,
   or a short quote. Use connective tissue ("First, ...", "Then ...",
   "The catch: ...") so it plays as one story, not a list of slides.
4. **So what** (1 scene). Implications, what's left, the open question, or the
   strongest counterpoint the source raises.
5. **Takeaway** (1 scene). The one line to remember. A source card is added
   automatically after it, so don't credit the source in narration.

## Narration lines

- Each line is one caption and one breath. Aim for **≤ 70 characters**; never
  over 110. Split long sentences across lines, and keep fragments readable on
  their own.
- Third person for the author ("Jacob woke up to 700 questions"). Mostly
  present or simple past.
- Plain, concrete words. Banned: "In today's video", "Let's dive in",
  "Imagine...", "game-changer", "revolutionize", "In a world where", rhetorical
  questions as filler, hype adjectives. Don't use em dashes in narration; use
  commas or periods.
- Write what should be heard. "77,000" and "$3.1 million" are fine. Use
  `{"text": "30x payroll", "say": "thirty times payroll"}` when the caption and
  the speech should differ (symbols, abbreviations, odd names).
- Narration and visual complement each other. The visual can show the exact
  figure (11,372) while the line rounds it ("over 11,000 verdicts").
- No more than three items in a spoken list.

## Faithfulness (non-negotiable)

- Every number, name and claim must come from the source: its text, images,
  charts, captions, or a linked document you actually read. Never invent data
  or precision.
- **Look at every image in `source/images/`.** Charts and screenshots often
  hold the exact numbers, labels and shapes, and they make the best visuals.
- Charts: when the source gives only a total, show the total. A `series` or
  `bars` visual must reflect real values, or approximate the shape of a chart
  the source actually shows (labeled numbers stay exact). A schematic shape
  with no numbers on it (a spike, a ramp) is fine when it only depicts what
  the text describes; label it "(schematic)". If you can't ground a chart,
  use a different visual.
- Opinion stays attributed ("Jacob argues..."). Don't add outside facts or your
  own verdict.
- Contested or speculative claims get one honest qualifier, not a pile of them.

## Visual direction

- One idea per scene. **Show the idea, data first.** Prefer, in order: a number
  (`stat`), then a chart (`bars`, `series`, `spark`, `waffle`, `blocks`,
  `timeline`), then a structure (`flow`, `chips`, `compare`, `table`,
  `network`), then words (`points`, `cards`, `quote`, `text`). Use `image`
  for source figures that can't be rebuilt simply (diagrams, screenshots, photos).
- Vary visual types. Don't use the same type in three consecutive scenes.
- **Sync** with cues: `at: 1` means "when line 1 of this scene starts" (0-based;
  fractions like 1.5 are allowed), and `at: "word:spike"` means "when the word
  'spike' is spoken". Reveal each element as the narration mentions it.
- `title` is a short lowercase label in chart-title style ("changes shipped,
  last 30 days"). `subtitle` is a mono annotation that adds context. Headline,
  takeaway and text scenes usually have neither.
- Colors: `accent` (green by default) for the subject, `warn` (coral) for
  problems, failures and risks, `amber` for the human or secondary measure,
  `muted` for context. On-screen text stays short: labels ≤ 4 words, notes
  ≤ 8 words.
- `*word*` inside headline-ish text (text, points, cards, compare, quote) turns
  that span the accent color.

## script.json format

```json
{
  "voice": "Charon",
  "style": "calm, clear, engaged explainer narrator",
  "theme": {"accent": "#4ade80"},
  "scenes": [
    {
      "id": "hook",
      "title": "optional small label",
      "subtitle": "optional mono annotation",
      "lines": ["First caption line.", {"text": "Caption", "say": "Spoken form"}],
      "visual": {"type": "headline", "...": "..."},
      "pause": 0.7
    }
  ]
}
```

`voice`, `style`, `theme` and `pause` (seconds of silence after the scene) are
optional. Add `"source": {"author": "Paul Graham", "site": "paulgraham.com"}`
when `meta.json` is missing the author or names the site badly; it feeds the
closing source card. Leave `theme` out to keep the default green look. Set an accent that
matches the source's brand only when it clearly has one. Other voices: `Puck`
(upbeat), `Kore` (firm), `Sadaltager` (knowledgeable), `Iapetus` (clear),
`Achird` (friendly), `Sulafat` (warm), `Gacrux` (mature).

## Visual types

Every visual takes `type` and optional `at` (when it starts). Any field named
`*At` is also a cue. Unknown fields are ignored. Images live under
`source/images/` (from the fetcher) or `assets/` (anything you add).

### headline: opening or section statement in big mono type
```json
{"type": "headline", "lines": [{"text": "10 humans."}, {"text": "$32m/yr in AI spend.", "color": "accent", "at": 1}],
 "sub": [{"text": "how I built the most AI-pilled company", "at": 0}, {"text": "30x payroll, spent on tokens", "at": 1}]}
```
Line 0 is white and later lines are accent unless `color` is set. `sub` can be a
string, or a list that swaps over time.

### stat: big number that counts up, optionally with a chart
```json
{"type": "stat", "value": 77688, "note": "by a team of ten", "at": 0,
 "chart": {"type": "bars", "bars": [{"value": 4}, {"value": 6}], "at": 1}}
```
`value` is a number or a string ("$3.1M", "SEV-0", "11 min"); the numeric part
counts up. Optional: `prefix`, `suffix`, `from`, `color`, `size` (default 190),
`label` (mono line above), `below` (amber line under the number, `belowAt`),
`legend` [{label, color}], `chart` (any chart visual), `chartAt`,
`chartSide: "right"` (chart beside the number, e.g. a waffle), `chartWidth`.

### bars: bar chart (simple, stacked, with dots for a second measure)
```json
{"type": "bars", "bars": [{"label": "oct 5", "stack": [0, 0, 0], "dot": 1},
                          {"label": "oct 6", "stack": [120, 80, 60], "dot": 1}],
 "stackColors": ["accent", "accent2", "accent3"], "legend": [{"label": "decided"}, {"label": "sent back"}],
 "showValues": false, "highlight": 3, "note": "...", "at": 1}
```
Per bar: `value` or `stack`, `label`, `dot`, `color`, `at`. `highlight` dims
all bars but one. `stagger` sets frames between bars (default 4). `height`
defaults to 420.

### series: dense time series revealed left to right
```json
{"type": "series", "values": [3, 4, 0, 0, 12, 40], "values2": [1, 1, 0, 0, 2, 3],
 "ticks": [{"i": 0, "label": "may"}, {"i": 30, "label": "jun"}],
 "markers": [{"i": 32, "label": "fable, jun 9", "at": "word:fable"}],
 "legend": [{"label": "fleet"}, {"label": "people", "color": "accent2"}],
 "at": 0, "until": 2, "note": "reverted: 1,055 of 123,548 (0.9%)"}
```
`until` is the cue when the sweep finishes. `peakLabel` is true by default and
labels the max; set a string to override or false to hide. `color`,
`color2`, `height` (default 380), `max`.

### waffle: one square per thing, filled by groups, can recolor in phases
```json
{"type": "waffle", "total": 700, "groups": [{"count": 700, "color": "amber", "label": "waiting"}],
 "phases": [{"at": 2, "groups": [{"count": 450, "color": "accent", "label": "decided"},
                                 {"count": 140, "color": "accent2", "label": "sent back"},
                                 {"count": 110, "color": "accent3", "label": "held"}]}]}
```
Optional: `cols`, `cell` (max px), `order: "sequential"`, `note`,
`legend: false`. Keep `total` ≤ ~1,500 (scale down and say so in `note`).

### blocks: a row of slots filled one by one (hours, days, steps)
```json
{"type": "blocks", "count": 12, "marks": [{"i": 8, "color": "warn", "hollow": true, "label": "no ship"}],
 "startLabel": "9am", "endLabel": "9pm", "at": 1}
```

### spark: a line that draws itself (spikes, trends)
```json
{"type": "spark", "values": [3, 4, 3, 5, 4, 30, 6, 4], "color": "warn", "label": "api spend, the day a key leaked",
 "annotations": [{"i": 5, "text": "key disabled", "below": true}],
 "side": {"value": "15 min", "note": "to catch the anomaly", "at": 2}}
```

### timeline: an axis with spans (durations) and events (moments)
```json
{"type": "timeline", "min": -10, "max": 60, "signed": true, "unit": "minutes",
 "spans": [{"from": -8, "to": 15, "color": "warn", "label": "players affected"}],
 "events": [{"t": 0, "label": "declared", "color": "text"}, {"t": 11, "label": "fix live", "at": 1},
            {"t": 60, "label": "resolved", "at": 2}]}
```
Also good for history (years) with `step`. `tickFormat` like "{v}h".

### chips: named things in a row (teams, agents, parts), optional swarm grid
```json
{"type": "chips", "items": ["engine", "savi", "ops", "finance", "bug triage", "deploys"],
 "tags": [{"label": "a name", "at": 2}, {"label": "a memory", "at": 2.3}, {"label": "real permissions", "at": 2.6}],
 "swarm": {"at": 3}, "note": "each square: one helper agent"}
```
Items can be `{label, sub, at}`.

### flow: a process as stages in a frame; a pulse travels through (loop)
```json
{"type": "flow", "steps": [{"label": "in", "text": "live product"}, {"label": "read", "text": "errors, bug reports"},
                           {"label": "own", "text": "an agent owns it"}, {"label": "out", "text": "fix ships within the hour"}],
 "loop": true, "note": "60% of work starts from a production signal"}
```

### network: trails growing across a dot grid (many independent actors)
```json
{"type": "network", "paths": 14, "events": [{"at": 2, "label": "broke", "color": "warn"}],
 "sweep": {"at": 3, "label": "full test suite runs every 15 minutes"}, "side": {"label": "pull requests", "value": "0", "at": 1}}
```

### compare: two panels (before/after, them/us, myth/reality)
```json
{"type": "compare", "left": {"title": "most companies", "items": ["big human teams", "AI as a tool"], "color": "muted"},
 "right": {"title": "spawn", "items": ["10 humans", "a fleet of permanent agents"]}, "rightAt": 1, "vs": "vs"}
```

### cards: 1–3 panels with a title, a sub line, a body or quotes
```json
{"type": "cards", "items": [{"title": "taste", "sub": "saying no, even when it works", "quotes": ["NEVER CPU raster."], "at": 0},
                            {"title": "ambition", "sub": "asking for 100x", "body": "“A world 1000x GTA, loaded in a second.”", "at": 2}]}
```

### points: key ideas as a list; the newest is bright, older ones dim
```json
{"type": "points", "items": [{"title": "Cut the chatter", "text": "coordinate through the code", "at": 0},
                             {"title": "Close the loop", "at": 1}], "numbered": true, "columns": 1}
```

### table: small comparison table, rows appear in turn
```json
{"type": "table", "columns": ["model", "result"], "rows": [["Fable", "works"], ["others", "disasters"]], "highlight": [0], "rowAt": [1, 2]}
```

### quote: a short quote, big
```json
{"type": "quote", "text": "Claude does not like to make *slop SaaS features*.", "by": "Jacob, CEO of Spawn"}
```

### text: one big statement (sparingly)
```json
{"type": "text", "text": "Agents aren't *specialized* like people.", "kicker": "why it works", "size": "lg"}
```

### takeaway: the closing line
```json
{"type": "takeaway", "kicker": "the model alone isn't the edge.", "text": "close the loop.",
 "icon": "circle", "sub": ["let agents break production.", "make sure they fix it fast."], "at": 1, "subAt": 2}
```
`icon` is circle, check, arrow, or none.

### image: a figure from the source, slowly drifting, optional zoom to a region
```json
{"type": "image", "src": "source/images/03.png", "caption": "changes landed per day", "focus": [0.8, 0.4, 1.6], "focusAt": 1}
```
`focus` is [x, y, scale] in 0–1 image coordinates.

## Before you finish

- Run `pipeline/build.py <job> --check` and fix every error. Treat warnings
  as things to fix unless there's a reason.
- Then run `--stills` and look at `qa_sheet.jpg`. Check for overflow, overlaps,
  text running into the caption band (below y≈800), empty-looking scenes, and
  unreadable charts.
