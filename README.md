# Explainer video

Send a link, get a ~2-minute narrated explainer video, in the style of
[this reply](https://x.com/lucataco/status/2115641239014162824): dark,
data-first motion graphics where numbers count up and charts build as the
narrator speaks, with one caption line at a time and a source card at the end.

## How to use it

**From Claude Code (best).** Open a session in this folder and paste links,
or attach files:

> make videos for these: https://... https://...

Claude fetches each one. Paywalled pages are read through your logged-in
Chrome via the Claude in Chrome extension. Claude reads the text and every
image, writes the script, checks the layout, renders, and sends you the mp4.
Videos land in `output/`, each with a short formatted text summary (`.md`) beside it.

**Read-later inbox.** Add links to `inbox.md` as `- [ ] https://...`, then
tell Claude "do my inbox", or run it unattended:

```bash
./explain --inbox
```

**One-off, unattended:**

```bash
./explain https://example.com/some-article
```

Unattended mode writes the script with the Claude API (`claude-opus-5-5`,
`ANTHROPIC_API_KEY` in `.env`). Paywalled or blocked pages are read in your
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
                -> Remotion render -> video.mp4 + output/<job>.mp4 + qa_sheet.jpg + output/<job>.md (summarize.py)
```

- `build.py <job> --check` validates the script, `--stills` renders one frame
  per scene for a quick layout check, and `--draft` renders at half resolution.
- Voice: Gemini `gemini-3.8-flash-tts`, voice `Charon`. Your tier allows 10
  requests/min, which a shared limiter handles. Falls back to macOS `say`.
- Rendering takes about 3 minutes per minute of video. It runs in ~60 s chunks,
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

Gemini TTS for about 15 short clips costs a few cents. Unattended script
writing with Claude Opus 5.5 runs about 30–60k input tokens (the article plus
images) and 5–10k output, roughly $0.30–0.50. In a Claude Code session, the
script comes out of your normal usage instead.

## Setup (already done on this Mac)

```bash
python3 -m venv --system-site-packages .venv && .venv/bin/pip install trafilatura pymupdf anthropic
cd renderer && npm install
```

It also needs ffmpeg, yt-dlp and mlx-whisper (already installed), plus Google Chrome.
