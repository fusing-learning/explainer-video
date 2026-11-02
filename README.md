# Explainer video

Send a link, get a ~2-minute narrated explainer video, in the style of
[this reply](https://x.com/lucataco/status/2115641239014162824): dark,
data-first motion graphics where numbers count up and charts build as the
narrator speaks, with one caption line at a time and a source card at the end.

## Requirements

- **A Mac with Apple Silicon (M1 or later).** Captions are timed with
  mlx-whisper, which only runs on Apple Silicon. A few steps also use the
  macOS tools `textutil` and `say`.
- **Google Chrome** in `/Applications`. Remotion renders with it.
- **Python 3.11+**, **Node 20+**, and **ffmpeg** (`brew install python node ffmpeg`).
- **A Gemini API key** for the voice ([get one](https://aistudio.google.com/apikey)).
- Optional:
  - [Claude Code](https://claude.com/claude-code), for the main way of using it (below).
    Unattended `./explain` and the text summaries also run on its login through `claude -p`.
  - An Anthropic API key, only if you'd rather not use Claude Code for those (or don't have it).
  - The [Claude in Chrome](https://claude.com/chrome) extension, for paywalled pages and X threads.
- About 2 GB of free disk for the whisper model, which downloads on the first run.

## Setup

```bash
git clone <this repo> explainer-video && cd explainer-video
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd renderer && npm install && cd ..
cp .env.example .env    # then paste your keys into .env
```

To check that it works, make your first video: open Claude Code in this
folder and paste a link, or run the line below.
The first run is slower while the whisper model downloads.

```bash
./explain https://paulgraham.com/greatwork.html
```

## How to use it

**From Claude Code (best).** Open a session in this folder and paste links,
or attach files:

> make videos for these: https://... https://...

Claude fetches each one. Paywalled pages are read through your logged-in
Chrome via the Claude in Chrome extension. Claude reads the text and every
image, writes the script, checks the layout, renders, and sends you the mp4s.
Videos land in `output/`: `<job>.mp4` (16:9), `<job>-vertical.mp4` (9:16, for
phones), and a short formatted text summary (`<job>.md`).

**Read-later inbox.** Add links to `inbox.md` as `- [ ] https://...`, then
tell Claude "do my inbox", or run it unattended:

```bash
./explain --inbox
```

**One-off, unattended:**

```bash
./explain https://example.com/some-article
```

Unattended mode writes the script with `claude-opus-5-5` through a headless
`claude -p` run (no tools) on your Claude Code login. Without the `claude`
CLI, or if that run fails, it uses `ANTHROPIC_API_KEY` from `.env` instead;
set `CLAUDE_BACKEND=api` to always use the key. Paywalled or blocked pages are read in your
Chrome by a headless `claude -p --chrome` run, which gets only the Claude in
Chrome tools (no shell or file access). That needs Chrome open with the
extension connected, and the `claude` CLI logged into the same claude.ai
account as the extension. If the read fails, the item is marked "needs
browser" in the inbox and the next run retries it.

## What it can read

| Source | How |
|---|---|
| Web articles | HTTP plus trafilatura, with Chrome as the fallback for paywalls and blocks |
| X posts and X Articles | fxtwitter API (full text and images); threads through Chrome |
| YouTube and other video | captions via yt-dlp, otherwise local mlx-whisper transcription plus keyframes |
| PDFs (URL or file) | text and embedded figures (PyMuPDF); page renders for scans |
| Local files | md, txt, html, docx/rtf (textutil), images, audio, video |

## Pipeline

```
fetch.py        source -> videos/<date>-<slug>/source/{content.md, images/, meta.json, links.json}
script.json     written by Claude (session or write_script.py) per pipeline/prompts/script_guide.md
build.py        voice (Gemini TTS, cached per scene) -> whisper word alignment -> timeline.json
                -> Remotion render (16:9 and 9:16) -> output/<job>.mp4, output/<job>-vertical.mp4
                -> qa_sheet.jpg, qa_sheet-vertical.jpg, output/<job>.md (summarize.py)
```

- `build.py <job> --check` validates the script, `--stills` renders one frame
  per scene (both formats) for a quick layout check, `--draft` renders at half
  resolution, and `--format landscape|vertical` makes only one of the two videos.
- The vertical video uses the same timeline as the landscape one. Side-by-side
  visuals stack, and the title and visual sit together above the captions. It is
  laid out at 900×1600 and rendered at 1.2× to 1080×1920, so text is a little
  larger relative to the frame.
- Voice: Gemini `gemini-3.8-flash-tts`, voice `Charon`. A shared limiter keeps
  it to 9 requests/min (set `GEMINI_TTS_RPM` in `.env` for a different tier).
  Falls back to macOS `say`.
- Rendering takes about 3 minutes per minute of video, per format. It runs in ~60 s chunks,
  each in a fresh Chrome, because a single long pass stalls when the Mac is
  unattended (macOS throttles the invisible Chrome after ~5 min). The chunks
  are stitched losslessly.
- Renderer: Remotion 4 in `renderer/`, about 20 visual types (stat, bars,
  series, waffle, blocks, spark, timeline, chips, flow, network, compare,
  cards, points, table, quote, text, headline, takeaway, image).
  `remotion.config.ts` uses the installed Google Chrome because Remotion's
  bundled headless shell hangs on macOS 27.
- Remotion is free for individuals and small teams; companies above that size
  need a [company license](https://www.remotion.dev/license).

## Cost per video (rough)

Gemini TTS for about 15 short clips costs a few cents. Script writing with
Claude Opus 5.5 runs about 30–60k input tokens (the article plus images) and
5–10k output. Through Claude Code (a session or `claude -p`) that comes out of
your plan's usage; on an API key it's roughly $0.30–0.50.
