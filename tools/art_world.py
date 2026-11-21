#!/usr/bin/env python3
"""World & Environment Art Pipeline for 《Vampire Survivors · 灰烬之夜》.

Processes raw generated art from `tools/raw_world/` into production assets:
- `public/assets/ui/title-bg.jpg` (1920x1080 16:9 HD title splash)
- `public/assets/stages/<stage_id>.jpg` (5x 512x512 seamless low-contrast tiles)
- `public/assets/atlases/world.png` + `public/assets/atlases/world.json` (Phaser 3 JSON Hash)

Also runs mathematical and structural verification over all generated outputs.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
from PIL import Image, ImageFilter

ROOT_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT_DIR / "tools" / "raw_world"
UI_DIR = ROOT_DIR / "public" / "assets" / "ui"
STAGES_DIR = ROOT_DIR / "public" / "assets" / "stages"
ATLAS_DIR = ROOT_DIR / "public" / "assets" / "atlases"

STAGE_IDS: Tuple[str, ...] = (
    "mad_forest",
    "inlaid_library",
    "dairy_plant",
    "gallo_tower",
    "cappella_magna",
)

PROP_NAMES: Tuple[str, ...] = (
    "brazier",
    "candelabra",
    "streetlamp",
    "dead_tree",
    "gravestone",
    "bookshelf",
    "minecart",
    "stone_pillar",
    "stained_pedestal",
    "rubble",
)

CHEST_NAMES: Tuple[str, ...] = (
    "chest_bronze",
    "chest_silver",
    "chest_gold",
    "chest_arcana",
    "chest_bronze_open",
    "chest_silver_open",
    "chest_gold_open",
    "chest_arcana_open",
)

EXPECTED_WORLD_FRAMES: Tuple[str, ...] = PROP_NAMES + CHEST_NAMES

FRAME_MAX_DIM: Dict[str, int] = {
    "dead_tree": 176,
    "streetlamp": 160,
    "bookshelf": 152,
    "stone_pillar": 160,
    "stained_pedestal": 144,
    "brazier": 124,
    "candelabra": 128,
    "gravestone": 120,
    "minecart": 128,
    "rubble": 112,
    "chest_bronze": 96,
    "chest_bronze_open": 106,
    "chest_silver": 96,
    "chest_silver_open": 106,
    "chest_gold": 100,
    "chest_gold_open": 110,
    "chest_arcana": 104,
    "chest_arcana_open": 114,
}


@dataclass(frozen=True)
class SheetSpec:
    filename: str
    cols: int
    rows: int
    names: Tuple[str, ...]
    clear_interior_magenta: bool = False
    explicit_boxes: Optional[Dict[str, Tuple[float, float, float, float]]] = None


DEFAULT_PROPS_SHEET = SheetSpec(
    filename="props_sheet.jpg",
    cols=5,
    rows=2,
    names=PROP_NAMES,
    clear_interior_magenta=True,
)

DEFAULT_CHESTS_SHEET = SheetSpec(
    filename="chests_sheet.jpg",
    cols=4,
    rows=2,
    names=CHEST_NAMES,
    clear_interior_magenta=False,
)


def find_raw_file(stem: str, raw_dir: Path = RAW_DIR) -> Optional[Path]:
    """Locate a raw image file matching stem with common raster extensions."""
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        candidate = raw_dir / f"{stem}{ext}"
        if candidate.exists():
            return candidate
    return None


def center_crop_aspect(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Center-crop image to match target aspect ratio before resizing."""
    w, h = img.size
    target_ratio = target_w / float(target_h)
    src_ratio = w / float(h)
    if abs(src_ratio - target_ratio) < 1e-3:
        return img
    if src_ratio > target_ratio:
        new_w = max(1, int(round(h * target_ratio)))
        left = (w - new_w) // 2
        return img.crop((left, 0, left + new_w, h))
    new_h = max(1, int(round(w / target_ratio)))
    top = (h - new_h) // 2
    return img.crop((0, top, w, top + new_h))


def process_title_bg(src_path: Path, dst_path: Path, size: Tuple[int, int] = (1920, 1080)) -> None:
    """Export 16:9 HD title background with clean dark left/bottom readability."""
    img = Image.open(src_path).convert("RGB")
    img = center_crop_aspect(img, size[0], size[1])
    img = img.resize(size, Image.Resampling.LANCZOS)

    arr = np.asarray(img, dtype=np.float32) / 255.0
    h, w, _ = arr.shape

    # Gentle atmospheric scrim on center-left / bottom-left menu region
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    xn = xx / float(w)
    yn = yy / float(h)
    left_mask = np.clip((0.54 - xn) / 0.44, 0.0, 1.0)
    bottom_mask = np.clip((yn - 0.22) / 0.55, 0.0, 1.0)
    scrim = 1.0 - 0.16 * (left_mask ** 1.4) * (0.4 + 0.6 * bottom_mask)
    arr = np.clip(arr * scrim[..., None], 0.0, 1.0)

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    out = Image.fromarray((arr * 255.0 + 0.5).astype(np.uint8), mode="RGB")
    out.save(dst_path, format="JPEG", quality=92, subsampling=0, optimize=True)


def _toroidal_gaussian_lum(lum: np.ndarray, sigma: float = 18.0) -> np.ndarray:
    """Compute wrap-around Gaussian blur of a 2D luminance array to preserve tile seams."""
    h, w = lum.shape
    pad = int(min(h // 2, w // 2, math.ceil(sigma * 2.5)))
    tiled = np.pad(lum, ((pad, pad), (pad, pad)), mode="wrap")
    pil_l = Image.fromarray(np.clip(tiled * 255.0, 0, 255).astype(np.uint8), mode="L")
    blurred = np.asarray(pil_l.filter(ImageFilter.GaussianBlur(radius=sigma)), dtype=np.float32) / 255.0
    return blurred[pad : pad + h, pad : pad + w]


def make_seamless_tile(
    src_path: Path,
    dst_path: Path,
    tile_size: int = 512,
    blend_band: int = 48,
    target_mean_lum: float = 0.175,
) -> Dict[str, float]:
    """Create a mathematically seamless 512x512 low-contrast dark ground texture.

    Uses 4-way half-tile (tile_size//2) offset cosine edge cross-fading so
    256px-periodic features align without ghosting and opposite boundaries join cleanly.
    """
    img = Image.open(src_path).convert("RGB")
    img = center_crop_aspect(img, 1, 1)
    resized = img.resize((tile_size, tile_size), Image.Resampling.LANCZOS)
    a = np.asarray(resized, dtype=np.float32) / 255.0

    half = tile_size // 2
    b = np.roll(a, half, axis=1)
    c = np.roll(a, half, axis=0)
    d = np.roll(b, half, axis=0)

    band = min(blend_band, half // 2)
    idx = np.arange(tile_size, dtype=np.float32)
    dist_edge = np.minimum(idx, tile_size - 1 - idx)
    w_1d = np.where(
        dist_edge >= band,
        1.0,
        0.5 * (1.0 - np.cos(np.pi * dist_edge / float(band))),
    )
    wx = w_1d[None, :, None]
    wy = w_1d[:, None, None]

    ty = wy * (wx * a + (1.0 - wx) * b) + (1.0 - wy) * (wx * c + (1.0 - wx) * d)

    # Value, local variance & desaturation normalization (toroidal-safe)
    lum = 0.2126 * ty[..., 0] + 0.7152 * ty[..., 1] + 0.0722 * ty[..., 2]
    lum_comp = np.where(lum > 0.28, 0.28 + (lum - 0.28) * 0.25, lum)

    # Gently flatten very-low-frequency blotches so 2x2 / 4x4 tiling has no repeating light/dark clouds
    lum_vlow = _toroidal_gaussian_lum(lum_comp, sigma=64.0)
    vlow_mean = float(np.mean(lum_vlow))
    lum_flat = np.clip(lum_comp - 0.35 * (lum_vlow - vlow_mean), 0.02, 0.45)

    lum_local = _toroidal_gaussian_lum(lum_flat, sigma=18.0)
    lum_detail = lum_flat - lum_local
    lum_balanced = lum_local + 0.82 * lum_detail

    cur_mean = float(np.mean(lum_balanced))
    if cur_mean > 1e-4:
        gain = float(np.clip(target_mean_lum / cur_mean, 0.65, 1.85))
        lum_scaled = np.clip(lum_balanced * gain, 0.035, 0.32)
    else:
        lum_scaled = np.full_like(lum_balanced, target_mean_lum)

    mean_after = float(np.mean(lum_scaled))
    if mean_after < 0.145 or mean_after > 0.24:
        lum_scaled = np.clip(lum_scaled + (target_mean_lum - mean_after), 0.035, 0.32)

    ratio = lum_scaled / np.maximum(lum, 1e-4)
    rgb = ty * ratio[..., None]

    # Mild desaturation so dark floors let entities & bright VFX pop
    rgb_lum = (0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2])[..., None]
    rgb = 0.82 * rgb + 0.18 * rgb_lum
    rgb = np.clip(rgb, 0.0, 1.0)

    # Roll by quarter tile before edge stitch so straight masonry joints stay away from DCT tile borders
    rgb = np.roll(rgb, (tile_size // 8, tile_size // 8), axis=(0, 1))

    # Non-smearing difference stitch: forces edge continuity without dragging mortar lines inward
    stitch = 4
    err_x = 0.5 * (rgb[:, -1, :] - rgb[:, 0, :])
    for i in range(stitch):
        w = 0.5 * (1.0 + math.cos(math.pi * i / float(stitch)))
        rgb[:, i, :] += w * err_x
        rgb[:, -1 - i, :] -= w * err_x
    err_y = 0.5 * (rgb[-1, :, :] - rgb[0, :, :])
    for i in range(stitch):
        w = 0.5 * (1.0 + math.cos(math.pi * i / float(stitch)))
        rgb[i, :, :] += w * err_y
        rgb[-1 - i, :, :] -= w * err_y
    rgb = np.clip(rgb, 0.0, 1.0)

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    out = Image.fromarray(np.clip(rgb * 255.0 + 0.5, 0, 255).astype(np.uint8), mode="RGB")
    out.save(dst_path, format="JPEG", quality=94, subsampling=0, optimize=True)

    return compute_tile_metrics(dst_path)


def compute_tile_metrics(tile_path: Path) -> Dict[str, float]:
    """Measure resolution, mean brightness, std dev, and opposite-edge seam deltas."""
    img = Image.open(tile_path).convert("RGB")
    arr = np.asarray(img, dtype=np.float32)
    h, w, _ = arr.shape
    lr_delta = float(np.mean(np.abs(arr[:, 0, :] - arr[:, -1, :])))
    tb_delta = float(np.mean(np.abs(arr[0, :, :] - arr[-1, :, :])))
    arr_n = arr / 255.0
    lum = 0.2126 * arr_n[..., 0] + 0.7152 * arr_n[..., 1] + 0.0722 * arr_n[..., 2]
    return {
        "width": float(w),
        "height": float(h),
        "mean_brightness": float(np.mean(lum)),
        "std_brightness": float(np.std(lum)),
        "lr_seam_delta": lr_delta,
        "tb_seam_delta": tb_delta,
        "max_seam_delta": max(lr_delta, tb_delta),
    }


def _estimate_bg_color(arr_rgb: np.ndarray) -> Tuple[np.ndarray, bool]:
    """Estimate studio matte color from outer border pixels and detect magenta matte."""
    h, w, _ = arr_rgb.shape
    bw = max(2, min(8, h // 20, w // 20))
    border = np.concatenate(
        [
            arr_rgb[:bw, :, :].reshape(-1, 3),
            arr_rgb[-bw:, :, :].reshape(-1, 3),
            arr_rgb[:, :bw, :].reshape(-1, 3),
            arr_rgb[:, -bw:, :].reshape(-1, 3),
        ],
        axis=0,
    )
    med = np.median(border, axis=0)
    is_magenta = bool(med[0] > 150.0 and med[2] > 150.0 and (min(med[0], med[2]) - med[1]) > 45.0)
    return med.astype(np.float32), is_magenta


def _flood_mask_from_seeds(
    candidate: np.ndarray,
    seed_points: Optional[Iterable[Tuple[int, int]]] = None,
    seed_edges: bool = True,
) -> np.ndarray:
    """4-connected BFS flood fill over a boolean candidate mask."""
    h, w = candidate.shape
    visited = np.zeros((h, w), dtype=bool)
    q: deque[Tuple[int, int]] = deque()

    def try_push(y: int, x: int) -> None:
        if 0 <= y < h and 0 <= x < w and not visited[y, x] and candidate[y, x]:
            visited[y, x] = True
            q.append((y, x))

    if seed_edges:
        for x in range(w):
            try_push(0, x)
            try_push(h - 1, x)
        for y in range(h):
            try_push(y, 0)
            try_push(y, w - 1)
    if seed_points is not None:
        for sy, sx in seed_points:
            try_push(sy, sx)

    while q:
        cy, cx = q.popleft()
        if cy > 0:
            try_push(cy - 1, cx)
        if cy + 1 < h:
            try_push(cy + 1, cx)
        if cx > 0:
            try_push(cy, cx - 1)
        if cx + 1 < w:
            try_push(cy, cx + 1)

    return visited


def _flood_background_mask(
    arr_rgb: np.ndarray,
    bg_color: np.ndarray,
    is_magenta: bool,
    seed_points: Optional[Iterable[Tuple[int, int]]] = None,
    rgb_tol: float = 42.0,
    clear_interior_magenta: bool = False,
) -> np.ndarray:
    """JPEG-tolerant BFS border flood-fill identifying pure exterior matte pixels."""
    dist = np.linalg.norm(arr_rgb - bg_color[None, None, :], axis=2)

    if is_magenta:
        r = arr_rgb[..., 0]
        g = arr_rgb[..., 1]
        b = arr_rgb[..., 2]
        mag_ex = np.minimum(r, b) - g
        # Pure/near-pure magenta matte including JPEG compression noise
        is_bg_candidate = (dist < rgb_tol) | (
            (r > 190.0) & (b > 185.0) & (mag_ex > 110.0) & (np.abs(r - b) < 48.0)
        )
        if clear_interior_magenta:
            # Enclosed iron-scroll / twig / rubble pockets with shaded JPEG magenta
            interior_seeds = list(
                zip(
                    *np.nonzero(
                        (r > 145.0) & (b > 140.0) & (mag_ex > 65.0) & (np.abs(r - b) < 60.0)
                    )
                )
            )
            extra_cand = is_bg_candidate | (
                (r > 135.0) & (b > 130.0) & (mag_ex > 54.0) & (np.abs(r - b) < 62.0)
            )
            all_seeds = list(seed_points or []) + interior_seeds
            return _flood_mask_from_seeds(extra_cand, seed_points=all_seeds, seed_edges=True)
    else:
        is_bg_candidate = dist < rgb_tol

    return _flood_mask_from_seeds(is_bg_candidate, seed_points=seed_points, seed_edges=True)


def _refine_sprite_rgba(
    crop_rgb: np.ndarray,
    bg_mask: np.ndarray,
    bg_color: np.ndarray,
    is_magenta: bool,
) -> Image.Image:
    """Convert magenta-blended warm glow into clean amber alpha, despill edges, and outline solid geometry."""
    h, w, _ = crop_rgb.shape
    rgb = crop_rgb.copy()
    r = rgb[..., 0]
    g = rgb[..., 1]
    b = rgb[..., 2]

    alpha = np.where(bg_mask, 0.0, 255.0).astype(np.float32)

    if is_magenta:
        bg_u8 = bg_mask.astype(np.uint8) * 255
        bg_near = np.asarray(Image.fromarray(bg_u8).filter(ImageFilter.MaxFilter(5))) > 0
        glow_cand = (
            (~bg_mask)
            & (r > 185.0)
            & (g > bg_color[1] + 8.0)
            & (b > 72.0)
            & (b > g * 0.62)
            & (r >= b - 18.0)
        )
        glow_seeds = list(zip(*np.nonzero(glow_cand & bg_near)))
        glow_band = _flood_mask_from_seeds(glow_cand, seed_points=glow_seeds, seed_edges=False)

        if np.any(glow_band):
            g_denom = max(218.0 - float(bg_color[1]), 40.0)
            b_denom = max(float(bg_color[2]) - 65.0, 40.0)
            a_g = np.clip((g - bg_color[1]) / g_denom, 0.0, 1.0)
            a_b = np.clip((bg_color[2] - b) / b_denom, 0.0, 1.0)
            glow_alpha = np.clip((np.maximum(a_g, a_b * 0.85) ** 1.32) * 0.82, 0.02, 0.92)

            inv_a = 1.0 / np.maximum(glow_alpha, 0.08)
            raw_fg_g = np.clip((g - (1.0 - glow_alpha) * bg_color[1]) * inv_a, 95.0, 220.0)
            f_r = np.clip(
                np.maximum((r - (1.0 - glow_alpha) * bg_color[0]) * inv_a, raw_fg_g * 1.24 + 20.0),
                215.0,
                255.0,
            )
            # Keep warm amber-gold balance (avoid chartreuse/lemon tint on dark slate)
            f_g = np.minimum(raw_fg_g, f_r * 0.78)
            f_b = np.clip((b - (1.0 - glow_alpha) * bg_color[2]) * inv_a, 0.0, 145.0)
            f_b = np.clip(f_b, f_g * 0.38, f_g * 0.62)

            r = np.where(glow_band, f_r, r)
            g = np.where(glow_band, f_g, g)
            b = np.where(glow_band, f_b, b)
            alpha = np.where(glow_band, glow_alpha * 255.0, alpha)
    else:
        glow_band = np.zeros((h, w), dtype=bool)

    # Despill 3px solid boundary (including dark bark/iron AA pixels!) adjacent to cleared background
    solid_fg = (~bg_mask) & (~glow_band)
    clear_u8 = (~solid_fg).astype(np.uint8) * 255
    clear_dil1 = np.asarray(Image.fromarray(clear_u8).filter(ImageFilter.MaxFilter(3))) > 0
    clear_dil2 = np.asarray(Image.fromarray(clear_u8).filter(ImageFilter.MaxFilter(5))) > 0
    clear_dil3 = np.asarray(Image.fromarray(clear_u8).filter(ImageFilter.MaxFilter(7))) > 0
    fringe1 = solid_fg & clear_dil1
    fringe2 = solid_fg & clear_dil2
    fringe3 = solid_fg & clear_dil3

    if is_magenta:
        mag_excess = np.maximum(0.0, np.minimum(r, b) - g)
        is_pink_fringe = (mag_excess > 10.0) & (np.abs(r - b) < 85.0)
        spill_w = np.where(
            fringe1 & is_pink_fringe,
            1.0,
            np.where(fringe2 & is_pink_fringe, 0.85, np.where(fringe3 & is_pink_fringe, 0.55, 0.0)),
        )
        r = np.where(spill_w > 0, np.maximum(g, r - mag_excess * spill_w), r)
        b = np.where(spill_w > 0, np.maximum(g, b - mag_excess * spill_w), b)

        # Feather outer 1-2px AA magenta-contaminated fringe smoothly before dark outline
        dist_bg = np.linalg.norm(crop_rgb - bg_color[None, None, :], axis=2)
        aa_factor = np.clip((dist_bg - 35.0) / 70.0, 0.15, 1.0)
        mag_fade = np.clip(1.0 - mag_excess / 145.0, 0.15, 1.0)
        alpha = np.where(fringe1 & is_pink_fringe, 255.0 * np.minimum(aa_factor, mag_fade), alpha)
        alpha = np.where(fringe2 & (~fringe1) & (mag_excess > 45.0), 255.0 * mag_fade, alpha)

    rgb[..., 0] = r
    rgb[..., 1] = g
    rgb[..., 2] = b

    # Subtle top-edge moonlit/warm rim-light on solid geometry facing upward clear sky
    solid_opaque = solid_fg & (alpha > 215.0)
    above_clear = np.zeros_like(solid_opaque)
    above_clear[1:, :] = ~solid_opaque[:-1, :]
    above2_clear = np.zeros_like(solid_opaque)
    above2_clear[2:, :] = ~solid_opaque[:-2, :]
    rim_mask = solid_opaque & (above_clear | above2_clear)
    rgb[rim_mask] = np.clip(rgb[rim_mask] * 1.12 + np.array([10.0, 8.0, 12.0]), 0.0, 255.0)

    rgba = np.zeros((h, w, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(rgb, 0.0, 255.0)
    rgba[..., 3] = np.clip(alpha, 0.0, 255.0)

    # Crisp 1.5px dark gothic outline ONLY around solid geometry (never around soft glow rays!)
    solid_alpha_u8 = np.where(solid_fg, rgba[..., 3], 0.0).astype(np.uint8)
    dil1 = np.asarray(Image.fromarray(solid_alpha_u8).filter(ImageFilter.MaxFilter(3)), dtype=np.float32)
    dil2 = np.asarray(Image.fromarray(solid_alpha_u8).filter(ImageFilter.MaxFilter(5)), dtype=np.float32)
    outline_alpha = np.maximum(dil1 * 0.90, dil2 * 0.35)
    # Apply outline only where solid geometry expands into empty background (preserve glowing halo behind)
    outline_only = (rgba[..., 3] < 235.0) & (~glow_band) & (outline_alpha > rgba[..., 3])

    outline_color = np.array([12.0, 9.0, 16.0], dtype=np.float32)
    fg_a = rgba[..., 3] / 255.0
    out_a = np.maximum(rgba[..., 3], outline_alpha) / 255.0
    for c in range(3):
        comp = rgba[..., c] * fg_a + outline_color[c] * np.maximum(0.0, out_a - fg_a)
        rgba[..., c] = np.where(outline_only, comp / np.maximum(out_a, 1e-4), rgba[..., c])
    rgba[..., 3] = np.where(outline_only, np.maximum(rgba[..., 3], outline_alpha), rgba[..., 3])

    return Image.fromarray(np.clip(rgba + 0.5, 0, 255).astype(np.uint8), mode="RGBA")


def _find_connected_components(
    mask: np.ndarray,
    min_pixels: int = 8,
) -> List[Tuple[int, int, int, int, float, float, int]]:
    """Find 8-connected foreground components -> (y0, x0, y1, x1, cy, cx, count)."""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    comps: List[Tuple[int, int, int, int, float, float, int]] = []
    label_id = 0

    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys.tolist(), xs.tolist()):
        if labels[sy, sx] != 0:
            continue
        label_id += 1
        q: deque[Tuple[int, int]] = deque([(sy, sx)])
        labels[sy, sx] = label_id
        min_y = max_y = sy
        min_x = max_x = sx
        sum_y = sum_x = count = 0

        while q:
            cy, cx = q.popleft()
            count += 1
            sum_y += cy
            sum_x += cx
            if cy < min_y:
                min_y = cy
            if cy > max_y:
                max_y = cy
            if cx < min_x:
                min_x = cx
            if cx > max_x:
                max_x = cx
            for dy in (-1, 0, 1):
                ny = cy + dy
                if ny < 0 or ny >= h:
                    continue
                for dx in (-1, 0, 1):
                    nx = cx + dx
                    if 0 <= nx < w and mask[ny, nx] and labels[ny, nx] == 0:
                        labels[ny, nx] = label_id
                        q.append((ny, nx))

        if count >= min_pixels:
            comps.append((min_y, min_x, max_y + 1, max_x + 1, sum_y / count, sum_x / count, count))

    return comps


def extract_sheet_sprites(spec: SheetSpec, raw_dir: Path = RAW_DIR) -> Dict[str, Image.Image]:
    """Extract all named sprites from a multi-cell sheet with zero clipping or halo."""
    src_path = find_raw_file(Path(spec.filename).stem, raw_dir=raw_dir)
    if src_path is None:
        raise FileNotFoundError(f"Missing raw sheet for {spec.filename} in {raw_dir}")

    img = Image.open(src_path).convert("RGB")
    arr = np.asarray(img, dtype=np.float32)
    h, w, _ = arr.shape
    bg_color, is_magenta = _estimate_bg_color(arr)

    seeds: List[Tuple[int, int]] = []
    for r in range(1, spec.rows):
        gy = int(round(r * h / float(spec.rows)))
        for x in range(0, w, max(1, w // 48)):
            seeds.append((gy, x))
    for c in range(1, spec.cols):
        gx = int(round(c * w / float(spec.cols)))
        for y in range(0, h, max(1, h // 48)):
            seeds.append((y, gx))

    sheet_bg = _flood_background_mask(
        arr,
        bg_color,
        is_magenta,
        seed_points=seeds,
        clear_interior_magenta=spec.clear_interior_magenta,
    )
    fg_mask = ~sheet_bg

    extracted: Dict[str, Image.Image] = {}
    cell_w = w / float(spec.cols)
    cell_h = h / float(spec.rows)

    if spec.explicit_boxes:
        for name in spec.names:
            x0f, y0f, x1f, y1f = spec.explicit_boxes[name]
            x0, y0 = max(0, int(round(x0f * w))), max(0, int(round(y0f * h)))
            x1, y1 = min(w, int(round(x1f * w))), min(h, int(round(y1f * h)))
            crop_rgb = arr[y0:y1, x0:x1]
            crop_bg = _flood_background_mask(crop_rgb, bg_color, is_magenta)
            sprite = _refine_sprite_rgba(crop_rgb, crop_bg, bg_color, is_magenta)
            extracted[name] = _trim_and_fit(sprite, FRAME_MAX_DIM.get(name, 128))
        return extracted

    comps = _find_connected_components(fg_mask, min_pixels=6)
    # Assign components to nearest grid cell center (within cell grid bounds)
    cell_boxes: Dict[int, List[int]] = {}
    for y0, x0, y1, x1, cy, cx, _count in comps:
        col = min(spec.cols - 1, max(0, int(cx / cell_w)))
        row = min(spec.rows - 1, max(0, int(cy / cell_h)))
        idx = row * spec.cols + col
        if idx >= len(spec.names):
            continue
        if idx not in cell_boxes:
            cell_boxes[idx] = [y0, x0, y1, x1]
        else:
            b = cell_boxes[idx]
            b[0] = min(b[0], y0)
            b[1] = min(b[1], x0)
            b[2] = max(b[2], y1)
            b[3] = max(b[3], x1)

    for idx, name in enumerate(spec.names):
        r = idx // spec.cols
        c = idx % spec.cols
        if idx in cell_boxes:
            y0, x0, y1, x1 = cell_boxes[idx]
            pad = 10
            y0 = max(0, y0 - pad)
            x0 = max(0, x0 - pad)
            y1 = min(h, y1 + pad)
            x1 = min(w, x1 + pad)
        else:
            y0 = max(0, int(round(r * cell_h)))
            x0 = max(0, int(round(c * cell_w)))
            y1 = min(h, int(round((r + 1) * cell_h)))
            x1 = min(w, int(round((c + 1) * cell_w)))

        crop_rgb = arr[y0:y1, x0:x1]
        local_bg = (
            _flood_background_mask(
                crop_rgb,
                bg_color,
                is_magenta,
                clear_interior_magenta=spec.clear_interior_magenta,
            )
            | sheet_bg[y0:y1, x0:x1]
        )
        sprite = _refine_sprite_rgba(crop_rgb, local_bg, bg_color, is_magenta)
        extracted[name] = _trim_and_fit(sprite, FRAME_MAX_DIM.get(name, 128))

    return extracted


def _trim_and_fit(sprite: Image.Image, max_dim: int, margin: int = 3) -> Image.Image:
    """Trim transparent borders cleanly and resize proportionally to max_dim."""
    alpha = np.asarray(sprite, dtype=np.uint8)[..., 3]
    ys, xs = np.nonzero(alpha > 10)
    if len(xs) == 0:
        return sprite
    x0 = max(0, int(xs.min()) - margin)
    y0 = max(0, int(ys.min()) - margin)
    x1 = min(sprite.width, int(xs.max()) + 1 + margin)
    y1 = min(sprite.height, int(ys.max()) + 1 + margin)
    trimmed = sprite.crop((x0, y0, x1, y1))
    tw, th = trimmed.size
    scale = min(max_dim / float(tw), max_dim / float(th))
    if scale < 0.99 or scale > 1.05:
        nw = max(8, int(round(tw * scale)))
        nh = max(8, int(round(th * scale)))
        trimmed = trimmed.resize((nw, nh), Image.Resampling.LANCZOS)
    return trimmed


def pack_world_atlas(
    sprites: Dict[str, Image.Image],
    png_path: Path,
    json_path: Path,
    padding: int = 6,
) -> Dict[str, object]:
    """Shelf-pack sprites into a clean RGBA atlas PNG and Phaser 3 JSON Hash file."""
    ordered = sorted(sprites.items(), key=lambda kv: (-kv[1].height, -kv[1].width, kv[0]))
    total_area = sum((im.width + padding) * (im.height + padding) for _, im in ordered)
    max_w = max(im.width + padding * 2 for _, im in ordered)
    atlas_w = 512
    while atlas_w < max_w or (atlas_w * atlas_w) < total_area * 1.45:
        atlas_w *= 2

    placements: Dict[str, Tuple[int, int, int, int]] = {}
    cur_x = padding
    cur_y = padding
    shelf_h = 0

    for name, im in ordered:
        w, h = im.size
        if cur_x + w + padding > atlas_w:
            cur_x = padding
            cur_y += shelf_h + padding
            shelf_h = 0
        placements[name] = (cur_x, cur_y, w, h)
        cur_x += w + padding
        shelf_h = max(shelf_h, h)

    raw_h = cur_y + shelf_h + padding
    atlas_h = 1
    while atlas_h < raw_h:
        atlas_h *= 2

    sheet = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    frames_meta: Dict[str, object] = {}

    for name in EXPECTED_WORLD_FRAMES:
        if name not in sprites:
            raise ValueError(f"Missing expected frame '{name}' when packing world atlas")
        im = sprites[name]
        x, y, w, h = placements[name]
        sheet.paste(im, (x, y))
        frames_meta[name] = {
            "frame": {"x": x, "y": y, "w": w, "h": h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "sourceSize": {"w": w, "h": h},
            "pivot": {"x": 0.5, "y": 0.5},
        }

    atlas_json = {
        "frames": frames_meta,
        "meta": {
            "app": "tools/art_world.py",
            "version": "1.0",
            "image": png_path.name,
            "format": "RGBA8888",
            "size": {"w": atlas_w, "h": atlas_h},
            "scale": "1",
        },
    }

    png_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(png_path, format="PNG", optimize=True)
    json_path.write_text(json.dumps(atlas_json, indent=2) + "\n", encoding="utf-8")
    return atlas_json


def verify_all(root_dir: Path = ROOT_DIR) -> Dict[str, object]:
    """Verify all generated world art files against strict visual & numeric criteria."""
    errors: List[str] = []
    report: Dict[str, object] = {"stages": {}, "atlas": {}, "title": {}}

    title_path = root_dir / "public" / "assets" / "ui" / "title-bg.jpg"
    if not title_path.exists():
        errors.append(f"Missing title background: {title_path}")
    else:
        t_img = Image.open(title_path)
        tw, th = t_img.size
        report["title"] = {"width": tw, "height": th, "aspect": round(tw / float(th), 4)}
        if tw < 1280 or th < 720 or abs((tw / float(th)) - (16.0 / 9.0)) > 0.05:
            errors.append(f"Invalid title-bg dimensions/aspect: {tw}x{th}")

    for sid in STAGE_IDS:
        sp = root_dir / "public" / "assets" / "stages" / f"{sid}.jpg"
        if not sp.exists():
            errors.append(f"Missing stage tile: {sp}")
            continue
        m = compute_tile_metrics(sp)
        report["stages"][sid] = m
        if int(m["width"]) != 512 or int(m["height"]) != 512:
            errors.append(f"Stage {sid} wrong dimensions: {m['width']}x{m['height']}")
        if m["max_seam_delta"] >= 4.0:
            errors.append(f"Stage {sid} seam delta too high: {m['max_seam_delta']:.2f}")
        if not (0.12 <= m["mean_brightness"] <= 0.28):
            errors.append(f"Stage {sid} mean brightness out of [0.12, 0.28]: {m['mean_brightness']:.4f}")

    atlas_png = root_dir / "public" / "assets" / "atlases" / "world.png"
    atlas_json = root_dir / "public" / "assets" / "atlases" / "world.json"
    if not atlas_png.exists() or not atlas_json.exists():
        errors.append("Missing world.png or world.json")
    else:
        data = json.loads(atlas_json.read_text(encoding="utf-8"))
        frames = data.get("frames", {})
        missing = [k for k in EXPECTED_WORLD_FRAMES if k not in frames]
        if missing:
            errors.append(f"Missing frames in world.json: {missing}")

        atlas_img = Image.open(atlas_png).convert("RGBA")
        arr = np.asarray(atlas_img, dtype=np.uint8)
        border_opaque = int(
            np.sum(arr[0, :, 3] > 0)
            + np.sum(arr[-1, :, 3] > 0)
            + np.sum(arr[:, 0, 3] > 0)
            + np.sum(arr[:, -1, 3] > 0)
        )
        if border_opaque > 0:
            errors.append(f"Atlas outer border has {border_opaque} non-transparent pixels")

        bad_frames: List[str] = []
        frame_border_leaks: List[str] = []
        for k, entry in frames.items():
            fr = entry["frame"]
            sub = arr[fr["y"] : fr["y"] + fr["h"], fr["x"] : fr["x"] + fr["w"]]
            alpha = sub[..., 3]
            if int(np.sum(alpha > 20)) < 16:
                bad_frames.append(k)
            corners = [int(alpha[0, 0]), int(alpha[0, -1]), int(alpha[-1, 0]), int(alpha[-1, -1])]
            if any(c > 128 for c in corners):
                frame_border_leaks.append(f"{k}:{corners}")
        if bad_frames:
            errors.append(f"Empty/tiny frames: {bad_frames}")
        if frame_border_leaks:
            errors.append(f"Frame corner opaque matte leaks: {frame_border_leaks}")

        report["atlas"] = {
            "width": atlas_img.width,
            "height": atlas_img.height,
            "frame_count": len(frames),
            "border_opaque": border_opaque,
            "bad_frames": bad_frames,
            "frame_border_leaks": frame_border_leaks,
        }

    report["ok"] = len(errors) == 0
    report["errors"] = errors
    return report


def run_build(raw_dir: Path = RAW_DIR, root_dir: Path = ROOT_DIR) -> Dict[str, object]:
    """Process all raw world images into production outputs and verify."""
    ui_dir = root_dir / "public" / "assets" / "ui"
    stages_dir = root_dir / "public" / "assets" / "stages"
    atlas_dir = root_dir / "public" / "assets" / "atlases"

    title_raw = find_raw_file("title-bg", raw_dir=raw_dir)
    if title_raw is None:
        raise FileNotFoundError(f"Missing raw title-bg image in {raw_dir}")
    process_title_bg(title_raw, ui_dir / "title-bg.jpg")

    for sid in STAGE_IDS:
        stage_raw = find_raw_file(f"stage_{sid}", raw_dir=raw_dir) or find_raw_file(sid, raw_dir=raw_dir)
        if stage_raw is None:
            raise FileNotFoundError(f"Missing raw stage texture stage_{sid} in {raw_dir}")
        make_seamless_tile(stage_raw, stages_dir / f"{sid}.jpg")

    sprites: Dict[str, Image.Image] = {}
    if find_raw_file("props_sheet", raw_dir=raw_dir) is not None:
        sprites.update(extract_sheet_sprites(DEFAULT_PROPS_SHEET, raw_dir=raw_dir))
    if find_raw_file("chests_sheet", raw_dir=raw_dir) is not None:
        sprites.update(extract_sheet_sprites(DEFAULT_CHESTS_SHEET, raw_dir=raw_dir))

    for name in EXPECTED_WORLD_FRAMES:
        indiv = find_raw_file(name, raw_dir=raw_dir)
        if indiv is not None:
            img = Image.open(indiv).convert("RGB")
            arr = np.asarray(img, dtype=np.float32)
            bg_c, is_mag = _estimate_bg_color(arr)
            bg_m = _flood_background_mask(arr, bg_c, is_mag)
            sprites[name] = _trim_and_fit(_refine_sprite_rgba(arr, bg_m, bg_c, is_mag), FRAME_MAX_DIM.get(name, 128))

    missing_sprites = [n for n in EXPECTED_WORLD_FRAMES if n not in sprites]
    if missing_sprites:
        raise FileNotFoundError(f"Missing extracted sprites: {missing_sprites}")

    pack_world_atlas(sprites, atlas_dir / "world.png", atlas_dir / "world.json")
    return verify_all(root_dir=root_dir)


def run_self_test() -> None:
    """Smoke-test all PIL algorithms on temporary synthetic images."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        tmp_root = Path(tmp)
        raw = tmp_root / "raw"
        raw.mkdir(parents=True)

        yy, xx = np.mgrid[0:720, 0:1280].astype(np.float32)
        title_arr = np.stack([xx / 1280.0 * 90, yy / 720.0 * 40, np.full_like(xx, 60.0)], axis=-1)
        Image.fromarray(title_arr.astype(np.uint8)).save(raw / "title-bg.png")

        rng = np.random.default_rng(42)
        for sid in STAGE_IDS:
            base = rng.integers(30, 140, size=(768, 768, 3), dtype=np.uint8)
            base[:, :384, 0] = np.clip(base[:, :384, 0].astype(int) + 35, 0, 255).astype(np.uint8)
            Image.fromarray(base).filter(ImageFilter.GaussianBlur(radius=3)).save(raw / f"stage_{sid}.png")

        def make_sheet(cols: int, rows: int, path: Path) -> None:
            cw, ch = 160, 160
            canvas = np.full((rows * ch, cols * cw, 3), (255, 0, 255), dtype=np.uint8)
            for r in range(rows):
                for c in range(cols):
                    cy, cx = r * ch + ch // 2, c * cw + cw // 2
                    canvas[cy - 36 : cy + 36, cx - 30 : cx + 30] = (140, 110, 80)
                    canvas[cy - 8 : cy + 8, cx - 8 : cx + 8] = (245, 40, 230)
            Image.fromarray(canvas).save(path)

        make_sheet(5, 2, raw / "props_sheet.png")
        make_sheet(4, 2, raw / "chests_sheet.png")

        rep = run_build(raw_dir=raw, root_dir=tmp_root)
        assert rep["ok"], f"Self-test failed: {rep}"
        print("Self-test passed:", json.dumps(rep, indent=2))


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Build & verify world art assets")
    parser.add_argument("--verify-only", action="store_true", help="Only verify public/assets outputs")
    parser.add_argument("--self-test", action="store_true", help="Run synthetic pipeline self-test")
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR, help="Raw input image directory")
    args = parser.parse_args(argv)

    if args.self_test:
        run_self_test()
        return 0
    if args.verify_only:
        rep = verify_all(ROOT_DIR)
    else:
        rep = run_build(raw_dir=args.raw_dir, root_dir=ROOT_DIR)

    print(json.dumps(rep, indent=2))
    return 0 if rep["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
