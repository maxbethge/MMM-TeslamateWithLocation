#!/usr/bin/env python3
"""Download Tesla Design Studio compositor images and trim studio padding.

Examples:

  python scripts/fetch-tesla-cgi.py --model m3 --options PPSW,W38B --out images/cars/tesla-model-3-2018-pearl-white.png --trim
  python scripts/fetch-tesla-cgi.py --model my --options PPSB,WY21P,MTY09 --out images/cars/tesla-model-y-2023-performance-deep-blue.png --trim
"""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
COMPOSITOR = "https://static-assets.tesla.com/v1/compositor/"


def compositor_url(model: str, view: str, options: str, size: int) -> str:
    codes = ",".join(part if part.startswith("$") else f"${part}" for part in options.split(",") if part.strip())
    query = urllib.parse.urlencode(
        {
            "model": model,
            "view": view,
            "size": str(size),
            "options": codes,
            "bkba_opt": "1",
        }
    )
    return f"{COMPOSITOR}?{query}"


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = resp.read()
            content_type = resp.headers.get("Content-Type", "")
    except urllib.error.HTTPError as err:
        raise SystemExit(f"Download failed ({err.code}): {url}") from err
    except urllib.error.URLError as err:
        raise SystemExit(f"Download failed: {err.reason}") from err
    if len(data) < 2000 or "html" in content_type.lower() or "json" in content_type.lower():
        raise SystemExit(f"Not an image ({len(data)} bytes, {content_type}): {url}")
    dest.write_bytes(data)
    print(f"wrote {dest} ({len(data)} bytes, {content_type})")


def knock_out_studio(im, threshold: int = 246):
    """Tesla compositor often bakes a near-white studio backdrop even with bkba_opt=1."""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r >= threshold and g >= threshold and b >= threshold:
                px[x, y] = (r, g, b, 0)
            elif abs(r - g) < 8 and abs(g - b) < 8 and r >= threshold - 12:
                px[x, y] = (r, g, b, 0)
    return im


def trim_padding(path: Path, margin: int = 16, threshold: int = 12) -> None:
    try:
        from PIL import Image
    except ImportError:
        print("skip --trim (install Pillow: pip install pillow)", file=sys.stderr)
        return

    im = Image.open(path).convert("RGBA")
    im = knock_out_studio(im)
    w, h = im.size
    px = im.load()
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 10 and (r > threshold or g > threshold or b > threshold):
                if x < x0:
                    x0 = x
                if y < y0:
                    y0 = y
                if x > x1:
                    x1 = x
                if y > y1:
                    y1 = y
    if x1 < 0:
        print(f"skip trim (empty image): {path}")
        return
    box = (
        max(0, x0 - margin),
        max(0, y0 - margin),
        min(w, x1 + 1 + margin),
        min(h, y1 + 1 + margin),
    )
    cropped = im.crop(box)
    cropped.save(path, "PNG")
    print(f"trimmed {path.name}: {w}x{h} -> {cropped.size[0]}x{cropped.size[1]} (margin {margin}px)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", required=True, help="Tesla compositor model: m3, my, ms, mx")
    parser.add_argument("--view", default="STUD_3QTR")
    parser.add_argument("--options", required=True, help="Comma-separated option codes, e.g. PPSW,W38B")
    parser.add_argument("--size", type=int, default=1440)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--trim", action="store_true")
    parser.add_argument("--url", help="Use a full compositor URL instead of building one")
    args = parser.parse_args()
    url = args.url or compositor_url(args.model, args.view, args.options, args.size)
    print(url)
    download(url, args.out)
    if args.trim:
        trim_padding(args.out)


if __name__ == "__main__":
    main()
