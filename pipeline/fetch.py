#!/usr/bin/env python3
"""Fetch a source into a new job folder.

    fetch.py <url-or-path>                 create videos/<date>-<slug>/source/
    fetch.py --job DIR --add-images URL... download extra images into an existing job
    fetch.py --job DIR --text FILE         replace content.md (e.g. text read via Chrome)

A job's source/ folder holds:
    content.md    the readable text (article, transcript, PDF text...)
    meta.json     title, author, site, url, kind, word_count, needs_browser, notes
    images/       figures from the source, listed in images.json
    links.json    links found in the body
Prints the job path on stdout.
"""
from __future__ import annotations

import argparse
import html as htmlmod
import json
import mimetypes
import re
import shutil
import sys
import tempfile
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import UA, log, new_job_dir, read_json, run, to_wav16k, transcribe, write_json  # noqa: E402

PAYWALL_MARKERS = [
    '"isaccessibleforfree": false',
    '"isaccessibleforfree":false',
    '"isaccessibleforfree":"false"',
    "subscribe to continue",
    "subscribe to read",
    "this post is for paid subscribers",
    "this post is for paying subscribers",
    "become a member to read",
    "member-only story",
    "create a free account to continue",
    "sign in to continue reading",
    "already a subscriber?",
]
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic"}
DOC_EXT = {".docx", ".doc", ".rtf", ".rtfd", ".odt", ".webarchive"}

# Prefer the venv's yt-dlp (kept current, with curl-cffi for sites that need impersonation).
_venv_ytdlp = Path(__file__).resolve().parent.parent / ".venv" / "bin" / "yt-dlp"
YTDLP = str(_venv_ytdlp) if _venv_ytdlp.exists() else "yt-dlp"

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})


# ---------------------------------------------------------------- helpers
class Source:
    def __init__(self):
        self.title = ""
        self.meta: dict = {}
        self.md = ""
        self.images: list[dict] = []  # {url|path, alt, caption}
        self.links: list[dict] = []
        self.notes: list[str] = []
        self.needs_browser = False

    def save(self, kind: str, url: str = "") -> Path:
        job = new_job_dir(self.title or "untitled")
        src = job / "source"
        saved = []
        for i, im in enumerate(self.images[:40], 1):
            try:
                f = save_image(im, src / "images", i)
                if f:
                    saved.append({"file": f"images/{f.name}", "alt": im.get("alt", ""),
                                  "caption": im.get("caption", ""), "url": im.get("url", "")} | image_size(f))
            except Exception as e:  # keep going, images are optional
                log(f"  image {i} failed: {e}")
        # point inline image refs at the local copies
        md = self.md
        for s in saved:
            if s["url"]:
                md = md.replace(f"]({s['url']})", f"]({s['file']})")
        (src / "content.md").write_text(md.strip() + "\n")
        write_json(src / "images.json", saved)
        write_json(src / "links.json", dedupe_links(self.links))
        meta = {
            "title": self.title,
            "url": url,
            "kind": kind,
            "word_count": len(re.findall(r"\w+", md)),
            "image_count": len(saved),
            "needs_browser": self.needs_browser,
            "notes": self.notes,
        } | self.meta
        write_json(src / "meta.json", meta)
        return job


def dedupe_links(links):
    seen, out = set(), []
    for l in links:
        u = l.get("url", "")
        if u and u not in seen and not u.startswith(("#", "javascript:", "mailto:")):
            seen.add(u)
            out.append(l)
    return out


def save_image(im: dict, folder: Path, i: int) -> Path | None:
    if im.get("path"):
        p = Path(im["path"])
        dst = folder / f"{i:02d}{p.suffix.lower()}"
        shutil.copy(p, dst)
        return convert_heic(dst)
    url = im["url"]
    r = session.get(url, timeout=30)
    r.raise_for_status()
    ctype = r.headers.get("content-type", "").split(";")[0]
    if not ctype.startswith("image/"):
        return None
    if len(r.content) < 4000:  # icons, spacers, tracking pixels
        return None
    ext = mimetypes.guess_extension(ctype) or Path(urlparse(url).path).suffix or ".img"
    ext = {".jpe": ".jpg", ".jpeg": ".jpg"}.get(ext, ext)
    dst = folder / f"{i:02d}{ext}"
    dst.write_bytes(r.content)
    if ext in (".svg", ".avif", ".heic", ".img"):
        return convert_to_png(dst)
    return dst


def convert_heic(p: Path) -> Path:
    return convert_to_png(p) if p.suffix in (".heic", ".avif") else p


def convert_to_png(p: Path) -> Path | None:
    out = p.with_suffix(".png")
    try:
        run(["sips", "-s", "format", "png", str(p), "--out", str(out)])
        p.unlink(missing_ok=True)
        return out
    except Exception:
        return p


def image_size(p: Path) -> dict:
    try:
        from PIL import Image

        with Image.open(p) as im:
            return {"width": im.width, "height": im.height}
    except Exception:
        return {}


def md_images(md: str, base: str) -> list[dict]:
    out = []
    for alt, src in re.findall(r"!\[([^\]]*)\]\(([^)\s]+)[^)]*\)", md):
        out.append({"url": urljoin(base, src), "alt": alt})
    return out


def md_links(md: str, base: str) -> list[dict]:
    return [{"text": t, "url": urljoin(base, u)} for t, u in re.findall(r"(?<!!)\[([^\]]+)\]\(([^)\s]+)[^)]*\)", md)]


# ---------------------------------------------------------------- X / Twitter
X_RE = re.compile(r"https?://(?:www\.|mobile\.)?(?:x|twitter|fxtwitter|vxtwitter)\.com/(?:[^/]+|i(?:/web)?)/status/(\d+)")


def fetch_x(url: str) -> tuple[Source, str]:
    tid = X_RE.search(url).group(1)
    d = session.get(f"https://api.fxtwitter.com/status/{tid}", timeout=30).json()
    t = d.get("tweet")
    if not t:
        raise RuntimeError(f"fxtwitter returned no tweet: {d.get('message')}")
    s = Source()
    a = t.get("author", {})
    s.meta = {"author": a.get("name", ""), "handle": "@" + a.get("screen_name", ""), "site": "X",
              "published": t.get("created_at", ""), "likes": t.get("likes"), "views": t.get("views")}
    if t.get("article"):
        art = t["article"]
        s.title = art.get("title", "")
        s.md, imgs, links = x_article_md(art)
        s.images, s.links = imgs, links
        return s, "x-article"

    # plain tweet (possibly linking somewhere)
    text = t.get("text", "")
    s.title = (text.split("\n")[0][:80] or f"Post by @{a.get('screen_name')}")
    parts = [f"# Post by {a.get('name')} ({s.meta['handle']})", "", text]
    q = t.get("quote")
    if q:
        parts += ["", f"> Quoting @{q.get('author', {}).get('screen_name')}: {q.get('text', '')}"]
    media = t.get("media") or {}
    for p in media.get("photos") or []:
        s.images.append({"url": x_orig(p["url"]), "alt": p.get("altText", "")})
    for v in media.get("videos") or []:
        try:
            text, frames = transcribe_url(v["url"], with_frames=True)
            parts += ["", "## Video transcript", "", text]
            s.images += frames
            s.notes.append("Tweet video transcribed locally with mlx-whisper; keyframes in images/.")
        except Exception as e:
            s.notes.append(f"Video could not be transcribed: {e}")
    s.md = "\n".join(parts)
    # A short post that points at an article: the article is the real content.
    ext = [u for u in re.findall(r"https?://\S+", text) if not re.search(r"(x|twitter)\.com|t\.co/", u)]
    if ext:
        s.links = [{"text": u, "url": u} for u in ext]
        if len(text.split()) < 60:
            s.notes.append(f"Post mainly links to {ext[0]} - consider fetching that too.")
    s.notes.append("fxtwitter returns a single post; if this is a thread, read the rest via Chrome.")
    return s, "x-post"


def x_orig(url: str | None) -> str | None:
    """pbs.twimg.com serves a downscaled copy unless asked for the original."""
    if url and "pbs.twimg.com/media/" in url and "name=" not in url:
        return url + ("&" if "?" in url else "?") + "name=orig"
    return url


def x_article_md(art: dict) -> tuple[str, list[dict], list[dict]]:
    content = art.get("content", {})
    blocks = content.get("blocks", [])
    emap = {str(e["key"]): e["value"] for e in content.get("entityMap", [])}
    media_urls = {m["media_id"]: x_orig(m.get("media_info", {}).get("original_img_url"))
                  for m in art.get("media_entities", [])}
    images, links = [], []
    cover = x_orig((art.get("cover_media") or {}).get("media_info", {}).get("original_img_url"))
    if cover:
        images.append({"url": cover, "alt": "cover image"})
    lines = [f"# {art.get('title', '')}", ""]
    ol = 0
    for b in blocks:
        typ, text = b["type"], b["text"]
        # inline links
        for r in sorted(b.get("entityRanges", []), key=lambda r: -r["offset"]):
            e = emap.get(str(r["key"]), {})
            if e.get("type") == "LINK":
                u = e["data"].get("url", "")
                frag = text[r["offset"]: r["offset"] + r["length"]]
                links.append({"text": frag, "url": u})
                text = text[: r["offset"]] + f"[{frag}]({u})" + text[r["offset"] + r["length"]:]
        if typ == "atomic":
            for r in b.get("entityRanges", []):
                e = emap.get(str(r["key"]), {})
                if e.get("type") == "MEDIA":
                    for mi in e["data"].get("mediaItems", []):
                        u = media_urls.get(mi.get("mediaId"))
                        if u:
                            cap = e["data"].get("caption", "")
                            images.append({"url": u, "alt": cap or "figure", "caption": cap})
                            lines += [f"![{cap or 'figure'}]({u})", ""]
                elif e.get("type") == "TWEET":
                    lines += [f"[embedded post {e['data'].get('tweetId', '')}]", ""]
            continue
        ol = ol + 1 if typ == "ordered-list-item" else 0
        prefix = {"header-one": "# ", "header-two": "## ", "header-three": "### ", "blockquote": "> ",
                  "unordered-list-item": "- ", "ordered-list-item": f"{ol}. "}.get(typ, "")
        lines.append(prefix + text)
        if not typ.endswith("list-item"):
            lines.append("")
    return "\n".join(lines), images, links


# ---------------------------------------------------------------- video / audio
def transcribe_url(url: str, with_frames: bool = False):
    td = Path(tempfile.mkdtemp())
    ext = re.search(r"\.(mp4|mov|webm|m4a|mp3)(?=\?|$)", url)
    if ext:  # direct media file
        f = td / f"media{ext.group(0)}"
        f.write_bytes(session.get(url, timeout=120).content)
    else:
        fmt = "b[height<=720]/b" if with_frames else "ba/b"
        run([YTDLP, "-q", "--no-playlist", "-f", fmt, "-o", str(td / "media.%(ext)s"), url])
        f = next(td.glob("media.*"))
    text = transcribe_file(f)
    if with_frames:
        return text, keyframes(f) if f.suffix in (".mp4", ".mov", ".webm", ".m4v", ".mkv") else []
    return text


def transcribe_file(f: Path) -> str:
    with tempfile.TemporaryDirectory() as td:
        wav = to_wav16k(f, Path(td) / "a.wav")
        r = transcribe(wav, words=False)
    return "\n".join(seg["text"].strip() for seg in r["segments"])


def keyframes(video: Path, n: int = 10) -> list[dict]:
    """A handful of frames so slides/diagrams in a video can be looked at."""
    td = Path(tempfile.mkdtemp())
    from common import audio_duration

    dur = max(audio_duration(video), 1)
    step = dur / (n + 1)
    out = []
    for i in range(1, n + 1):
        f = td / f"frame_{i:02d}.jpg"
        try:
            run(["ffmpeg", "-v", "error", "-y", "-ss", f"{step * i:.2f}", "-i", str(video), "-frames:v", "1",
                 "-vf", "scale=1280:-2", str(f)])
            out.append({"path": str(f), "alt": f"frame at {step * i:.0f}s"})
        except Exception:
            pass
    return out


YT_RE = re.compile(r"(youtube\.com/(watch|shorts|live)|youtu\.be/)")


def fetch_video_url(url: str) -> tuple[Source, str]:
    s = Source()
    info = json.loads(run([YTDLP, "-J", "--no-playlist", url]).stdout)
    s.title = info.get("title") or "video"
    s.meta = {"author": info.get("uploader") or info.get("channel") or "", "site": info.get("extractor_key", ""),
              "published": info.get("upload_date", ""), "duration": info.get("duration")}
    desc = info.get("description") or ""
    td = Path(tempfile.mkdtemp())
    text = ""
    # Prefer human/auto subtitles when present (fast); otherwise transcribe locally.
    try:
        run([YTDLP, "-q", "--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", "en,en-orig,en-US,en-GB",
             "--sub-format", "vtt", "-o", str(td / "subs"), url])
        vtt = next(td.glob("subs*.vtt"), None)
        if vtt:
            text = vtt_to_text(vtt.read_text())
            s.notes.append("Transcript from captions.")
            if (info.get("duration") or 0) <= 5400:  # slides and diagrams are worth a look; skip for very long videos
                run([YTDLP, "-q", "--no-playlist", "-f", "b[height<=360]/wv*[height<=360]/b", "-o", str(td / "low.%(ext)s"), url])
                low = next(td.glob("low.*"), None)
                if low:
                    s.images = keyframes(low, 12)
                    s.notes.append("Keyframes from the video saved in images/.")
    except Exception as e:
        if not text:
            log(f"  captions unavailable ({e}); transcribing instead")
    if not text:
        run([YTDLP, "-q", "--no-playlist", "-f", "b[height<=720]/b", "-o", str(td / "media.%(ext)s"), url])
        media = next(td.glob("media.*"))
        text = transcribe_file(media)
        s.images = keyframes(media)
        s.notes.append("Transcribed locally with mlx-whisper; keyframes saved in images/.")
    s.md = f"# {s.title}\n\n## Description\n\n{desc}\n\n## Transcript\n\n{text}\n"
    s.links = [{"text": u, "url": u} for u in re.findall(r"https?://\S+", desc)]
    return s, "video"


def vtt_to_text(vtt: str) -> str:
    out, last = [], ""
    for line in vtt.splitlines():
        line = re.sub(r"<[^>]+>", "", line).strip()
        if not line or "-->" in line or line.startswith(("WEBVTT", "Kind:", "Language:")) or line.isdigit():
            continue
        if line != last:
            out.append(line)
            last = line
    text = " ".join(out)
    return re.sub(r"(.{400,}?[.!?])\s", r"\1\n\n", text)


# ---------------------------------------------------------------- PDF
def pdf_title_guess(doc) -> str:
    """The biggest text on the first page is usually the title."""
    try:
        spans = [(sp["size"], sp["text"].strip()) for b in doc[0].get_text("dict")["blocks"]
                 for l in b.get("lines", []) if abs(l.get("dir", (1, 0))[1]) < 0.01  # skip rotated margin stamps
                 for sp in l.get("spans", []) if sp["text"].strip() and not sp["text"].startswith("arXiv:")]
    except Exception:
        return ""
    if not spans:
        return ""
    top = max(sz for sz, _ in spans)
    return " ".join(t for sz, t in spans if sz >= top - 0.5)[:150]


def pdf_source(path: Path, url: str = "") -> tuple[Source, str]:
    import pymupdf

    s = Source()
    doc = pymupdf.open(path)
    s.title = (doc.metadata or {}).get("title") or pdf_title_guess(doc) or path.stem
    s.meta = {"author": (doc.metadata or {}).get("author", ""), "site": "PDF", "pages": doc.page_count}
    parts = []
    td = Path(tempfile.mkdtemp())
    n_img = 0
    for pno, page in enumerate(doc, 1):
        parts.append(f"\n\n<!-- page {pno} -->\n\n" + page.get_text("text"))
        for img in page.get_images(full=True):
            if n_img >= 25:
                break
            try:
                pix = pymupdf.Pixmap(doc, img[0])
                if pix.width < 250 or pix.height < 150:
                    continue
                if pix.n - pix.alpha >= 4:
                    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                f = td / f"p{pno}_{img[0]}.png"
                pix.save(f)
                n_img += 1
                s.images.append({"path": str(f), "alt": f"figure on page {pno}"})
            except Exception:
                pass
        for l in page.get_links():
            if l.get("uri"):
                s.links.append({"text": f"page {pno}", "url": l["uri"]})
    if n_img == 0 and doc.page_count:  # scanned or vector-only figures: keep a page render
        for pno in range(min(3, doc.page_count)):
            f = td / f"page{pno + 1}.png"
            doc[pno].get_pixmap(dpi=110).save(f)
            s.images.append({"path": str(f), "alt": f"page {pno + 1} render"})
    s.md = f"# {s.title}\n" + "".join(parts)
    if len(s.md.split()) < 100:
        s.notes.append("Very little extractable text - probably scanned. Read the page renders in images/.")
    return s, "pdf"


# ---------------------------------------------------------------- web pages
def fetch_web(url: str) -> tuple[Source, str]:
    import trafilatura

    s = Source()
    try:
        r = session.get(url, timeout=30, allow_redirects=True)
    except requests.RequestException as e:
        s.title = urlparse(url).netloc
        s.needs_browser = True
        s.notes.append(f"HTTP fetch failed ({e}); read it via Chrome.")
        s.md = f"# {url}\n"
        return s, "web"
    ctype = r.headers.get("content-type", "")
    if "pdf" in ctype or url.lower().endswith(".pdf"):
        f = Path(tempfile.mkdtemp()) / "doc.pdf"
        f.write_bytes(r.content)
        return pdf_source(f, url)
    if ctype.startswith(("video/", "audio/")):
        return fetch_video_url(url)
    html = r.text
    final = r.url
    md = trafilatura.extract(html, url=final, output_format="markdown", include_images=True, include_links=True,
                             include_tables=True, include_comments=False, favor_recall=True) or ""
    m = trafilatura.extract_metadata(html, default_url=final)
    s.title = (m.title if m else "") or urlparse(final).netloc
    s.meta = {"author": (m.author if m else "") or "", "site": (m.sitename if m else "") or urlparse(final).netloc,
              "published": (m.date if m else "") or "", "final_url": final}
    og = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', html)
    if og:
        s.images.append({"url": urljoin(final, htmlmod.unescape(og.group(1))), "alt": "cover image"})
    s.images += md_images(md, final)
    s.links = md_links(md, final)
    s.md = f"# {s.title}\n\n{md}"
    words = len(md.split())
    low = html.lower()
    hits = [p for p in PAYWALL_MARKERS if p in low]
    if r.status_code in (401, 402, 403, 429) or words < 250 or hits:
        s.needs_browser = True
        why = f"status {r.status_code}" if r.status_code >= 400 else (f"paywall markers: {hits[:2]}" if hits else f"only {words} words extracted")
        s.notes.append(f"Probably incomplete ({why}). Read the full page via Chrome and replace content.md.")
    return s, "web"


# ---------------------------------------------------------------- local files
def local_source(path: Path) -> tuple[Source, str]:
    ext = path.suffix.lower()
    if ext == ".pdf":
        return pdf_source(path)
    s = Source()
    s.title = path.stem.replace("_", " ").replace("-", " ")
    s.meta = {"site": "local file", "path": str(path)}
    if ext in VIDEO_EXT:
        s.md = f"# {s.title}\n\n## Transcript\n\n{transcribe_file(path)}\n"
        if ext in {".mp4", ".mov", ".m4v", ".webm", ".mkv"}:
            s.images = keyframes(path)
        return s, "video"
    if ext in IMAGE_EXT:
        s.images = [{"path": str(path), "alt": "source image"}]
        s.md = f"# {s.title}\n\nThe source is an image (images/01). Read it visually and transcribe what matters here.\n"
        s.needs_browser = False
        s.notes.append("Image-only source: look at images/ and write content.md from it.")
        return s, "image"
    if ext in (".html", ".htm"):
        import trafilatura

        html = path.read_text(errors="ignore")
        md = trafilatura.extract(html, output_format="markdown", include_images=True, include_links=True) or ""
        m = trafilatura.extract_metadata(html)
        s.title = (m.title if m and m.title else s.title)
        s.md = f"# {s.title}\n\n{md}"
        s.images = [im for im in md_images(md, "") if im["url"].startswith("http")]
        s.links = md_links(md, "")
        return s, "html"
    if ext in DOC_EXT:
        txt = run(["textutil", "-convert", "txt", "-stdout", str(path)]).stdout
        s.md = f"# {s.title}\n\n{txt}"
        return s, "document"
    text = path.read_text(errors="ignore")
    h = re.search(r"^#\s+(.+)$", text, re.M)
    if h:
        s.title = h.group(1).strip()
    s.md = text
    s.images = [im for im in md_images(text, "") if im["url"].startswith("http")]
    s.links = md_links(text, "")
    return s, "text"


# ---------------------------------------------------------------- entry points
def fetch(target: str) -> Path:
    p = Path(target).expanduser()
    if p.exists():
        s, kind = local_source(p.resolve())
        url = ""
    else:
        url = target if re.match(r"https?://", target) else "https://" + target
        if X_RE.search(url):
            s, kind = fetch_x(url)
        elif YT_RE.search(url) or re.search(r"\.(mp4|mov|webm|mp3|m4a)(\?|$)", url) or "vimeo.com" in url:
            s, kind = fetch_video_url(url)
        else:
            s, kind = fetch_web(url)
    job = s.save(kind, url)
    log(f"fetched {kind}: {s.title!r} -> {job}")
    meta = read_json(job / "source" / "meta.json")
    log(f"  {meta['word_count']} words, {meta['image_count']} images, needs_browser={meta['needs_browser']}")
    for n in meta["notes"]:
        log(f"  note: {n}")
    return job


def add_images(job: Path, urls: list[str]) -> None:
    src = job / "source"
    idx_path = src / "images.json"
    idx = read_json(idx_path) if idx_path.exists() else []
    start = len(idx) + 1
    for i, u in enumerate(urls, start):
        try:
            f = save_image({"url": u} if u.startswith("http") else {"path": u}, src / "images", i)
            if f:
                idx.append({"file": f"images/{f.name}", "alt": "", "caption": "", "url": u} | image_size(f))
                log(f"  saved {f.name}")
        except Exception as e:
            log(f"  {u}: {e}")
    write_json(idx_path, idx)
    meta = read_json(src / "meta.json")
    meta["image_count"] = len(idx)
    write_json(src / "meta.json", meta)


def replace_text(job: Path, text_file: Path) -> None:
    src = job / "source"
    text = Path(text_file).read_text()
    (src / "content.md").write_text(text)
    meta = read_json(src / "meta.json")
    meta["word_count"] = len(re.findall(r"\w+", text))
    meta["needs_browser"] = False
    meta["notes"] = [n for n in meta.get("notes", []) if "Chrome" not in n] + ["Text replaced with a browser read."]
    write_json(src / "meta.json", meta)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", nargs="?", help="URL or local file")
    ap.add_argument("--job", type=Path, help="existing job folder")
    ap.add_argument("--add-images", nargs="+", metavar="URL")
    ap.add_argument("--text", type=Path, help="replace content.md with this file")
    a = ap.parse_args()
    if a.job:
        if a.add_images:
            add_images(a.job, a.add_images)
        if a.text:
            replace_text(a.job, a.text)
        print(a.job)
        return
    if not a.target:
        ap.error("give a URL or file")
    print(fetch(a.target))


if __name__ == "__main__":
    main()
