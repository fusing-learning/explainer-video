#!/usr/bin/env python3
"""End to end without a Claude Code session: fetch -> write script (Claude API) -> build.

    explain <url-or-file> [...]       make a video for each
    explain --inbox                   process unchecked items in inbox.md
    options: --minutes N  --notes "..."  --draft  --format both|landscape|vertical

Paywalled pages need a browser read, which only a Claude Code session can do
(through Chrome); those are skipped and marked in the inbox.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ROOT, log, read_json  # noqa: E402

PY = [sys.executable, "-W", "ignore"]
HERE = Path(__file__).resolve().parent
INBOX = ROOT / "inbox.md"
ITEM = re.compile(r"^(\s*[-*]\s*)\[( |x|X)\]\s*(\S+)(.*)$")


def step(args: list[str]) -> list[str]:
    """Run a pipeline script; returns its stdout lines."""
    p = subprocess.run(PY + args, text=True, stdout=subprocess.PIPE)
    if p.returncode != 0:
        raise RuntimeError(f"{Path(args[0]).name} failed (exit {p.returncode})")
    return p.stdout.strip().splitlines() or [""]


def rel(detail: str) -> str:
    """Paths (one per line) relative to the project, comma-joined."""
    return ", ".join(str(Path(d).relative_to(ROOT)) if d.startswith(str(ROOT)) else d for d in detail.splitlines())


def make(target: str, minutes: float, notes: str, draft: bool, fmt: str) -> tuple[str, str]:
    """Returns (status, detail): ("done", mp4s, one per line) | ("browser", job) | ("error", message)."""
    try:
        job = Path(step([str(HERE / "fetch.py"), target])[-1])
        meta = read_json(job / "source" / "meta.json")
        if meta.get("needs_browser"):
            return "browser", str(job)
        ws = [str(HERE / "write_script.py"), str(job)]
        if minutes:
            ws += ["--minutes", str(minutes)]
        if notes:
            ws += ["--notes", notes]
        step(ws)
        out = step([str(HERE / "build.py"), str(job), "--format", fmt] + (["--draft"] if draft else []))
        return "done", "\n".join(out)
    except Exception as e:  # keep going with the rest of the batch
        return "error", str(e)


def run_inbox(a) -> None:
    if not INBOX.exists():
        raise SystemExit("no inbox.md")
    lines = INBOX.read_text().splitlines()
    todo = [(i, m) for i, l in enumerate(lines) if (m := ITEM.match(l)) and m.group(2) == " " and "needs browser" not in l]
    log(f"{len(todo)} item(s) to process")
    for i, m in todo:
        target = m.group(3)
        log(f"\n=== {target}")
        status, detail = make(target, a.minutes, a.notes, a.draft, a.format)
        if status == "done":
            lines[i] = f"{m.group(1)}[x] {target} → {rel(detail)}"
        elif status == "browser":
            lines[i] = f"{m.group(1)}[ ] {target}  (needs browser: ask Claude Code to make it, job {rel(detail)})"
        else:
            lines[i] = f"{m.group(1)}[ ] {target}  (failed: {detail})"
        INBOX.write_text("\n".join(lines) + "\n")  # save progress after every item
        log(f"--> {status}: {rel(detail)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="*")
    ap.add_argument("--inbox", action="store_true")
    ap.add_argument("--minutes", type=float, default=0)
    ap.add_argument("--notes", default="")
    ap.add_argument("--draft", action="store_true")
    ap.add_argument("--format", default="both", choices=["both", "landscape", "vertical"])
    a = ap.parse_args()
    if a.inbox:
        run_inbox(a)
        return
    if not a.targets:
        ap.error("give one or more URLs/files, or --inbox")
    failed = 0
    for t in a.targets:
        log(f"\n=== {t}")
        status, detail = make(t, a.minutes, a.notes, a.draft, a.format)
        print(f"{status}\t{t}\t{', '.join(detail.splitlines())}")
        failed += status != "done"
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
