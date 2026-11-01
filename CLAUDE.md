# Explainer videos

This folder turns things the user wants to read (links, X posts and threads,
PDFs, videos, screenshots, docs) into short narrated explainer videos.

When the user sends a link or file, or says "do my inbox", use the
`explainer-video` skill (`.claude/skills/explainer-video/SKILL.md`). It covers
fetching (including paywalled pages through the user's Chrome), writing the
script, the QA loop, rendering, and delivery.

- Python: `.venv/bin/python -W ignore pipeline/<script>.py`
- Script-writing rules and visual types: `pipeline/prompts/script_guide.md`
- Renderer (Remotion, React): `renderer/src/`. Typecheck with `cd renderer && npx tsc --noEmit`.
- Keys live in `.env` (`GEMINI_API_KEY` for the voice, `ANTHROPIC_API_KEY`
  for unattended `./explain`). Never print them.
- The user is often away while videos are made. Pick sensible defaults,
  finish the video, then report. Don't stop to ask.
