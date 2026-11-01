---
name: explainer-video
description: Turn an article, link, X post or thread, PDF, video, image or file into a ~2-minute narrated explainer video (data-first motion graphics, voice-over, captions). Use when the user sends links or files to watch instead of read, says "make a video / explainer of this", "turn this into a video", or drops read-later items.
---

# Explainer video

Project root: the folder containing `pipeline/` and `renderer/` (this skill's
`../../..`). Run everything from there with `.venv/bin/python -W ignore`.

The user sends things to watch instead of read. Don't ask questions you can
answer with a sensible default; they're often away. Make the video, then report.

## Per source

1. **Fetch.** `.venv/bin/python -W ignore pipeline/fetch.py "<url or path>"`
   prints the job folder (`videos/<date>-<slug>/`). Attachments the user sent
   (images, PDFs, docs, audio/video) go in as paths.
   - Read `source/meta.json`. If `needs_browser` is true (paywall, block, or
     too little text), or it's an X thread or X article link that fxtwitter
     couldn't read, **read it in the user's Chrome** (Claude in Chrome; they're
     logged in). Load the chrome-browser skill first: `tabs_context_mcp`, then
     `tabs_create_mcp`, `navigate`, and `get_page_text`. Save the text to
     `<job>/source/browser.txt` and run `fetch.py --job <job> --text <job>/source/browser.txt`.
     Collect the article's images with `javascript_tool`:
     `[...document.querySelectorAll('article img, main img, figure img')].map(i => i.currentSrc || i.src).filter(u => u.startsWith('http') && !u.includes('avatar'))`,
     then run `fetch.py --job <job> --add-images <urls...>`. Close your tab.
   - If Chrome isn't connected, use what the fetch got and say the video
     covers only the free portion.
2. **Read everything.** Read all of `source/content.md`, and **look at every
   image** in `source/images/` with Read: charts hold exact numbers, and
   figures make the best visuals. Skim `source/links.json`. If the piece mostly
   points elsewhere (a post linking a paper, a thread about a doc), fetch that
   target too and use it as the main source.
3. **Write `<job>/script.json`.** Read `pipeline/prompts/script_guide.md`
   first, every time. It defines the narrative shape, faithfulness rules, and
   every visual type. Narration is ~230–420 words unless the user asked for
   something else. Every number comes from the source.
4. **Check:** `pipeline/build.py <job> --check`. Fix all errors and warnings.
5. **Layout pass:** `pipeline/build.py <job> --stills` synthesizes the voice
   (cached per scene) and renders one still per scene into `<job>/qa_sheet.jpg`.
   Look at it and fix overflow, collisions, empty-looking or cramped scenes,
   and text in the caption band. Repeat until clean (only changed scenes
   re-voice).
6. **Render:** `pipeline/build.py <job>`. It takes about 3 minutes per minute of
   video, so run it with `run_in_background` and wait on its completion line. It writes `<job>/video.mp4`, copies it to
   `output/<job>.mp4`, writes a formatted text summary to `output/<job>.md`
   (`pipeline/summarize.py`; rerun it alone after editing the script), and
   makes a QA sheet from the real video. Look at the
   sheet. For sync, spot-check a few frames mid-scene with
   `ffmpeg -ss <sec> -i <video> -frames:v 1 <png>`.
7. **Deliver.** Send `output/<job>.mp4` and `output/<job>.md` with SendUserFile (status `proactive`
   if the user is away). Reply in 2–4 lines: what it covers, its length, and
   anything partial or uncertain (paywalled, approximated chart shape, a
   claim you couldn't verify).

## Several links at once

Fetch all of them first (fetching is quick and parallel-safe). Then for each:
read, write the script, check, stills, render. Writing scripts can fan out to
subagents (one per source, each given this skill's steps 2–5). Renders and
voice-overs serialize themselves through a lock and a rate limiter. Deliver
each video as soon as it's done rather than batching.

`inbox.md` is the user's read-later queue. When asked to "do my inbox",
process unchecked items and tick each with its output path.

## Unattended / no session

`./explain <url> [...]` or `./explain --inbox` runs fetch, then
`pipeline/write_script.py` (Claude API, `ANTHROPIC_API_KEY` in `.env`), then
build. When a fetch needs a browser, it runs headless `claude -p --chrome`
(Chrome tools only) to read the page, then continues. If that fails (Chrome
closed, extension disconnected, CLI logged into a different account than the
extension), the item is marked "needs browser" and retried on the next run.

## Defaults (change on request)

- Voice: Gemini TTS `Charon` (set `"voice"` in script.json; see the guide for
  others). The style note is in `"style"`. With no Gemini key or quota, it
  falls back to macOS `say`.
- 1920×1080, 30 fps, dark theme, green accent (`"theme": {"accent": "#hex"}`).
- Length: 1.5–3 min. For "short", aim for ~60–90 s. For "deep dive", up to ~6 min.
- Vertical/phone format isn't built yet. Say so if asked.

## Fixing problems

- Remotion hangs with "Waiting for root component": the bundled headless
  Chrome is broken on this macOS. `renderer/remotion.config.ts` points at
  system Chrome. Keep it that way.
- TTS 429s: the tier allows 10 requests/min. The limiter handles it, so just wait.
- A render failing with `delayRender ... "Setting the current frame"` means
  Chrome got throttled. Chunked rendering plus retries usually absorbs it, so
  re-run the build. Keep `CHUNK` in `build.py` at ≤60 s of video.
- `ps` output is compressed by the rtk hook. Use `rtk proxy /bin/ps -axo pid,etime,command`
  to see real process lines.
- To re-voice one scene, change its lines (the hash changes) or delete
  `audio/NN-*.wav`.
- New visual idea that no type covers: prefer composing existing types. Add a
  new type in `renderer/src/visuals/`, register it in `visuals/index.tsx`,
  and add it to `REQUIRED` in `pipeline/build.py` and to the guide, only if it
  will be reused.
