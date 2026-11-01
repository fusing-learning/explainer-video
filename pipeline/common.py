"""Shared helpers for the explainer-video pipeline."""
from __future__ import annotations

import contextlib
import fcntl
import json
import os
import re
import subprocess
import sys
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
