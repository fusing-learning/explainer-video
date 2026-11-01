#!/usr/bin/env python3
"""Turn a job's script.json into a narrated explainer video.

    build.py <job>               validate -> voice -> align -> timeline -> render -> QA sheet -> summary
    build.py <job> --check       validate the script only
    build.py <job> --stills      voice + timeline, then render one still per scene (fast layout check)
    build.py <job> --draft       half-resolution render (faster)
    build.py <job> --no-render   stop after timeline.json
    build.py <job> --format vertical|landscape   only one of the two videos (default: both)

Re-running only re-synthesizes scenes whose narration changed (audio is cached by hash).
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import difflib
import hashlib
import json
import re
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import OUTPUT, RENDERER, ROOT, audio_duration, file_lock, log, read_json, transcribe, write_json  # noqa: E402
import voice as tts  # noqa: E402

FPS = 30
LEAD_IN = 0.6  # silence before the first line
PRE = 0.35  # a scene appears this long before its narration starts
GAP = 0.7  # default pause between scenes
TAIL = 0.9  # after the last line, before the outro
OUTRO = 4.0
WPS = 2.6  # rough narration speed, words per second

# format -> (composition, render scale, file suffix). Both share timeline.json. The vertical
# composition is laid out at 900x1600 and scaled to 1080x1920 (see renderer/src/lib/theme.ts).
FORMATS = {"landscape": ("Explainer", 1.0, ""), "vertical": ("ExplainerVertical", 1.2, "-vertical")}

REQUIRED = {
    "headline": ["lines"], "text": ["text"], "quote": ["text"], "takeaway": ["text"], "points": ["items"],
    "compare": ["left", "right"], "cards": ["items"], "table": ["columns", "rows"], "image": ["src"],
    "stat": ["value"], "bars": ["bars"], "series": ["values"], "waffle": ["total"], "blocks": ["count"],
    "spark": ["values"], "timeline": [], "chips": ["items"], "flow": ["steps"], "network": [],
}
CUE_KEYS = {"at", "subAt", "chartAt", "belowAt", "legendAt", "kickerAt", "focusAt", "leftAt", "rightAt", "until", "noteAt"}


# ---------------------------------------------------------------- validation
def line_text(l) -> str:
    return l["text"] if isinstance(l, dict) else str(l)


def line_say(l) -> str:
    return (l.get("say") or l["text"]) if isinstance(l, dict) else str(l)


def validate(script: dict, job: Path) -> tuple[list[str], list[str]]:
    errs, warns = [], []
    scenes = script.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        return ["script.scenes must be a non-empty list"], []
    ids = set()
    total_words = 0
    for i, s in enumerate(scenes):
        where = f"scene {i} ({s.get('id', '?')})"
        sid = s.get("id") or f"s{i}"
        if sid in ids:
            errs.append(f"{where}: duplicate id")
        ids.add(sid)
        lines = s.get("lines") or []
        if not lines:
            errs.append(f"{where}: needs at least one narration line")
        for l in lines:
            t = line_text(l)
            total_words += len(t.split())
            if len(t) > 115:
                warns.append(f"{where}: caption is {len(t)} chars, split it (max ~110): {t[:60]}...")
        v = s.get("visual")
        if not isinstance(v, dict) or "type" not in v:
            errs.append(f"{where}: visual must be an object with a type")
            continue
        typ = v["type"]
        if typ not in REQUIRED:
            errs.append(f"{where}: unknown visual type {typ!r} (known: {', '.join(REQUIRED)})")
            continue
        for k in REQUIRED[typ]:
            if k not in v:
                errs.append(f"{where}: {typ} visual needs {k!r}")
        if typ == "image" and "src" in v and not (job / v["src"]).exists():
            errs.append(f"{where}: image {v['src']} not found in the job folder")
        if typ == "image" and not str(v.get("src", "")).startswith(("source/images/", "assets/")):
            errs.append(f"{where}: image src must live under source/images/ or assets/")
        if typ == "stat" and isinstance(v.get("chart"), dict):
            ct = v["chart"].get("type")
            if ct not in REQUIRED:
                errs.append(f"{where}: stat.chart has unknown type {ct!r}")
        check_cues(v, len(lines), where, warns)
    est = total_words / WPS
    if est > 330:
        warns.append(f"~{est:.0f}s of narration ({total_words} words); aim for 90-240s unless asked for longer")
    return errs, warns


def check_cues(obj, n_lines: int, where: str, warns: list[str]) -> None:
    if isinstance(obj, dict):
        for k, val in obj.items():
            if k in CUE_KEYS and isinstance(val, (int, float)) and val > n_lines:
                warns.append(f"{where}: {k}={val} is past the last line ({n_lines} lines)")
            check_cues(val, n_lines, where, warns)
    elif isinstance(obj, list):
        for x in obj:
            check_cues(x, n_lines, where, warns)


# ---------------------------------------------------------------- voice
def scene_text(s: dict) -> str:
    return " ".join(line_say(l).strip() for l in s["lines"])


def synth_scenes(script: dict, job: Path, provider: str) -> list[Path]:
    voice = script.get("voice", tts.DEFAULT_VOICE)
    style = script.get("style", tts.DEFAULT_STYLE)
    model = script.get("tts_model", tts.DEFAULT_MODEL)
    adir = job / "audio"
    adir.mkdir(exist_ok=True)
    jobs = []
    for i, s in enumerate(script["scenes"]):
        text = scene_text(s)
        h = hashlib.sha1(f"{provider}|{model}|{voice}|{style}|{text}".encode()).hexdigest()[:10]
        out = adir / f"{i:02d}-{h}.wav"
        jobs.append((i, text, out))

    def work(item):
        i, text, out = item
        if out.exists():
            return out
        for attempt in range(3):
            raw = out.with_suffix(".raw.wav")
            tts.synthesize(text, raw, voice=voice, style=style, provider=provider, model=model)
            tts.trim_silence(raw, out)
            raw.unlink(missing_ok=True)
            dur = audio_duration(out)
            exp = len(text.split()) / WPS
            if 0.45 * exp < dur < 2.2 * exp + 2:
                log(f"  voice {i:02d}: {dur:.1f}s")
                return out
            log(f"  voice {i:02d}: suspicious length {dur:.1f}s for ~{exp:.1f}s of text, retrying")
            out.unlink(missing_ok=True)
        tts.synthesize(text, out.with_suffix(".raw.wav"), voice=voice, style=style, provider=provider, model=model)
        tts.trim_silence(out.with_suffix(".raw.wav"), out)
        return out

    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        paths = list(ex.map(work, jobs))
    # drop stale clips from earlier versions of the script
    keep = {p.name for p in paths}
    for f in adir.glob("[0-9][0-9]-*.wav"):
        if f.name not in keep:
            f.unlink()
    return paths


# ---------------------------------------------------------------- alignment
def norm_chars(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def align_scene(lines: list[str], clip: Path, cache: Path) -> tuple[list[dict], float]:
    """Find when each line starts/ends inside a scene clip, using whisper word timings."""
    dur = audio_duration(clip)
    if cache.exists():
        words = read_json(cache)
    else:
        r = transcribe(clip, words=True)
        words = [{"w": w["word"].strip(), "s": float(w["start"]), "e": float(w["end"])}
                 for seg in r["segments"] for w in seg.get("words", [])]
        write_json(cache, words)
    # character streams
    script_chars, line_bounds = "", []
    for t in lines:
        a = len(script_chars)
        script_chars += norm_chars(t)
        line_bounds.append((a, len(script_chars)))
    trans_chars, char_word = "", []
    for wi, w in enumerate(words):
        c = norm_chars(w["w"])
        trans_chars += c
        char_word += [wi] * len(c)
    out = []
    if not words or not trans_chars:
        return proportional(lines, dur), dur
    sm = difflib.SequenceMatcher(None, script_chars, trans_chars, autojunk=False)
    mapping = {}
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            mapping[a + k] = b + k

    def to_trans(idx: int, forward: bool) -> int | None:
        rng = range(idx, len(script_chars)) if forward else range(idx, -1, -1)
        for j in rng:
            if j in mapping:
                return mapping[j]
        return None

    ratio = sm.ratio()
    for (a, b), t in zip(line_bounds, lines):
        ta = to_trans(a, True)
        tb = to_trans(max(a, b - 1), False)
        if ta is None or tb is None or tb < ta:
            out.append(None)
            continue
        wa, wb = char_word[ta], char_word[tb]
        out.append({"text": t, "start": words[wa]["s"], "end": words[wb]["e"],
                    "words": words[wa: wb + 1]})
    # fill gaps / repair order, fall back to proportional when the match is poor
    if ratio < 0.5 or any(o is None for o in out):
        prop = proportional(lines, dur)
        out = [o if (o and ratio >= 0.5) else prop[i] for i, o in enumerate(out)]
    for i in range(1, len(out)):
        if out[i]["start"] < out[i - 1]["end"] - 0.05:
            out[i]["start"] = out[i - 1]["end"]
            out[i]["end"] = max(out[i]["end"], out[i]["start"] + 0.3)
    return out, dur


def proportional(lines: list[str], dur: float) -> list[dict]:
    total = sum(max(1, len(t)) for t in lines)
    t0, out = 0.0, []
    for t in lines:
        d = dur * max(1, len(t)) / total
        out.append({"text": t, "start": t0, "end": t0 + d, "words": []})
        t0 += d
    return out


# ---------------------------------------------------------------- audio + timeline
def read_wav(p: Path) -> np.ndarray:
    with wave.open(str(p)) as w:
        assert w.getframerate() == 24000 and w.getnchannels() == 1
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)


def build_timeline(script: dict, job: Path, clips: list[Path]) -> dict:
    meta = read_json(job / "source" / "meta.json") if (job / "source" / "meta.json").exists() else {}
    sr = 24000
    pieces = [np.zeros(int(LEAD_IN * sr), dtype=np.int16)]
    t = LEAD_IN
    scenes_out = []
    starts = []
    acache = job / "audio" / "align"
    acache.mkdir(parents=True, exist_ok=True)
    for i, (s, clip) in enumerate(zip(script["scenes"], clips)):
        texts = [line_text(l) for l in s["lines"]]
        says = [line_say(l) for l in s["lines"]]
        aligned, dur = align_scene(says, clip, acache / (clip.stem + ".json"))
        for a, cap in zip(aligned, texts):
            a["text"] = cap  # captions show the written form, timing comes from the spoken form
        starts.append((t, aligned, dur))
        pieces.append(read_wav(clip))
        t += dur
        gap = float(s.get("pause", GAP)) if i < len(script["scenes"]) - 1 else TAIL
        pieces.append(np.zeros(int(gap * sr), dtype=np.int16))
        t += gap
    narration_end = t
    pieces.append(np.zeros(int(OUTRO * sr), dtype=np.int16))
    audio = np.concatenate(pieces)
    total = len(audio) / sr
    with wave.open(str(job / "audio" / "narration.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(audio.tobytes())

    f = lambda sec: int(round(sec * FPS))  # noqa: E731
    for i, (s, (a_start, aligned, dur)) in enumerate(zip(script["scenes"], starts)):
        frm = 0 if i == 0 else f(a_start - PRE)
        nxt = f(starts[i + 1][0] - PRE) if i + 1 < len(starts) else f(narration_end)
        lines = [{"text": a["text"], "start": f(a_start + a["start"]) - frm, "end": f(a_start + a["end"]) - frm,
                  "words": [{"w": w["w"], "s": f(a_start + w["s"]) - frm, "e": f(a_start + w["e"]) - frm} for w in a["words"]]}
                 for a in aligned]
        scenes_out.append({"id": s.get("id") or f"s{i}", "from": frm, "dur": nxt - frm, "title": s.get("title"),
                           "subtitle": s.get("subtitle"), "lines": lines, "visual": s["visual"]})

    source = {"title": script.get("source_title") or meta.get("title", ""), "author": meta.get("author", ""),
              "handle": meta.get("handle", ""), "site": meta.get("site", ""), "url": meta.get("url", "")}
    source.update(script.get("source", {}))
    words = meta.get("word_count", 0)
    saved = ""
    if words:
        read_min = max(1, round(words / 238))
        saved = f"{words:,} words · ~{read_min} min read → {narration_end / 60:.1f} min explainer".replace(".0 min", " min")
    outro_from = f(narration_end)
    scenes_out.append({"id": "outro", "from": outro_from, "dur": f(total) - outro_from, "lines": [],
                       "visual": {"type": "outro", **source, "saved": script.get("saved", saved)}})
    tl = {
        "fps": FPS, "width": 1920, "height": 1080, "durationInFrames": f(total), "audio": "narration.wav",
        "theme": script.get("theme") or {}, "source": source, "scenes": scenes_out,
        "captions": script.get("captions", True),
    }
    write_json(job / "timeline.json", tl)
    prepare_public(job)
    log(f"timeline: {len(scenes_out)} scenes, {total:.1f}s ({narration_end:.1f}s narration)")
    return tl


# ---------------------------------------------------------------- render + QA
def prepare_public(job: Path) -> Path:
    """Remotion copies its public dir on every render, so give it only what the video uses."""
    pub = job / "public"
    shutil.rmtree(pub, ignore_errors=True)
    (pub / "source").mkdir(parents=True)
    shutil.copy(job / "audio" / "narration.wav", pub / "narration.wav")
    if (job / "source" / "images").exists():
        shutil.copytree(job / "source" / "images", pub / "source" / "images")
    for extra in ("assets",):  # optional extra images Claude adds for a job
        if (job / extra).exists():
            shutil.copytree(job / extra, pub / extra)
    return pub


def npx(args: list[str]) -> None:
    cmd = ["npx", "--no-install", "remotion", *args]
    p = subprocess.run(cmd, cwd=RENDERER, text=True, capture_output=True)
    if p.returncode != 0:
        tail = "\n".join([l for l in (p.stdout + p.stderr).splitlines() if "│" not in l][-25:])
        raise SystemExit(f"remotion failed:\n{tail}")


CHUNK = 1800  # frames per render pass (60 s of video)


def render(job: Path, draft: bool, formats: list[str]) -> dict[str, Path]:
    """Render each format in ~60 s chunks, each in a fresh browser, then stitch and add the narration.

    A single long pass with the system Chrome stalls ~5 minutes in when the Mac is
    unattended (macOS throttles the invisible Chrome app), so no pass is allowed to
    run that long. Chunks are retried independently.
    """
    total = read_json(job / "timeline.json")["durationInFrames"]
    tmp = job / "chunks"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir()
    bundle = tmp / "bundle"
    base = ["--log=error", "--gl=swangle", "--timeout=120000", "--concurrency=6", "--muted",
            f"--props={job / 'timeline.json'}"]
    if draft:
        base += ["--crf=28"]
    n_chunks = (total + CHUNK - 1) // CHUNK
    parts: dict[str, list[Path]] = {}
    with file_lock("render"):
        npx(["bundle", "src/index.ts", f"--public-dir={job / 'public'}", f"--out-dir={bundle}", "--log=error"])
        for fmt in formats:
            comp, scale, suffix = FORMATS[fmt]
            scale *= 0.5 if draft else 1
            log(f"rendering {'draft ' if draft else ''}{fmt} video ({total} frames)...")
            parts[fmt] = []
            for k, a in enumerate(range(0, total, CHUNK)):
                b = min(total, a + CHUNK) - 1
                part = tmp / f"{fmt}{k:03d}.mp4"
                for attempt in range(3):
                    try:
                        npx(["render", str(bundle), comp, str(part), f"--frames={a}-{b}", f"--scale={scale:g}", *base])
                        break
                    except SystemExit as e:
                        if attempt == 2:
                            raise
                        log(f"  chunk {k} attempt {attempt + 1} failed, retrying: {str(e)[-200:]}")
                log(f"  chunk {k + 1}/{n_chunks} done")
                parts[fmt].append(part)
    out = {}
    for fmt, fparts in parts.items():
        out[fmt] = job / f"{'draft' if draft else 'video'}{FORMATS[fmt][2]}.mp4"
        (tmp / "parts.txt").write_text("".join(f"file '{p.name}'\n" for p in fparts))
        silent = tmp / "video.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(tmp / "parts.txt"),
                        "-c", "copy", str(silent)], check=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(silent), "-i", str(job / "public" / "narration.wav"),
                        "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", "apad", "-c:a", "aac", "-b:a", "192k",
                        "-t", f"{total / FPS:.3f}", "-movflags", "+faststart", str(out[fmt])], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    return out


def scene_probe_frames(tl: dict) -> list[tuple[str, int]]:
    """A late frame in each scene, after its reveals, before its fade."""
    out = []
    for s in tl["scenes"]:
        last = max([l["end"] for l in s["lines"]] or [s["dur"] // 2])
        fr = s["from"] + min(s["dur"] - 12, max(last - 6, int(s["dur"] * 0.8)))
        out.append((s["id"], max(s["from"], fr)))
    return out


def qa_sheet_from_video(job: Path, video: Path, tl: dict, fmt: str) -> Path:
    suffix = FORMATS[fmt][2]
    tmp = job / f"qa{suffix}"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir()
    frames = []
    for k, (sid, fr) in enumerate(scene_probe_frames(tl)):
        f = tmp / f"{k:02d}-{sid}.jpg"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{fr / FPS:.3f}", "-i", str(video), "-frames:v", "1",
                        "-vf", "scale=960:-2" if fmt == "landscape" else "scale=-2:960", str(f)], check=True)
        frames.append(f)
    return tile(frames, job / f"qa_sheet{suffix}.jpg", fmt)


def stills(job: Path, tl: dict, formats: list[str]) -> list[Path]:
    """One still per scene and format, rendered from one bundle and one browser."""
    probes = scene_probe_frames(tl)
    spec, outs = [], {}
    for fmt in formats:
        comp, scale, suffix = FORMATS[fmt]
        tmp = job / f"qa{suffix}"
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir()
        outs[fmt] = [tmp / f"{k:02d}-{sid}.jpg" for k, (sid, _) in enumerate(probes)]
        spec += [{"id": comp, "scale": scale, "frame": fr, "out": str(o)} for (_, fr), o in zip(probes, outs[fmt])]
    frames_json = job / "qa_frames.json"
    frames_json.write_text(json.dumps(spec))
    with file_lock("render"):
        p = subprocess.run(["node", "scripts/stills.mjs", str(job / "timeline.json"), str(job / "public"), str(frames_json)],
                           cwd=RENDERER, text=True, capture_output=True)
    frames_json.unlink(missing_ok=True)
    if p.returncode != 0:
        raise SystemExit("stills failed:\n" + (p.stdout + p.stderr)[-3000:])
    return [tile(outs[fmt], job / f"qa_sheet{FORMATS[fmt][2]}.jpg", fmt) for fmt in formats]


def tile(frames: list[Path], out: Path, fmt: str) -> Path:
    cols, (w, h) = (3, (640, 360)) if fmt == "landscape" else (5, (360, 640))
    rows = (len(frames) + cols - 1) // cols
    inputs = []
    for f in frames:
        inputs += ["-i", str(f)]
    layout = "|".join(f"{(k % cols) * w}_{(k // cols) * h}" for k in range(len(frames)))
    scaled = "".join(f"[{k}]scale={w}:{h}[v{k}];" for k in range(len(frames)))
    stack = "".join(f"[v{k}]" for k in range(len(frames)))
    if len(frames) == 1:
        shutil.copy(frames[0], out)
        return out
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex",
                    f"{scaled}{stack}xstack=inputs={len(frames)}:layout={layout}:fill=#202020",
                    "-frames:v", "1", str(out)], check=True)
    log(f"QA sheet: {out} ({rows} rows)")
    return out


def publish(job: Path, video: Path, fmt: str) -> Path:
    OUTPUT.mkdir(exist_ok=True)
    dst = OUTPUT / f"{job.name}{FORMATS[fmt][2]}.mp4"
    shutil.copy(video, dst)
    return dst


def summary(job: Path) -> None:
    """Write output/<job>.md next to the video. Never fails the build."""
    try:
        p = subprocess.run([sys.executable, "-W", "ignore", str(Path(__file__).with_name("summarize.py")), str(job)],
                           text=True, capture_output=True, timeout=900)
        if p.returncode == 0:
            log(f"summary: {p.stdout.strip()}")
        else:
            log(f"warning: summary failed: {p.stderr.strip()[-500:]}")
    except Exception as e:
        log(f"warning: summary failed: {e}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("job", type=Path)
    ap.add_argument("--check", action="store_true", help="validate script.json and stop")
    ap.add_argument("--stills", action="store_true", help="render one still per scene instead of the video")
    ap.add_argument("--draft", action="store_true", help="half-resolution render")
    ap.add_argument("--format", default="both", choices=["both", *FORMATS], help="which video(s) to make")
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--tts", default="gemini", choices=["gemini", "say"])
    a = ap.parse_args()
    job = a.job.resolve()
    if not job.is_dir():
        job = (ROOT / "videos" / a.job).resolve()
    script = read_json(job / "script.json")
    errs, warns = validate(script, job)
    for w in warns:
        log(f"warning: {w}")
    if errs:
        for e in errs:
            log(f"ERROR: {e}")
        raise SystemExit(1)
    if a.check:
        log("script ok")
        return
    formats = list(FORMATS) if a.format == "both" else [a.format]
    clips = synth_scenes(script, job, a.tts)
    tl = build_timeline(script, job, clips)
    if a.no_render:
        return
    if a.stills:
        for sheet in stills(job, tl, formats):
            print(sheet)
        return
    videos = render(job, a.draft, formats)
    sheets = [qa_sheet_from_video(job, video, tl, fmt) for fmt, video in videos.items()]
    # one path per line on stdout (explain.py records them in the inbox)
    if not a.draft:
        finals = [publish(job, video, fmt) for fmt, video in videos.items()]
        for final in finals:
            log(f"done: {final}")
        summary(job)
        for final in finals:
            print(final)
    else:
        for video in videos.values():
            print(video)
    for sheet in sheets:
        log(f"QA sheet: {sheet}")


if __name__ == "__main__":
    main()
