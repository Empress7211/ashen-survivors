#!/usr/bin/env python3
"""Generate 1200x630 Open Graph / Twitter Card cover image (public/assets/ui/og-cover.jpg)."""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
UI_DIR = ROOT / "public/assets/ui"
ICONS_DIR = ROOT / "public/assets/icons"
FONTS_DIR = ROOT / "public/assets/fonts"

W, H = 1200, 630
CJK_BOLD = "/System/Library/Fonts/STHeiti Medium.ttc"
CJK_REGULAR = "/System/Library/Fonts/Hiragino Sans GB.ttc"


def load_cinzel_font(woff2_name: str, size: int, tmp_dir: Path) -> ImageFont.FreeTypeFont:
    woff2 = FONTS_DIR / woff2_name
    ttf_out = tmp_dir / woff2_name.replace(".woff2", ".ttf")
    if woff2.exists() and not ttf_out.exists():
        py = "/opt/anaconda3/bin/python3"
        if Path(py).exists():
            subprocess.run(
                [
                    py,
                    "-c",
                    f"from fontTools.ttLib import TTFont; f=TTFont('{woff2}'); f.flavor=None; f.save('{ttf_out}')",
                ],
                check=False,
            )
    if ttf_out.exists():
        return ImageFont.truetype(str(ttf_out), size)
    return ImageFont.truetype(CJK_BOLD, size)


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    cy: int,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    shadow_offset: int = 3,
) -> None:
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (W - tw) // 2 - bbox[0]
    y = cy - th // 2 - bbox[1]
    draw.text((x + shadow_offset, y + shadow_offset), text, font=font, fill=(6, 4, 10))
    draw.text((x, y), text, font=font, fill=fill)


def main() -> None:
    bg = Image.open(UI_DIR / "title-bg.jpg").convert("RGB")
    bw, bh = bg.size
    scale = max(W / bw, H / bh)
    nw, nh = int(round(bw * scale)), int(round(bh * scale))
    bg = bg.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - W) // 2
    top = (nh - H) // 2
    canvas = bg.crop((left, top, left + W, top + H)).convert("RGBA")

    # Dark gothic radial vignette & mood overlay
    overlay = Image.new("RGBA", (W, H), (8, 6, 13, 168))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse((240, -80, 960, 440), fill=(168, 30, 42, 76))
    gdraw.ellipse((320, 40, 880, 360), fill=(212, 175, 55, 48))
    glow = glow.filter(ImageFilter.GaussianBlur(65))
    canvas = Image.alpha_composite(canvas, overlay)
    canvas = Image.alpha_composite(canvas, glow)

    draw = ImageDraw.Draw(canvas)

    # Double ornate gold border
    draw.rounded_rectangle((18, 18, W - 18, H - 18), radius=18, outline=(212, 175, 55, 190), width=3)
    draw.rounded_rectangle((28, 28, W - 28, H - 28), radius=14, outline=(212, 175, 55, 85), width=1)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        f_eyebrow = load_cinzel_font("cinzel-700.woff2", 20, tmp_dir)
        f_title = ImageFont.truetype(CJK_BOLD, 68, index=0)
        f_sub = load_cinzel_font("cinzel-700.woff2", 26, tmp_dir)
        f_tag = ImageFont.truetype(CJK_REGULAR, 23, index=0)
        f_url = load_cinzel_font("cinzel-700.woff2", 21, tmp_dir)

        draw_centered_text(draw, "WEB HD EDITION  -  VAMPIRE SURVIVORS", 86, f_eyebrow, (212, 175, 55))
        draw_centered_text(draw, "《灰烬之夜》", 162, f_title, (248, 236, 212), shadow_offset=4)
        draw_centered_text(draw, "ASHEN SURVIVORS", 236, f_sub, (244, 216, 125))
        draw_centered_text(
            draw,
            "16位猎魔英雄 · 34把武器进化 · 千怪同屏120Hz丝滑割草 · 免下载即点即玩",
            296,
            f_tag,
            (230, 220, 236),
        )

        # Showcase icon row
        showcase_ids = [
            "antonio",
            "red_death",
            "bloody_tear",
            "phieraggi",
            "holy_wand",
            "vandalier",
        ]
        slot_size = 96
        gap = 24
        row_w = len(showcase_ids) * slot_size + (len(showcase_ids) - 1) * gap
        start_x = (W - row_w) // 2
        row_y = 356

        for idx, item_id in enumerate(showcase_ids):
            sx = start_x + idx * (slot_size + gap)
            draw.rounded_rectangle(
                (sx, row_y, sx + slot_size, row_y + slot_size),
                radius=14,
                fill=(18, 15, 27, 235),
                outline=(212, 175, 55, 195),
                width=2,
            )
            icon_path = ICONS_DIR / f"{item_id}.webp"
            if icon_path.exists():
                im = Image.open(icon_path).convert("RGBA")
                im.thumbnail((74, 74), Image.Resampling.LANCZOS)
                ix = sx + (slot_size - im.width) // 2
                iy = row_y + (slot_size - im.height) // 2
                canvas.paste(im, (ix, iy), im)

        # Domain CTA pill
        pill_w, pill_h = 560, 52
        px0 = (W - pill_w) // 2
        py0 = 506
        draw.rounded_rectangle(
            (px0, py0, px0 + pill_w, py0 + pill_h),
            radius=26,
            fill=(140, 24, 38, 228),
            outline=(244, 216, 125, 230),
            width=2,
        )
        draw_centered_text(draw, "PLAY NOW  -  SURVIVE.ILOVESJTU.COM", py0 + pill_h // 2, f_url, (255, 242, 206))

    out_path = UI_DIR / "og-cover.jpg"
    canvas.convert("RGB").save(out_path, format="JPEG", quality=88, optimize=True)
    print(f"Generated {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
