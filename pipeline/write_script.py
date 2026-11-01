#!/usr/bin/env python3
"""Write a job's script.json with the Claude API (unattended mode).

    write_script.py <job> [--minutes 2.5] [--notes "focus on X"]

Claude Code sessions write script.json directly; this is for batch/CLI runs
without a session. Uses the same guide (prompts/script_guide.md), sends the
article text plus its images, validates the result, and asks for one repair
round when validation fails.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ROOT, load_env, log, read_json, write_json  # noqa: E402
from build import validate  # noqa: E402

MODEL = "claude-opus-5-5"
GUIDE = Path(__file__).resolve().parent / "prompts" / "script_guide.md"
MAX_IMAGES = 20

SYSTEM_INTRO = """You turn articles, posts, papers and transcripts into scripts for narrated explainer videos.
You will receive the source text, metadata, and the source's images. Write the video script as a single JSON
object following the guide below. Reply with only that JSON object inside one ```json fenced block.

"""


def image_blocks(job: Path) -> list[dict]:
    from PIL import Image

    idx_path = job / "source" / "images.json"
    idx = read_json(idx_path) if idx_path.exists() else []
    blocks = []
    for im in idx[:MAX_IMAGES]:
        f = job / "source" / im["file"]
        try:
            with Image.open(f) as img:
                img = img.convert("RGB")
                img.thumbnail((1568, 1568))
                buf = io.BytesIO()
                img.save(buf, "JPEG", quality=85)
        except Exception as e:
            log(f"  skipping {f.name}: {e}")
            continue
        label = f"Image source/{im['file']} ({im.get('width')}x{im.get('height')})"
        if im.get("alt") or im.get("caption"):
            label += f" - alt/caption: {im.get('caption') or im.get('alt')}"
        blocks.append({"type": "text", "text": label})
        blocks.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                   "data": base64.standard_b64encode(buf.getvalue()).decode()}})
    return blocks


def extract_json(text: str) -> dict:
    m = re.search(r"```json\s*(\{.*\})\s*```", text, re.S) or re.search(r"(\{.*\})", text, re.S)
    if not m:
        raise ValueError("no JSON object in the reply")
    return json.loads(m.group(1))


def ask(client, system: list[dict], messages: list[dict]):
    with client.beta.messages.stream(
        model=MODEL,
        max_tokens=64000,
        system=system,
        messages=messages,
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    ) as stream:
        msg = stream.get_final_message()
    if msg.stop_reason == "refusal":
        raise SystemExit(f"Claude declined this source: {getattr(msg.stop_details, 'explanation', '')}")
    if msg.stop_reason == "max_tokens":
        raise SystemExit("reply was cut off at max_tokens")
    text = "".join(b.text for b in msg.content if b.type == "text")
    return msg, text


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("job", type=Path)
    ap.add_argument("--minutes", type=float, default=0, help="target length (default: guide's 1.5-3 min)")
    ap.add_argument("--notes", default="", help="extra direction for this video")
    a = ap.parse_args()
    job = a.job.resolve()
    load_env()
    import anthropic

    client = anthropic.Anthropic()
    meta = read_json(job / "source" / "meta.json")
    content = (job / "source" / "content.md").read_text()
    links = read_json(job / "source" / "links.json") if (job / "source" / "links.json").exists() else []
    system = [{"type": "text", "text": SYSTEM_INTRO + GUIDE.read_text(), "cache_control": {"type": "ephemeral"}}]
    ask_text = [
        "## Source metadata", json.dumps(meta, indent=1, ensure_ascii=False),
        "## Links in the source", json.dumps(links[:60], ensure_ascii=False),
        "## Source text", content,
        "## Task",
        "Write script.json for this source. Image paths in visuals must be exactly as labelled above "
        "(source/images/NN.ext). Use the images to get exact numbers and to choose visuals.",
    ]
    if meta.get("needs_browser"):
        ask_text.append("Note: the text may be incomplete (paywall or blocked fetch). Cover only what is here and keep it short.")
    if a.minutes:
        ask_text.append(f"Target length: about {a.minutes:g} minutes of narration (~{int(a.minutes * 156)} words).")
    if a.notes:
        ask_text.append(f"Direction from the viewer: {a.notes}")
    messages = [{"role": "user", "content": image_blocks(job) + [{"type": "text", "text": "\n\n".join(ask_text)}]}]

    log(f"writing script with {MODEL}...")
    for attempt in range(3):
        msg, text = ask(client, system, messages)
        try:
            script = extract_json(text)
            errs, warns = validate(script, job)
        except (ValueError, json.JSONDecodeError) as e:
            errs, warns, script = [f"could not parse JSON: {e}"], [], None
        u = msg.usage
        log(f"  attempt {attempt + 1}: {u.input_tokens} in (+{u.cache_read_input_tokens or 0} cached), {u.output_tokens} out; "
            f"{len(errs)} errors, {len(warns)} warnings")
        if script is not None and not errs:
            write_json(job / "script.json", script)
            for w in warns:
                log(f"  warning: {w}")
            print(job / "script.json")
            return
        messages += [
            {"role": "assistant", "content": msg.content},
            {"role": "user", "content": "The script failed validation. Fix these and reply with the full corrected JSON:\n- "
             + "\n- ".join(errs + warns)},
        ]
    raise SystemExit("could not produce a valid script after 3 attempts")


if __name__ == "__main__":
    main()
