#!/usr/bin/env python3
"""Write output/<job>.md, a formatted text version of a job's video (Claude).

    summarize.py <job>

build.py runs this after publishing a video. The summary covers what the
narration covers, with headers and bullets where they help, under a header
with the source link and reading times. Claude runs through `claude -p` on the
Claude Code login by default, or the API with ANTHROPIC_API_KEY (see
common.claude_backend). If neither works it falls back to the narration as
plain paragraphs.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import OUTPUT, ROOT, claude_backend, claude_print, load_env, log, read_json  # noqa: E402

MODEL = "claude-opus-5-5"
READ_WPM = 238  # average adult silent reading speed, non-fiction

SYSTEM = """You turn the narration of a short explainer video into a written summary that is quick to read.

Rules:
- Cover the same points as the narration, in the same order. Add nothing the narration doesn't say;
  use the source text only to get names, numbers and terms exactly right.
- Make it easy to scan. Use formatting where it helps, not everywhere:
  - `##` headers for the main sections (a short summary may need none, or only two or three)
  - bullet or numbered lists for steps, options, lists of findings, or comparisons
  - a small markdown table only if the narration compares several things on the same measures
  - **bold** for a few key numbers or terms, not whole sentences
  - short paragraphs for argument and story, where bullets would lose the reasoning
- Write for reading, not listening: drop spoken-only phrasing ("let's look at", "here's the thing")
  and any reference to the video's visuals.
- Keep it about as long as the narration or shorter. Plain, direct language.
- Start with one or two sentences giving the gist, then the body. End with the main takeaway if the
  narration has one.
- Reply with only the markdown body. No title (it is added separately), no code fences."""


def line_text(l) -> str:
    return (l if isinstance(l, str) else l.get("text", "")).strip()


def narration(script: dict) -> list[str]:
    return [" ".join(line_text(l) for l in sc["lines"]) for sc in script["scenes"]]


def header(meta: dict, body: str) -> str:
    words = len(re.findall(r"\w+", body))
    orig = meta.get("word_count") or 0
    by = f" by {meta['author']}" if meta.get("author") else ""
    out = f"# {meta.get('title', 'Untitled')}\n\nSource: {meta.get('final_url') or meta.get('url', '')}{by}  \n"
    out += f"Reading time: about {max(1, round(words / READ_WPM))} min"
    if orig:
        out += f" (the original is {orig:,} words, about {max(1, round(orig / READ_WPM))} min)"
    return out + "\n\n"


def ask_api(user: str) -> str:
    import anthropic

    client = anthropic.Anthropic()
    with client.beta.messages.stream(
        model=MODEL,
        max_tokens=16000,
        system=SYSTEM,
        messages=[{"role": "user", "content": user}],
        thinking={"type": "adaptive"},
        output_config={"effort": "medium"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    ) as stream:
        msg = stream.get_final_message()
    if msg.stop_reason not in ("end_turn", "stop_sequence"):
        raise RuntimeError(f"stopped early: {msg.stop_reason}")
    return "".join(b.text for b in msg.content if b.type == "text")


def write_body(meta: dict, paras: list[str], source: str) -> str:
    user = "\n\n".join([
        f"## Source: {meta.get('title', '')} ({meta.get('site', '')})",
        "## Video narration, one paragraph per scene", "\n\n".join(paras),
        "## Source text (for checking names and numbers only)", source[:150_000],
        "## Task", "Write the summary.",
    ])
    if claude_backend() == "cli":
        try:
            text, _ = claude_print(SYSTEM, [{"type": "text", "text": user}], MODEL, "medium")
        except RuntimeError as e:
            if not os.environ.get("ANTHROPIC_API_KEY"):
                raise
            log(f"summary: {e}; using ANTHROPIC_API_KEY instead")
            text = ask_api(user)
    else:
        text = ask_api(user)
    text = re.sub(r"^```(?:markdown|md)?\s*|\s*```$", "", text.strip()).strip()
    text = re.sub(r"^# .*\n+", "", text)  # the title comes from the header
    if len(text.split()) < 50:
        raise RuntimeError("reply too short")
    return text


def summarize(job: Path) -> Path:
    meta = read_json(job / "source" / "meta.json")
    paras = narration(read_json(job / "script.json"))
    src = job / "source" / "content.md"
    load_env()
    try:
        body = write_body(meta, paras, src.read_text() if src.exists() else "")
    except Exception as e:  # no key, no network, odd reply: still leave a readable file
        log(f"summary: Claude call failed ({e}); writing the plain narration instead")
        body = "\n\n".join(paras)
    OUTPUT.mkdir(exist_ok=True)
    dst = OUTPUT / f"{job.name}.md"
    dst.write_text(header(meta, body) + body + "\n")
    return dst


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("job", type=Path)
    a = ap.parse_args()
    job = a.job.resolve()
    if not job.is_dir():
        job = (ROOT / "videos" / a.job).resolve()
    print(summarize(job))


if __name__ == "__main__":
    main()
