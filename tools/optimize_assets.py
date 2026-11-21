#!/usr/bin/env python3
"""Optimize game assets for fast web delivery and PWA offline support.

1. Pack all 16 passive icons (64x64 RGBA) into public/assets/atlases/world.{png,json}
   as frames named `passive_<id>`.
2. Generate dark gothic PWA badge icons public/assets/ui/pwa-{192,512}.png
   from bloody_tear.png before removing PNG icons.
3. Convert all public/assets/icons/*.png to *.webp (q=86, m=6) via cwebp and
   remove the source PNGs.
4. Subset Cinzel and Noto Serif SC fonts to WOFF2 via pyftsubset, keeping total
   public/assets/fonts/ size <= 450 KB (falling back to 400+700 for Noto Serif SC
   when needed), and remove source TTFs while preserving *-OFL.txt licenses.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw

ROOT_DIR = Path(__file__).resolve().parent.parent
ATLAS_DIR = ROOT_DIR / "public" / "assets" / "atlases"
ICON_DIR = ROOT_DIR / "public" / "assets" / "icons"
FONT_DIR = ROOT_DIR / "public" / "assets" / "fonts"
UI_DIR = ROOT_DIR / "public" / "assets" / "ui"

PYFTSUBSET_BIN = "/opt/anaconda3/bin/pyftsubset"
CWEBP_BIN = "/opt/homebrew/bin/cwebp"

MAX_FONT_DIR_BYTES = 450 * 1024

PASSIVE_IDS = (
    "spinach",
    "armor",
    "hollow_heart",
    "pummarola",
    "empty_tome",
    "candelabrador",
    "bracer",
    "spellbinder",
    "duplicator",
    "wings",
    "attract_orb",
    "crown",
    "clover",
    "stone_mask",
    "tiragisu",
    "skull_omaniac",
)

EXTRA_UI_CHARS = (
    "封印槽位已满解除小雷达手柄导航灵动岛安全区离线安装缓存更新徽章普通狂热匆忙无尽秘法塔罗魔导书"
)
UI_SYMBOL_CHARS = "←→↑↓✓✕★☆•·…—–%+−×÷⚡💀🔊🔇⏸"


def _resolve_tool(preferred: str, fallback_name: str) -> str:
    if Path(preferred).exists():
        return preferred
    found = shutil.which(fallback_name)
    if found:
        return found
    raise FileNotFoundError(f"Required tool not found: {preferred} (or {fallback_name} in PATH)")


def pack_passives_into_world_atlas() -> None:
    """Repack world.png/world.json preserving existing frames and adding 64x64 passive_<id> frames."""
    png_path = ATLAS_DIR / "world.png"
    json_path = ATLAS_DIR / "world.json"

    before_bytes = png_path.stat().st_size
    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    src_img = Image.open(png_path).convert("RGBA")
    frames = data["frames"]

    items: list[tuple[str, Image.Image, dict]] = []
    for key, entry in frames.items():
        if key.startswith("passive_"):
            continue
        fr = entry["frame"]
        crop = src_img.crop((fr["x"], fr["y"], fr["x"] + fr["w"], fr["y"] + fr["h"]))
        items.append((key, crop, entry))

    for pid in PASSIVE_IDS:
        icon_png = ICON_DIR / f"{pid}.png"
        icon_webp = ICON_DIR / f"{pid}.webp"
        icon_path = icon_png if icon_png.exists() else icon_webp
        if not icon_path.exists():
            raise FileNotFoundError(f"Missing passive icon for atlas packing: {pid}")
        im = Image.open(icon_path).convert("RGBA").resize((64, 64), Image.Resampling.LANCZOS)
        entry = {
            "rotated": False,
            "trimmed": False,
            "pivot": {"x": 0.5, "y": 0.5},
        }
        items.append((f"passive_{pid}", im, entry))

    pad = 2
    max_w = 1024
    items.sort(key=lambda item: (-item[1].height, -item[1].width, item[0]))

    cursor_x = pad
    cursor_y = pad
    row_h = 0
    placed: list[tuple[str, int, int, Image.Image, dict]] = []
    sheet_w = 0

    for key, im, entry in items:
        w, h = im.size
        if cursor_x + w + pad > max_w and cursor_x > pad:
            cursor_x = pad
            cursor_y += row_h + pad
            row_h = 0
        placed.append((key, cursor_x, cursor_y, im, entry))
        sheet_w = max(sheet_w, cursor_x + w + pad)
        cursor_x += w + pad
        row_h = max(row_h, h)

    sheet_h = cursor_y + row_h + pad
    out_img = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    new_frames: dict = {}

    for key, px, py, im, entry in placed:
        out_img.paste(im, (px, py))
        w, h = im.size
        new_entry = dict(entry)
        new_entry["frame"] = {"x": px, "y": py, "w": w, "h": h}
        new_entry["spriteSourceSize"] = {"x": 0, "y": 0, "w": w, "h": h}
        new_entry["sourceSize"] = {"w": w, "h": h}
        new_frames[key] = new_entry

    quantized = out_img.quantize(
        colors=256,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.FLOYDSTEINBERG,
    )
    quantized.save(png_path, format="PNG", optimize=True)

    data["frames"] = new_frames
    if "meta" in data:
        data["meta"]["size"] = {"w": sheet_w, "h": sheet_h}
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    after_bytes = png_path.stat().st_size
    print(
        f"[atlas] world.png: {before_bytes / 1024:.1f} KB -> {after_bytes / 1024:.1f} KB "
        f"({sheet_w}x{sheet_h}, {len(new_frames)} frames)"
    )


def _draw_gothic_badge(size: int, icon_src: Image.Image) -> Image.Image:
    """Create a dark gothic framed PWA badge centered on #0a090d."""
    ss = 2
    hi = size * ss
    badge_hi = Image.new("RGBA", (hi, hi), (10, 9, 13, 255))
    draw = ImageDraw.Draw(badge_hi, "RGBA")

    cx = hi / 2.0
    cy = hi / 2.0
    max_r = hi * 0.42

    # Soft radial crimson-obsidian aura behind the emblem
    steps = 96
    for i in range(steps, 0, -1):
        t = i / steps
        r = max_r * t
        falloff = (1.0 - t) ** 2.5
        red = int(round(10 + 48 * falloff))
        green = int(round(9 + 4 * falloff))
        blue = int(round(13 + 10 * falloff))
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(red, green, blue, 255))

    # Outer & inner gothic borders with corner diamond rivets
    outer_m = max(8, int(round(hi * 0.055)))
    inner_m = max(16, int(round(hi * 0.088)))
    radius = max(12, int(round(hi * 0.11)))

    gold_outer = (212, 175, 55, 220)
    gold_bright = (244, 216, 125, 240)
    crimson_inner = (168, 30, 42, 200)

    draw.rounded_rectangle(
        (outer_m, outer_m, hi - outer_m - 1, hi - outer_m - 1),
        radius=radius,
        outline=gold_outer,
        width=max(2, int(round(hi * 0.011))),
    )
    draw.rounded_rectangle(
        (inner_m, inner_m, hi - inner_m - 1, hi - inner_m - 1),
        radius=max(8, radius - (inner_m - outer_m)),
        outline=crimson_inner,
        width=max(2, int(round(hi * 0.007))),
    )

    # Corner diamond studs on the outer gothic frame
    stud_r = max(4, int(round(hi * 0.022)))
    stud_offset = inner_m + int(round(hi * 0.028))
    corners = (
        (stud_offset, stud_offset),
        (hi - stud_offset, stud_offset),
        (stud_offset, hi - stud_offset),
        (hi - stud_offset, hi - stud_offset),
    )
    for sx, sy in corners:
        pts = [(sx, sy - stud_r), (sx + stud_r, sy), (sx, sy + stud_r), (sx - stud_r, sy)]
        draw.polygon(pts, fill=gold_bright, outline=(40, 28, 12, 255))

    badge = badge_hi.resize((size, size), Image.Resampling.LANCZOS)

    # Composite centered bloody_tear icon within maskable safe area (~64% of canvas)
    emblem_size = int(round(size * 0.64))
    emblem = icon_src.resize((emblem_size, emblem_size), Image.Resampling.LANCZOS)
    offset = (size - emblem_size) // 2
    badge.alpha_composite(emblem, (offset, offset))
    return badge


def generate_pwa_icons() -> None:
    """Generate pwa-192.png and pwa-512.png from bloody_tear icon before PNG removal."""
    UI_DIR.mkdir(parents=True, exist_ok=True)
    src_png = ICON_DIR / "bloody_tear.png"
    src_webp = ICON_DIR / "bloody_tear.webp"
    src_path = src_png if src_png.exists() else src_webp
    if not src_path.exists():
        raise FileNotFoundError("Missing bloody_tear icon for PWA badge generation")

    emblem = Image.open(src_path).convert("RGBA")
    for size in (192, 512):
        out_path = UI_DIR / f"pwa-{size}.png"
        badge = _draw_gothic_badge(size, emblem)
        quantized = badge.quantize(
            colors=256,
            method=Image.Quantize.FASTOCTREE,
            dither=Image.Dither.FLOYDSTEINBERG,
        )
        quantized.save(out_path, format="PNG", optimize=True)
        print(f"[pwa] generated {out_path.relative_to(ROOT_DIR)} ({out_path.stat().st_size / 1024:.1f} KB)")


def convert_icons_to_webp() -> None:
    """Convert all public/assets/icons/*.png files to *.webp (q=86, m=6) and delete PNGs."""
    cwebp = _resolve_tool(CWEBP_BIN, "cwebp")
    pngs = sorted(ICON_DIR.glob("*.png"))
    if not pngs:
        webps = sorted(ICON_DIR.glob("*.webp"))
        print(f"[icons] no source PNGs found; {len(webps)} WebP icons already present")
        return

    before_total = 0
    after_total = 0
    for png_path in pngs:
        webp_path = png_path.with_suffix(".webp")
        before_total += png_path.stat().st_size
        subprocess.run(
            [cwebp, "-quiet", "-q", "86", "-m", "6", str(png_path), "-o", str(webp_path)],
            check=True,
        )
        if not webp_path.exists() or webp_path.stat().st_size == 0:
            raise RuntimeError(f"Failed to generate non-empty WebP: {webp_path}")
        after_total += webp_path.stat().st_size
        png_path.unlink()

    print(
        f"[icons] converted {len(pngs)} PNG -> WebP: "
        f"{before_total / 1024:.1f} KB -> {after_total / 1024:.1f} KB"
    )


def _iter_source_files() -> Iterable[Path]:
    src_dir = ROOT_DIR / "src"
    if src_dir.exists():
        for p in sorted(src_dir.rglob("*")):
            if p.is_file():
                yield p
    for name in ("index.html", "README.md"):
        p = ROOT_DIR / name
        if p.is_file():
            yield p


def build_target_glyph_set() -> set[str]:
    """Union repo source chars, ASCII, Latin-1, Roman numerals, UI symbols, CJK punct, GB2312 L1, and extra UI chars."""
    chars: set[str] = set()

    for path in _iter_source_files():
        chars.update(path.read_text(encoding="utf-8", errors="ignore"))

    # Printable ASCII (U+0020..U+007E) & Latin-1 punctuation/symbols (U+00A0..U+00FF)
    for cp in range(0x0020, 0x007F):
        chars.add(chr(cp))
    for cp in range(0x00A0, 0x0100):
        chars.add(chr(cp))

    # Roman numerals (U+2160..U+2188) + arrows / UI symbols
    for cp in range(0x2160, 0x2189):
        chars.add(chr(cp))
    chars.update(UI_SYMBOL_CHARS)

    # CJK Symbols and Punctuation + Halfwidth/Fullwidth Forms
    for cp in range(0x3000, 0x3040):
        chars.add(chr(cp))
    for cp in range(0xFF00, 0xFFF0):
        chars.add(chr(cp))

    # Full GB2312 Level-1 Chinese characters (0xB0..0xD7, 0xA1..0xFE)
    for b1 in range(0xB0, 0xD8):
        for b2 in range(0xA1, 0xFF):
            try:
                chars.add(bytes([b1, b2]).decode("gb2312"))
            except UnicodeDecodeError:
                continue

    chars.update(EXTRA_UI_CHARS)
    # Remove control characters like \n, \r, \t
    return {ch for ch in chars if ord(ch) >= 0x20}


def _font_dir_bytes() -> int:
    return sum(p.stat().st_size for p in FONT_DIR.iterdir() if p.is_file() and p.suffix != ".ttf")


def subset_fonts() -> None:
    """Subset TTF fonts into WOFF2 via pyftsubset and enforce <= 450 KB total font size."""
    pyftsubset = _resolve_tool(PYFTSUBSET_BIN, "pyftsubset")
    ttfs = sorted(FONT_DIR.glob("*.ttf"))
    if not ttfs:
        woff2s = sorted(FONT_DIR.glob("*.woff2"))
        print(
            f"[fonts] no source TTFs found; {len(woff2s)} WOFF2 files present "
            f"({_font_dir_bytes() / 1024:.1f} KB total)"
        )
        return

    glyphs = sorted(build_target_glyph_set())
    before_total = sum(p.stat().st_size for p in ttfs)

    with tempfile.TemporaryDirectory() as tmp_dir:
        text_file = Path(tmp_dir) / "glyphs.txt"
        text_file.write_text("".join(glyphs), encoding="utf-8")

        for ttf_path in ttfs:
            out_path = ttf_path.with_suffix(".woff2")
            subprocess.run(
                [
                    pyftsubset,
                    str(ttf_path),
                    f"--text-file={text_file}",
                    "--flavor=woff2",
                    f"--output-file={out_path}",
                ],
                check=True,
            )

    # Verify total size of public/assets/fonts/ (excluding source .ttf about to be removed) <= 450 KB.
    # If all 4 Noto Serif SC weights exceed 450 KB, keep 400 + 700 (500->400, 600->700 in @font-face).
    total_after = _font_dir_bytes()
    if total_after > MAX_FONT_DIR_BYTES:
        for weight in ("500", "600"):
            mid_woff2 = FONT_DIR / f"noto-serif-sc-{weight}.woff2"
            if mid_woff2.exists():
                mid_woff2.unlink()
        total_after = _font_dir_bytes()
        print(
            f"[fonts] dropped noto-serif-sc-500/600.woff2 (mapped in @font-face) to stay <= 450 KB"
        )

    if total_after > MAX_FONT_DIR_BYTES:
        raise RuntimeError(
            f"public/assets/fonts/ total size {total_after} bytes exceeds {MAX_FONT_DIR_BYTES} bytes"
        )

    for ttf_path in ttfs:
        ttf_path.unlink()

    kept = sorted(p.name for p in FONT_DIR.iterdir() if p.is_file())
    print(
        f"[fonts] subset {len(ttfs)} TTF -> WOFF2: {before_total / 1024:.1f} KB -> "
        f"{total_after / 1024:.1f} KB (files: {', '.join(kept)})"
    )


def main() -> None:
    pack_passives_into_world_atlas()
    generate_pwa_icons()
    convert_icons_to_webp()
    subset_fonts()

    assets_dir = ROOT_DIR / "public" / "assets"
    total_assets = sum(p.stat().st_size for p in assets_dir.rglob("*") if p.is_file())
    print(f"[summary] total public/assets size: {total_assets / (1024 * 1024):.2f} MB ({total_assets} bytes)")


if __name__ == "__main__":
    main()
