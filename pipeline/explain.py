#!/usr/bin/env python3
"""End to end without a Claude Code session: fetch -> write script (Claude API) -> build.

    explain <url-or-file> [...]       make a video for each
    explain --inbox                   process unchecked items in inbox.md
    options: --minutes N  --notes "..."  --draft

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


def step(args: list[str]) -> str:
    p = subprocess.run(PY + args, text=True, stdout=subprocess.PIPE)
    if p.returncode != 0:
        raise RuntimeError(f"{Path(args[0]).name} failed (exit {p.returncode})")
    return p.stdout.strip().splitlines()[-1] if p.stdout.strip() else ""


def make(target: str, minutes: float, notes: str, draft: bool) -> tuple[str, str]:
    """Returns (status, detail): ("done", mp4) | ("browser", job) | ("error", message)."""
    try:
        job = Path(step([str(HERE / "fetch.py"), target]))
        meta = read_json(job / "source" / "meta.json")
        if meta.get("needs_browser"):
            return "browser", str(job)
        ws = [str(HERE / "write_script.py"), str(job)]
        if minutes:
            ws += ["--minutes", str(minutes)]
        if notes:
            ws += ["--notes", notes]
        step(ws)
        out = step([str(HERE / "build.py"), str(job)] + (["--draft"] if draft else []))
        return "done", out
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
        status, detail = make(target, a.minutes, a.notes, a.draft)
        rel = Path(detail).relative_to(ROOT) if detail.startswith(str(ROOT)) else detail
        if status == "done":
            lines[i] = f"{m.group(1)}[x] {target} → {rel}"
        elif status == "browser":
            lines[i] = f"{m.group(1)}[ ] {target}  (needs browser: ask Claude Code to make it, job {rel})"
        else:
            lines[i] = f"{m.group(1)}[ ] {target}  (failed: {detail})"
        INBOX.write_text("\n".join(lines) + "\n")  # save progress after every item
        log(f"--> {status}: {rel}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="*")
    ap.add_argument("--inbox", action="store_true")
    ap.add_argument("--minutes", type=float, default=0)
    ap.add_argument("--notes", default="")
    ap.add_argument("--draft", action="store_true")
    a = ap.parse_args()
    if a.inbox:
        run_inbox(a)
        return
    if not a.targets:
        ap.error("give one or more URLs/files, or --inbox")
    failed = 0
    for t in a.targets:
        log(f"\n=== {t}")
        status, detail = make(t, a.minutes, a.notes, a.draft)
        print(f"{status}\t{t}\t{detail}")
        failed += status != "done"
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
