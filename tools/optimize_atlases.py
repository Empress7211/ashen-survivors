#!/usr/bin/env python3
"""Compress and re-pack Phaser JSON Hash sprite atlases for fast web loading."""
from __future__ import annotations

import json
from pathlib import Path
from PIL import Image

ATLAS_DIR = Path("public/assets/atlases")


def repack_scaled_atlas(name: str, scale: float, quantize: bool = True) -> None:
    png_path = ATLAS_DIR / f"{name}.png"
    json_path = ATLAS_DIR / f"{name}.json"

    before_bytes = png_path.stat().st_size
    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    src_img = Image.open(png_path).convert("RGBA")
    frames = data["frames"]

    # Extract and scale each frame individually so gutters stay clean integers
    pad = 2
    scaled_items: list[tuple[str, Image.Image, dict]] = []
    for key, entry in frames.items():
        fr = entry["frame"]
        crop = src_img.crop((fr["x"], fr["y"], fr["x"] + fr["w"], fr["y"] + fr["h"]))
        nw = max(1, int(round(fr["w"] * scale)))
        nh = max(1, int(round(fr["h"] * scale)))
        if nw != fr["w"] or nh != fr["h"]:
            crop = crop.resize((nw, nh), Image.Resampling.LANCZOS)
        scaled_items.append((key, crop, entry))

    # Row-pack into power-friendly width (~1536) sorted tallest-first for compact layout
    scaled_items.sort(key=lambda item: (-item[1].height, -item[1].width, item[0]))
    max_w = 1536 if name == "entities" else 1024

    cursor_x = pad
    cursor_y = pad
    row_h = 0
    placed: list[tuple[str, int, int, Image.Image, dict]] = []
    sheet_w = 0

    for key, im, entry in scaled_items:
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

    if quantize:
        # RGBA FASTOCTREE preserves smooth 8-bit alpha while shrinking PNG ~5x-8x
        out_to_save = out_img.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
    else:
        out_to_save = out_img

    out_to_save.save(png_path, format="PNG", optimize=True)

    data["frames"] = new_frames
    if "meta" in data:
        data["meta"]["size"] = {"w": sheet_w, "h": sheet_h}
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    after_bytes = png_path.stat().st_size
    print(f"{name}: {before_bytes/1024:.1f}KB -> {after_bytes/1024:.1f}KB ({sheet_w}x{sheet_h}, {len(new_frames)} frames)")


def main() -> None:
    repack_scaled_atlas("entities", 0.75, quantize=True)
    repack_scaled_atlas("world", 1.0, quantize=True)
    repack_scaled_atlas("vfx", 1.0, quantize=False)


if __name__ == "__main__":
    main()
