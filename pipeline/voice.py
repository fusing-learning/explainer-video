"""Text-to-speech: Gemini TTS first, macOS `say` as an offline fallback.

Every function returns a path to a 24 kHz mono 16-bit WAV.
"""
from __future__ import annotations

import base64
import os
import random
import subprocess
import tempfile
import time
from pathlib import Path

import requests

from common import load_env, log, rate_limit, run

GEMINI = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-3.8-flash-tts"
FALLBACK_MODEL = "gemini-2.5-pro-preview-tts"
DEFAULT_VOICE = "Charon"
DEFAULT_STYLE = "calm, clear, engaged explainer narrator"


class TTSError(RuntimeError):
    pass


def _key() -> str:
    load_env()
    k = os.environ.get("GEMINI_API_KEY", "")
    if not k:
        raise TTSError("GEMINI_API_KEY missing from .env")
    return k


RPM = int(os.environ.get("GEMINI_TTS_RPM", "9"))  # the account's TTS tier allows 10 requests/minute


def _post(url: str, body: dict, timeout: int = 180) -> dict:
    """POST with retries on rate limits and transient errors."""
    delay = 8.0
    for attempt in range(6):
        rate_limit("gemini-tts", RPM)
        try:
            r = requests.post(url, json=body, timeout=timeout,
                              headers={"x-goog-api-key": _key(), "Content-Type": "application/json"})
        except requests.RequestException as e:
            err = str(e)
        else:
            if r.status_code == 200:
                return r.json()
            err = f"HTTP {r.status_code}: {r.text[:300]}"
            if r.status_code not in (429, 500, 502, 503, 504):
                raise TTSError(err)
        log(f"  tts retry {attempt + 1} after {delay:.0f}s ({err[:120]})")
        time.sleep(delay + random.random())
        delay *= 2
    raise TTSError(err)


def _write_audio(data: bytes, mime: str, out: Path) -> Path:
    if "wav" in mime.lower() or data[:4] == b"RIFF":
        raw = out.with_suffix(".src.wav")
        raw.write_bytes(data)
        fmt = []
    else:  # headerless L16 PCM
        raw = out.with_suffix(".src.pcm")
        raw.write_bytes(data)
        fmt = ["-f", "s16le", "-ar", "24000", "-ac", "1"]
    run(["ffmpeg", "-v", "error", "-y", *fmt, "-i", str(raw), "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", str(out)])
    raw.unlink(missing_ok=True)
    return out


def gemini_tts(text: str, out: Path, voice: str = DEFAULT_VOICE, style: str = DEFAULT_STYLE,
               model: str = DEFAULT_MODEL) -> Path:
    # The interactions API takes a short style note separately from the transcript,
    # so the note is never read aloud.
    try:
        body = {
            "model": model,
            "input": [{"type": "user_input", "content": [{
                "type": "text", "text": text,
                "annotations": [{"type": "speech_metadata", "style": style}] if style else [],
            }]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": voice}]},
        }
        d = _post(f"{GEMINI}/interactions", body)
        for step in d.get("steps", []):
            for c in step.get("content", []):
                if c.get("type") == "audio" and c.get("data"):
                    return _write_audio(base64.b64decode(c["data"]), c.get("mime_type", ""), out)
        raise TTSError(f"no audio in interactions response (status={d.get('status')})")
    except TTSError as e:
        log(f"  interactions TTS failed ({e}); trying generateContent")
    # Plain transcript through generateContent (no style control).
    for m in (model, FALLBACK_MODEL):
        try:
            d = _post(f"{GEMINI}/models/{m}:generateContent", {
                "contents": [{"parts": [{"text": text}]}],
                "generationConfig": {"responseModalities": ["AUDIO"],
                                     "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}},
            })
            part = d["candidates"][0]["content"]["parts"][0]["inlineData"]
            return _write_audio(base64.b64decode(part["data"]), part.get("mimeType", ""), out)
        except (TTSError, KeyError, IndexError) as e:
            log(f"  generateContent {m} failed: {e}")
    raise TTSError("all Gemini TTS attempts failed")


def say_tts(text: str, out: Path, voice: str = "") -> Path:
    with tempfile.TemporaryDirectory() as td:
        aiff = Path(td) / "a.aiff"
        cmd = ["say", "-o", str(aiff)]
        if voice:
            cmd += ["-v", voice]
        subprocess.run(cmd + [text], check=True)
        run(["ffmpeg", "-v", "error", "-y", "-i", str(aiff), "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", str(out)])
    return out


def synthesize(text: str, out: Path, voice: str = DEFAULT_VOICE, style: str = DEFAULT_STYLE,
               provider: str = "gemini", model: str = DEFAULT_MODEL) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    if provider == "say":
        return say_tts(text, out)
    try:
        return gemini_tts(text, out, voice=voice, style=style, model=model)
    except TTSError as e:
        log(f"  Gemini TTS unavailable ({e}); falling back to macOS say")
        return say_tts(text, out)


def trim_silence(src: Path, dst: Path, pad: float = 0.05) -> Path:
    """Cut leading/trailing silence so pauses between scenes are under our control."""
    flt = (f"silenceremove=start_periods=1:start_threshold=-45dB:start_silence={pad},"
           f"areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence={pad},areverse")
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", flt, "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", str(dst)])
    return dst
