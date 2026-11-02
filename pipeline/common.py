"""Shared helpers for the explainer-video pipeline."""
from __future__ import annotations

import contextlib
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIDEOS = ROOT / "videos"
OUTPUT = ROOT / "output"
RENDERER = ROOT / "renderer"
CACHE = ROOT / ".cache"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
)

WHISPER_MODEL = "mlx-community/whisper-large-v3-turbo"


def load_env() -> dict[str, str]:
    """Read ROOT/.env into os.environ (without overriding) and return it."""
    env: dict[str, str] = {}
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            env[k.strip()] = v
            os.environ.setdefault(k.strip(), v)
    return env


def slugify(text: str, max_len: int = 60) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:max_len].rstrip("-") or "untitled"


def new_job_dir(title: str) -> Path:
    base = VIDEOS / f"{date.today().isoformat()}-{slugify(title)}"
    job = base
    n = 2
    while job.exists():
        job = Path(f"{base}-{n}")
        n += 1
    (job / "source" / "images").mkdir(parents=True)
    return job


def read_json(path: Path):
    return json.loads(Path(path).read_text())


def write_json(path: Path, data) -> None:
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, text=True, capture_output=True, **kw)


def log(*args) -> None:
    print(*args, file=sys.stderr, flush=True)


def to_wav16k(src: Path, dst: Path) -> Path:
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ar", "16000", "-ac", "1", str(dst)])
    return dst


def transcribe(audio: Path, words: bool = True) -> dict:
    """Local transcription with mlx-whisper. Returns the raw whisper result."""
    import warnings

    warnings.filterwarnings("ignore")
    import mlx_whisper

    return mlx_whisper.transcribe(str(audio), path_or_hf_repo=WHISPER_MODEL, word_timestamps=words)


def audio_duration(path: Path) -> float:
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    return float(out.stdout.strip())


@contextlib.contextmanager
def file_lock(name: str):
    """Cross-process lock, so parallel jobs (e.g. subagents) take turns on renders."""
    CACHE.mkdir(exist_ok=True)
    with open(CACHE / f"{name}.lock", "w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def rate_limit(name: str, per_minute: int) -> None:
    """Block until a call slot is free, shared by every process on this machine."""
    CACHE.mkdir(exist_ok=True)
    stamps = CACHE / f"{name}.json"
    while True:
        with file_lock(name):
            now = time.time()
            recent = [t for t in (json.loads(stamps.read_text()) if stamps.exists() else []) if now - t < 60]
            if len(recent) < per_minute:
                stamps.write_text(json.dumps(recent + [now]))
                return
            wait = 60 - (now - min(recent)) + 0.2
        time.sleep(wait)


def claude_backend() -> str:
    """How write_script/summarize call Claude: "cli" or "api".

    "cli" runs `claude -p` on the Claude Code login (subscription), the default when
    the claude CLI is installed. "api" uses ANTHROPIC_API_KEY. CLAUDE_BACKEND in .env
    or the environment picks one explicitly.
    """
    choice = os.environ.get("CLAUDE_BACKEND", "").strip().lower()
    if choice in ("cli", "api"):
        return choice
    if shutil.which("claude"):
        return "cli"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "api"
    raise RuntimeError("no way to call Claude: install and log in to the claude CLI, or set ANTHROPIC_API_KEY")


def cli_env() -> dict[str, str]:
    """Environment for `claude -p`, without ANTHROPIC_API_KEY so it uses its own login."""
    return {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}


def claude_print(system: str, content: list[dict], model: str, effort: str, timeout: int = 1800) -> tuple[str, dict]:
    """One turn through `claude -p` with no tools. Returns (reply text, result event).

    content is Messages API blocks (text and base64 images), sent as stream-json.
    Runs outside the project so its CLAUDE.md isn't loaded.
    """
    msg = {"type": "user", "message": {"role": "user", "content": content}}
    cmd = ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
           "--tools", "", "--no-session-persistence", "--model", model, "--effort", effort,
           "--system-prompt", system]
    try:
        p = subprocess.run(cmd, input=json.dumps(msg) + "\n", text=True, capture_output=True,
                           env=cli_env(), cwd=tempfile.gettempdir(), timeout=timeout)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"claude -p timed out after {timeout}s")
    result = None
    for line in p.stdout.splitlines():
        with contextlib.suppress(json.JSONDecodeError):
            ev = json.loads(line)
            if ev.get("type") == "result":
                result = ev
    if result is None:
        raise RuntimeError(f"claude -p failed (exit {p.returncode}): {(p.stderr or p.stdout).strip()[-300:]}")
    if result.get("is_error") or result.get("subtype") != "success":
        raise RuntimeError(f"claude -p failed: {str(result.get('result', ''))[:300]}")
    if result.get("stop_reason") not in ("end_turn", "stop_sequence"):
        raise RuntimeError(f"claude -p stopped early: {result.get('stop_reason')}")
    return result.get("result", ""), result
