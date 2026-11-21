#!/usr/bin/env python3
"""Entity, VFX & UI Icon Asset Pipeline for Vampire Survivors: Ashen Night.

Processes all 20 raw sprite sheets staged in `tools/raw_entities/` (plus read-only
Row 1 from `tools/raw_world/chests_sheet.*` for 96x96 chest icons):
1. Extracts clean alpha via JPEG-tolerant border flood-fill, strict enclosed
   pure-magenta hole removal, and chroma-unmixing spill suppression.
2. Slices multi-cell grids using connected-component cell ownership with
   valley-seeking cut fallback so extended weapons/claws are never clipped.
3. Applies 1px dark gothic outline (around solid alpha >= 180 core only, so
   luminous magic/fire/spectral halos blend smoothly) + top-left rim-light.
4. Foot-aligns grounded 4-frame walk cycles and center-aligns flying/floating
   cycles into 128x128 (heroes/regulars) and 192x192 (bosses).
5. Packs Phaser 3 JSON Hash atlases (`entities.png/json`, `vfx.png/json`).
6. Exports crisp 96x96 transparent PNG icons for 100% of canonical UI IDs.
"""

from __future__ import annotations

import argparse
from collections import deque
from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_ASSETS = ROOT / "public" / "assets"
ATLAS_DIR = PUBLIC_ASSETS / "atlases"
ICON_DIR = PUBLIC_ASSETS / "icons"
RAW_DIR = ROOT / "tools" / "raw_entities"
RAW_WORLD_DIR = ROOT / "tools" / "raw_world"

HERO_IDS: list[str] = [
    "antonio", "imelda", "pasqualina", "gennaro",
    "arca", "porta", "lama", "poe",
    "clerici", "dommario", "krochi", "christine",
    "pugnala", "mortaccio", "cavallo", "red_death",
]

BASE_WEAPON_IDS: list[str] = [
    "whip", "magic_wand", "knife", "axe", "cross",
    "king_bible", "fire_wand", "garlic", "santa_water", "runetracer",
    "lightning_ring", "pentagram", "peachone", "ebony_wings", "phiera",
    "eight_sparrow", "bone", "cherry_bomb", "clock_lancet", "laurel",
]

EVOLVED_WEAPON_IDS: list[str] = [
    "bloody_tear", "holy_wand", "thousand_edge", "death_spiral", "heaven_sword",
    "unholy_vespers", "hellfire", "soul_eater", "la_borra", "no_future",
    "thunder_loop", "gorgeous_moon", "vandalier", "phieraggi",
]

PASSIVE_IDS: list[str] = [
    "spinach", "armor", "hollow_heart", "pummarola",
    "empty_tome", "candelabrador", "bracer", "spellbinder",
    "duplicator", "wings", "attract_orb", "crown",
    "clover", "stone_mask", "tiragisu", "skull_omaniac",
]

ARCANA_IDS: list[str] = [
    "arcana_iv_awake", "arcana_vi_sarabande", "arcana_vii_iron_blue",
    "arcana_viii_mad_groove", "arcana_ix_divine_bloodline", "arcana_xi_waltz_pearls",
    "arcana_xii_out_of_bounds", "arcana_xvi_slash", "arcana_xvii_lost_painting",
    "arcana_xviii_boogaloo", "arcana_xix_heart_of_fire", "arcana_xx_silent_sanctuary",
]

POWERUP_IDS: list[str] = [
    "might", "armor", "max_health", "recovery", "cooldown",
    "area", "speed", "duration", "amount", "move_speed",
    "magnet", "luck", "growth", "greed", "curse",
    "revival", "reroll", "skip", "banish",
]

RELIC_IDS: list[str] = [
    "relic_grimoire", "relic_map", "relic_ars_gouda",
    "relic_randomazzo", "relic_yellow_sign",
]

STAGE_IDS: list[str] = [
    "mad_forest", "inlaid_library", "dairy_plant",
    "gallo_tower", "cappella_magna",
]

REGULAR_ENEMY_IDS: list[str] = [
    "bat_brown", "bat_swarm", "zombie", "skeleton", "skeleton_armored",
    "ghost", "werewolf", "mudman", "mummy", "dust_elemental",
    "nesuferit_mage", "lizardman", "iron_golem", "harpy", "dragon_shrimp",
    "imp_demon", "archdemon", "blood_knight",
]

BOSS_ENEMY_IDS: list[str] = [
    "boss_giant_bat", "boss_werewolf_alpha", "boss_blue_venus",
    "boss_hag", "boss_nesuferit", "boss_sword_guardian",
    "boss_giant_crab", "boss_trinacria", "reaper_stalker", "reaper_red_death",
]

ENEMY_IDS: list[str] = REGULAR_ENEMY_IDS + BOSS_ENEMY_IDS

PICKUP_IDS: list[str] = [
    "xp_blue", "xp_green", "xp_red", "xp_gold",
    "coin", "gold_bag", "rich_gold_bag",
    "roast_chicken", "vacuum_orb", "rosary", "orologion",
    "chest_bronze", "chest_silver", "chest_gold", "chest_arcana",
]

VFX_ONLY_FRAMES: list[str] = [
    "whip_slash", "bloody_tear_slash", "magic_bolt", "holy_bolt",
    "knife_blade", "axe_spin", "death_scythe", "holy_cross", "heaven_blade",
    "bible_page", "vesper_tome", "fireball", "hellfire_meteor",
    "garlic_ring", "soul_eater_ring", "santa_flask", "water_pool", "borra_pool",
    "runetracer_diamond", "lightning_bolt", "pentagram_sigil",
    "bird_white", "bird_ebony", "vandalier_beam",
    "bullet_red", "bullet_blue", "phieraggi_beam_cap",
    "bone_proj", "cherry_bomb_proj", "clock_hand", "laurel_shield",
    "hit_spark", "explosion_ring",
]

VFX_PICKUP_FRAMES: list[str] = [
    "xp_blue", "xp_green", "xp_red", "xp_gold",
    "coin", "gold_bag", "rich_gold_bag",
    "roast_chicken", "vacuum_orb", "rosary", "orologion",
    *RELIC_IDS,
]

ALL_VFX_FRAMES: list[str] = VFX_ONLY_FRAMES + VFX_PICKUP_FRAMES

ALL_ICON_IDS: list[str] = list(dict.fromkeys([
    *HERO_IDS,
    *BASE_WEAPON_IDS,
    *EVOLVED_WEAPON_IDS,
    *PASSIVE_IDS,
    *ARCANA_IDS,
    *POWERUP_IDS,
    *RELIC_IDS,
    *STAGE_IDS,
    *ENEMY_IDS,
    *PICKUP_IDS,
]))

GLOW_VFX_SET: set[str] = {
    "whip_slash", "bloody_tear_slash", "magic_bolt", "holy_bolt",
    "fireball", "hellfire_meteor", "garlic_ring", "soul_eater_ring",
    "water_pool", "borra_pool", "runetracer_diamond", "lightning_bolt",
    "pentagram_sigil", "vandalier_beam", "bullet_red", "bullet_blue",
    "phieraggi_beam_cap", "laurel_shield", "hit_spark", "explosion_ring",
}

FLYING_ENTITIES: set[str] = {
    "bat_brown", "bat_swarm", "ghost", "dust_elemental", "harpy",
    "boss_giant_bat", "boss_nesuferit", "boss_sword_guardian",
    "boss_trinacria", "reaper_stalker",
}

GLOW_ENTITIES: set[str] = {
    "ghost", "dust_elemental", "boss_sword_guardian",
}

FULL_BODY_ICON_ENTITIES: set[str] = {
    "bat_brown", "bat_swarm", "ghost", "dust_elemental", "dragon_shrimp",
    "boss_giant_bat", "boss_blue_venus", "boss_giant_crab", "boss_trinacria",
}


@dataclass(frozen=True)
class SheetSpec:
    stem: str
    kind: str  # "walk_hero" | "walk_regular" | "walk_boss" | "vfx_pickups" | "icons" | "icons_passives_relics"
    cols: int
    rows: int
    items: tuple[str, ...]


SHEET_SPECS: list[SheetSpec] = [
    SheetSpec("heroes_1", "walk_hero", 4, 4, ("antonio", "imelda", "pasqualina", "gennaro")),
    SheetSpec("heroes_2", "walk_hero", 4, 4, ("arca", "porta", "lama", "poe")),
    SheetSpec("heroes_3", "walk_hero", 4, 4, ("clerici", "dommario", "krochi", "christine")),
    SheetSpec("heroes_4", "walk_hero", 4, 4, ("pugnala", "mortaccio", "cavallo", "red_death")),
    SheetSpec("enemies_1", "walk_regular", 4, 4, ("bat_brown", "bat_swarm", "zombie", "skeleton")),
    SheetSpec("enemies_2", "walk_regular", 4, 4, ("skeleton_armored", "ghost", "werewolf", "mudman")),
    SheetSpec("enemies_3", "walk_regular", 4, 4, ("mummy", "dust_elemental", "nesuferit_mage", "lizardman")),
    SheetSpec("enemies_4", "walk_regular", 4, 4, ("iron_golem", "harpy", "dragon_shrimp", "imp_demon")),
    SheetSpec("enemies_5", "walk_regular", 4, 2, ("archdemon", "blood_knight")),
    SheetSpec("bosses_1", "walk_boss", 4, 4, ("boss_giant_bat", "boss_werewolf_alpha", "boss_blue_venus", "boss_hag")),
    SheetSpec("bosses_2", "walk_boss", 4, 4, ("boss_nesuferit", "boss_sword_guardian", "boss_giant_crab", "boss_trinacria")),
    SheetSpec("bosses_3", "walk_boss", 4, 2, ("reaper_stalker", "reaper_red_death")),
    SheetSpec("vfx_1", "vfx_pickups", 6, 4, (
        "whip_slash", "bloody_tear_slash", "magic_bolt", "holy_bolt", "knife_blade", "axe_spin",
        "death_scythe", "holy_cross", "heaven_blade", "bible_page", "vesper_tome", "fireball",
        "hellfire_meteor", "garlic_ring", "soul_eater_ring", "santa_flask", "water_pool", "borra_pool",
        "runetracer_diamond", "lightning_bolt", "pentagram_sigil", "bird_white", "bird_ebony", "vandalier_beam",
    )),
    SheetSpec("vfx_2", "vfx_pickups", 6, 4, (
        "bullet_red", "bullet_blue", "phieraggi_beam_cap", "bone_proj", "cherry_bomb_proj", "clock_hand",
        "laurel_shield", "hit_spark", "explosion_ring", "xp_blue", "xp_green", "xp_red",
        "xp_gold", "coin", "gold_bag", "rich_gold_bag", "roast_chicken", "vacuum_orb",
        "rosary", "orologion", "relic_grimoire", "relic_map", "relic_ars_gouda", "relic_randomazzo",
    )),
    SheetSpec("icons_weapons_base", "icons", 5, 4, (
        "whip", "magic_wand", "knife", "axe", "cross",
        "king_bible", "fire_wand", "garlic", "santa_water", "runetracer",
        "lightning_ring", "pentagram", "peachone", "ebony_wings", "phiera",
        "eight_sparrow", "bone", "cherry_bomb", "clock_lancet", "laurel",
    )),
    SheetSpec("icons_weapons_evolved", "icons", 5, 3, (
        "bloody_tear", "holy_wand", "thousand_edge", "death_spiral", "heaven_sword",
        "unholy_vespers", "hellfire", "soul_eater", "la_borra", "no_future",
        "thunder_loop", "gorgeous_moon", "vandalier", "phieraggi", "",
    )),
    SheetSpec("icons_passives_relics", "icons_passives_relics", 6, 4, (
        "spinach", "armor", "hollow_heart", "pummarola", "empty_tome", "candelabrador",
        "bracer", "spellbinder", "duplicator", "wings", "attract_orb", "crown",
        "clover", "stone_mask", "tiragisu", "skull_omaniac", "relic_grimoire", "relic_map",
        "relic_ars_gouda", "relic_randomazzo", "relic_yellow_sign", "", "", "",
    )),
    SheetSpec("icons_arcanas", "icons", 4, 3, (
        "arcana_iv_awake", "arcana_vi_sarabande", "arcana_vii_iron_blue", "arcana_viii_mad_groove",
        "arcana_ix_divine_bloodline", "arcana_xi_waltz_pearls", "arcana_xii_out_of_bounds", "arcana_xvi_slash",
        "arcana_xvii_lost_painting", "arcana_xviii_boogaloo", "arcana_xix_heart_of_fire", "arcana_xx_silent_sanctuary",
    )),
    SheetSpec("icons_powerups", "icons", 5, 4, (
        "might", "armor", "max_health", "recovery", "cooldown",
        "area", "speed", "duration", "amount", "move_speed",
        "magnet", "luck", "growth", "greed", "curse",
        "revival", "reroll", "skip", "banish", "",
    )),
    SheetSpec("icons_stages", "icons", 3, 2, (
        "mad_forest", "inlaid_library", "dairy_plant",
        "gallo_tower", "cappella_magna", "",
    )),
]


def find_raw_sheet(stem: str, base_dir: Path = RAW_DIR) -> Path | None:
    """Locate a staged sheet (.png, .jpg, .jpeg, .webp) in base_dir."""
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        p = base_dir / f"{stem}{ext}"
        if p.exists():
            return p
    return None


def extract_magenta_alpha(
    img: Image.Image,
    tolerance: float = 108.0,
    glow_mode: bool = False,
    strict_holes: bool = False,
) -> Image.Image:
    """Remove solid #FF00FF studio background via JPEG-tolerant border flood-fill + chroma unmixing."""
    rgba = img.convert("RGBA")
    arr = np.array(rgba, dtype=np.float32)
    h, w, _ = arr.shape
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]

    border_pixels = np.concatenate([
        arr[0, :, :3], arr[-1, :, :3], arr[:, 0, :3], arr[:, -1, :3],
    ], axis=0)
    mag_border = (border_pixels[:, 0] > 140) & (border_pixels[:, 2] > 140) & (border_pixels[:, 1] < 120)
    bg_rgb = (
        np.median(border_pixels[mag_border], axis=0)
        if np.any(mag_border)
        else np.array([255.0, 0.0, 255.0], dtype=np.float32)
    )

    dist = np.sqrt(
        (r - bg_rgb[0]) ** 2 +
        (g - bg_rgb[1]) ** 2 +
        (b - bg_rgb[2]) ** 2
    )
    mag_excess = np.minimum(r, b) - g
    is_bg_candidate = (a < 16) | ((dist < tolerance) & (mag_excess > 40))

    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg_candidate[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg_candidate[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))

    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_bg_candidate[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    if strict_holes:
        interior_pure_magenta = (~visited) & (dist < 118.0) & (mag_excess > 92.0) & (b > 110.0)
    else:
        interior_pure_magenta = (~visited) & (dist < 88.0) & (mag_excess > 128.0)
    removed = visited | interior_pure_magenta
    arr[removed, 3] = 0.0

    kernel = 13 if glow_mode else 7
    dilated = np.array(
        Image.fromarray((removed.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(kernel)),
        dtype=np.uint8,
    ) > 127
    fringe = dilated & (~removed) & (arr[:, :, 3] > 0)

    fringe_mag = fringe & (mag_excess > 6.0) & (dist < 205.0)
    if np.any(fringe_mag):
        low_d = 34.0
        high_d = 188.0 if glow_mode else 145.0
        alpha_est = np.clip((dist[fringe_mag] - low_d) / (high_d - low_d), 0.05, 1.0)
        inv_bg = 1.0 - alpha_est
        for ch, bg_c in enumerate(bg_rgb):
            unmixed = (arr[fringe_mag, ch] - inv_bg * bg_c) / np.maximum(alpha_est, 0.12)
            arr[fringe_mag, ch] = np.clip(unmixed, 0.0, 255.0)
        arr[fringe_mag, 3] = np.clip(arr[fringe_mag, 3] * alpha_est, 0.0, 255.0)

    # Despill 1px and 2px outer rims cleanly so dark ink edges never retain JPEG purple halos
    rem_img = Image.fromarray((removed.astype(np.uint8) * 255))
    rim1 = (np.array(rem_img.filter(ImageFilter.MaxFilter(3)), dtype=np.uint8) > 127) & (~removed) & (arr[:, :, 3] > 0)
    rim2 = (np.array(rem_img.filter(ImageFilter.MaxFilter(5)), dtype=np.uint8) > 127) & (~removed) & (~rim1) & (arr[:, :, 3] > 0)
    for rim_mask, strength in ((rim1, 0.98), (rim2, 0.62)):
        ex = np.minimum(arr[:, :, 0], arr[:, :, 2]) - arr[:, :, 1]
        spill = rim_mask & (ex > 6.0)
        if np.any(spill):
            delta = (ex[spill] - 3.0) * strength
            arr[spill, 0] = np.clip(arr[spill, 0] - delta, 0.0, 255.0)
            arr[spill, 2] = np.clip(arr[spill, 2] - delta, 0.0, 255.0)

    return Image.fromarray(arr.astype(np.uint8), mode="RGBA")


def slice_grid_owned(sheet: Image.Image, cols: int, rows: int, glow_mode: bool = False) -> list[Image.Image]:
    """Extract alpha across full sheet and assign connected components cleanly to cells without clipping."""
    clean = extract_magenta_alpha(sheet, glow_mode=glow_mode)
    arr = np.array(clean, dtype=np.uint8)
    h, w, _ = arr.shape
    alpha = arr[:, :, 3]
    cw = w / cols
    ch = h / rows

    # Compute valley-seeking grid lines as fallback boundaries for any merged components
    col_cuts = [0]
    search_x = max(6, int(w * 0.055))
    alpha_f = alpha.astype(np.float32)
    for c in range(1, cols):
        nom = int(round(c * cw))
        lo = max(col_cuts[-1] + 8, nom - search_x)
        hi = min(w - 8, nom + search_x)
        col_energy = alpha_f[:, lo:hi + 1].sum(axis=0)
        best_idx = int(np.argmin(col_energy + np.abs(np.arange(lo, hi + 1) - nom) * 0.5))
        col_cuts.append(lo + best_idx)
    col_cuts.append(w)

    row_cuts = [0]
    search_y = max(6, int(h * 0.055))
    for r in range(1, rows):
        nom = int(round(r * ch))
        lo = max(row_cuts[-1] + 8, nom - search_y)
        hi = min(h - 8, nom + search_y)
        row_energy = alpha_f[lo:hi + 1, :].sum(axis=1)
        best_idx = int(np.argmin(row_energy + np.abs(np.arange(lo, hi + 1) - nom) * 0.5))
        row_cuts.append(lo + best_idx)
    row_cuts.append(h)

    # Label connected components of alpha > 16 using fast 8-connected BFS
    mask = alpha > 16
    labels = np.zeros((h, w), dtype=np.int32)
    comp_stats: list[tuple[int, int, int, int, int, float, float]] = []  # (id, area, minx, miny, maxx, maxy, cx, cy)
    comp_id = 0
    for y in range(h):
        for x in range(w):
            if mask[y, x] and labels[y, x] == 0:
                comp_id += 1
                q: deque[tuple[int, int]] = deque([(y, x)])
                labels[y, x] = comp_id
                area = 0
                sum_x = 0.0
                sum_y = 0.0
                min_x, max_x, min_y, max_y = x, x, y, y
                while q:
                    cy, cx = q.popleft()
                    area += 1
                    sum_x += cx
                    sum_y += cy
                    if cx < min_x:
                        min_x = cx
                    if cx > max_x:
                        max_x = cx
                    if cy < min_y:
                        min_y = cy
                    if cy > max_y:
                        max_y = cy
                    for dy in (-1, 0, 1):
                        ny = cy + dy
                        if ny < 0 or ny >= h:
                            continue
                        for dx in (-1, 0, 1):
                            if dx == 0 and dy == 0:
                                continue
                            nx = cx + dx
                            if 0 <= nx < w and mask[ny, nx] and labels[ny, nx] == 0:
                                labels[ny, nx] = comp_id
                                q.append((ny, nx))
                comp_stats.append((comp_id, area, min_x, min_y, max_x, max_y, sum_x / area, sum_y / area))

    cell_arrays = [np.zeros((h, w, 4), dtype=np.uint8) for _ in range(rows * cols)]
    cell_bounds = [[w, h, 0, 0] for _ in range(rows * cols)]  # minx, miny, maxx, maxy

    for cid, area, minx, miny, maxx, maxy, cx, cy in comp_stats:
        if area <= 10:
            continue
        comp_w = maxx - minx + 1
        comp_h = maxy - miny + 1
        # If component spans more than 1.28x cell width or height, split via valley cuts
        if comp_w > cw * 1.28 or comp_h > ch * 1.28:
            comp_mask = labels == cid
            for r in range(rows):
                for c in range(cols):
                    y0, y1 = row_cuts[r], row_cuts[r + 1]
                    x0, x1 = col_cuts[c], col_cuts[c + 1]
                    sub = comp_mask[y0:y1, x0:x1]
                    if np.any(sub):
                        idx = r * cols + c
                        cell_arrays[idx][y0:y1, x0:x1][sub] = arr[y0:y1, x0:x1][sub]
                        cell_bounds[idx][0] = min(cell_bounds[idx][0], x0)
                        cell_bounds[idx][1] = min(cell_bounds[idx][1], y0)
                        cell_bounds[idx][2] = max(cell_bounds[idx][2], x1 - 1)
                        cell_bounds[idx][3] = max(cell_bounds[idx][3], y1 - 1)
        else:
            # Assign entire unclipped component to best matching cell center
            best_idx = 0
            best_d2 = 1e18
            for r in range(rows):
                rcy = (r + 0.5) * ch
                for c in range(cols):
                    rcx = (c + 0.5) * cw
                    d2 = ((cx - rcx) / cw) ** 2 + ((cy - rcy) / ch) ** 2
                    if d2 < best_d2:
                        best_d2 = d2
                        best_idx = r * cols + c
            sub = labels == cid
            cell_arrays[best_idx][sub] = arr[sub]
            cell_bounds[best_idx][0] = min(cell_bounds[best_idx][0], minx)
            cell_bounds[best_idx][1] = min(cell_bounds[best_idx][1], miny)
            cell_bounds[best_idx][2] = max(cell_bounds[best_idx][2], maxx)
            cell_bounds[best_idx][3] = max(cell_bounds[best_idx][3], maxy)

    cells: list[Image.Image] = []
    for idx in range(rows * cols):
        minx, miny, maxx, maxy = cell_bounds[idx]
        if maxx < minx or maxy < miny:
            cells.append(Image.new("RGBA", (max(1, int(cw)), max(1, int(ch))), (0, 0, 0, 0)))
        else:
            pad = 4
            x0 = max(0, minx - pad)
            y0 = max(0, miny - pad)
            x1 = min(w, maxx + pad + 1)
            y1 = min(h, maxy + pad + 1)
            cells.append(Image.fromarray(cell_arrays[idx][y0:y1, x0:x1], mode="RGBA"))
    return cells


def clean_pentagram_holes(cell: Image.Image) -> Image.Image:
    """Remove glowing crimson-pink #FF00FF remnants trapped inside pentagram_sigil."""
    arr = np.array(cell.convert("RGBA"), dtype=np.float32)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    dist = np.sqrt((r - 255.0) ** 2 + g ** 2 + (b - 255.0) ** 2)
    mag_excess = np.minimum(r, b) - g
    hole = (a > 0) & (dist < 130.0) & (mag_excess > 95.0) & (b > 135.0) & (g < 75.0)
    arr[hole, 3] = 0.0
    # Unmix soft red-over-magenta glow inside pentagram inner edges
    soft = (a > 0) & (~hole) & (b > 85.0) & (r > b + 20.0) & (g < 85.0)
    if np.any(soft):
        fade = np.clip(1.0 - (b[soft] - 85.0) / 145.0, 0.25, 1.0)
        arr[soft, 2] = np.clip(arr[soft, 2] * 0.28, 0.0, 255.0)
        arr[soft, 3] = np.clip(arr[soft, 3] * fade, 0.0, 255.0)
    return Image.fromarray(arr.astype(np.uint8), mode="RGBA")


def enhance_gothic_sprite(
    img: Image.Image,
    outline_px: int = 1,
    rim_boost: float = 0.16,
    midtone_lift: float = 1.0,
    outline_color: tuple[int, int, int] = (14, 10, 18),
) -> Image.Image:
    """Apply crisp 1px dark outline around solid core (alpha >= 180) and subtle top-left rim-light."""
    rgba = img.convert("RGBA")
    arr = np.array(rgba, dtype=np.float32)
    alpha = arr[:, :, 3]

    if midtone_lift != 1.0:
        vis = alpha > 40
        for ch in range(3):
            # Lift dark midtones while preserving bright highlights
            v = arr[vis, ch] / 255.0
            lifted = np.power(np.clip(v, 0.0, 1.0), 1.0 / midtone_lift) * 255.0
            arr[vis, ch] = np.clip(lifted, 0.0, 255.0)

    if rim_boost > 0:
        shifted = np.zeros_like(alpha)
        shifted[1:, 1:] = alpha[:-1, :-1]
        rim_mask = (alpha > 140) & (shifted < 64)
        arr[rim_mask, 0] = np.clip(arr[rim_mask, 0] + 255.0 * rim_boost, 0, 255)
        arr[rim_mask, 1] = np.clip(arr[rim_mask, 1] + 240.0 * rim_boost, 0, 255)
        arr[rim_mask, 2] = np.clip(arr[rim_mask, 2] + 225.0 * rim_boost, 0, 255)

    base = Image.fromarray(arr.astype(np.uint8), mode="RGBA")
    if outline_px <= 0:
        return base

    # Outline ONLY solid core pixels (alpha >= 180) so glowing halos radiate freely outside the outline
    solid_a = ((alpha >= 180).astype(np.uint8) * 255)
    dilated_a = Image.fromarray(solid_a).filter(ImageFilter.MaxFilter(outline_px * 2 + 1))
    outline_arr = np.zeros((base.height, base.width, 4), dtype=np.uint8)
    outline_arr[:, :, 0] = outline_color[0]
    outline_arr[:, :, 1] = outline_color[1]
    outline_arr[:, :, 2] = outline_color[2]
    outline_arr[:, :, 3] = np.array(dilated_a, dtype=np.uint8)
    outline_img = Image.fromarray(outline_arr, mode="RGBA")
    outline_img.alpha_composite(base)
    return outline_img


def fit_and_align_frame(
    sprite: Image.Image,
    target_w: int,
    target_h: int,
    foot_align: bool = True,
    pad_x: int = 6,
    pad_top: int = 8,
    pad_bottom: int = 6,
) -> Image.Image:
    """Fit sprite cleanly inside target canvas, aligning bottom foot line when requested."""
    rgba = sprite.convert("RGBA")
    bbox = rgba.getbbox()
    if not bbox:
        return Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    cropped = rgba.crop(bbox)
    cw, ch = cropped.size
    avail_w = max(8, target_w - 2 * pad_x)
    avail_h = max(8, target_h - pad_top - pad_bottom)
    scale = min(avail_w / cw, avail_h / ch)
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    dx = (target_w - nw) // 2
    dy = (target_h - pad_bottom - nh) if foot_align else ((target_h - nh) // 2)
    canvas.alpha_composite(resized, (dx, max(0, dy)))
    return canvas


def synthesize_bob_frame(frame: Image.Image, dx: int = 1, dy: int = -2) -> Image.Image:
    """Create a subtle walk-bob variant from an adjacent frame."""
    return ImageChops.offset(frame.convert("RGBA"), dx, dy)


def align_walk_cycle(
    entity_id: str,
    raw_frames: list[Image.Image],
    target_size: int,
    outline_px: int = 1,
    rim_boost: float = 0.20,
    midtone_lift: float = 1.0,
) -> list[Image.Image]:
    """Scale and align a 4-frame walk cycle consistently."""
    trimmed = [f.crop(f.getbbox()) if f.getbbox() else Image.new("RGBA", (16, 16), (0, 0, 0, 0)) for f in raw_frames]
    max_w = max(im.width for im in trimmed)
    max_h = max(im.height for im in trimmed)
    pad = 8 if target_size <= 128 else 10
    avail = target_size - 2 * pad
    scale = min(avail / max(1, max_w), avail / max(1, max_h))
    is_flying = entity_id in FLYING_ENTITIES

    out: list[Image.Image] = []
    for im in trimmed:
        nw = max(1, int(round(im.width * scale)))
        nh = max(1, int(round(im.height * scale)))
        resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
        styled = enhance_gothic_sprite(
            resized,
            outline_px=outline_px,
            rim_boost=rim_boost,
            midtone_lift=midtone_lift,
        )
        canvas = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
        dx = (target_size - styled.width) // 2
        if is_flying:
            dy = (target_size - styled.height) // 2
        else:
            dy = target_size - pad - styled.height
        canvas.alpha_composite(styled, (max(0, dx), max(0, dy)))
        out.append(canvas)
    return out


def make_portrait_icon(entity_id: str, raw_frame0: Image.Image, midtone_lift: float = 1.0) -> Image.Image:
    """Create a crisp 96x96 transparent portrait icon from an entity's frame 0."""
    bbox = raw_frame0.getbbox()
    if not bbox:
        return Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    cropped = raw_frame0.crop(bbox)
    if entity_id not in FULL_BODY_ICON_ENTITIES and cropped.height > cropped.width * 1.15:
        cut_h = int(round(cropped.height * 0.72))
        cropped = cropped.crop((0, 0, cropped.width, max(16, cut_h)))
    styled = enhance_gothic_sprite(
        cropped,
        outline_px=0 if entity_id in GLOW_ENTITIES else 1,
        rim_boost=0.22,
        midtone_lift=midtone_lift,
    )
    return fit_and_align_frame(styled, 96, 96, foot_align=False, pad_x=5, pad_top=5, pad_bottom=5)


def make_item_icon(raw_cell: Image.Image, glow: bool = False) -> Image.Image:
    """Create a crisp 96x96 transparent UI icon."""
    styled = enhance_gothic_sprite(
        raw_cell,
        outline_px=0 if glow else 1,
        rim_boost=0.12 if glow else 0.16,
    )
    return fit_and_align_frame(styled, 96, 96, foot_align=False, pad_x=5, pad_top=5, pad_bottom=5)


def make_vfx_frame(raw_cell: Image.Image, frame_id: str) -> Image.Image:
    """Prepare a sharp VFX or pickup frame for the vfx atlas."""
    bbox = raw_cell.getbbox()
    if not bbox:
        return Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    cropped = raw_cell.crop(bbox)
    is_glow = frame_id in GLOW_VFX_SET
    target = 96 if (
        "slash" in frame_id or "pool" in frame_id or "ring" in frame_id
        or "sigil" in frame_id or "beam" in frame_id or "meteor" in frame_id
    ) else 72
    if frame_id in VFX_PICKUP_FRAMES:
        target = 64
    styled = enhance_gothic_sprite(
        cropped,
        outline_px=0 if is_glow else 1,
        rim_boost=0.06 if is_glow else 0.15,
    )
    return fit_and_align_frame(styled, target, target, foot_align=False, pad_x=4, pad_top=4, pad_bottom=4)


def pack_phaser_hash_atlas(
    frames: dict[str, Image.Image],
    out_png: Path,
    out_json: Path,
    padding: int = 2,
    max_width: int = 2048,
) -> dict:
    """Pack frames into a Phaser 3 JSON Hash atlas with shelf packing and padding."""
    items = list(frames.items())
    items.sort(key=lambda kv: (-kv[1].height, -kv[1].width, kv[0]))

    placements: dict[str, tuple[int, int, int, int]] = {}
    x = padding
    y = padding
    shelf_h = 0
    atlas_w = 0
    for key, im in items:
        fw, fh = im.size
        if x + fw + padding > max_width and x > padding:
            x = padding
            y += shelf_h + padding
            shelf_h = 0
        placements[key] = (x, y, fw, fh)
        atlas_w = max(atlas_w, x + fw + padding)
        x += fw + padding
        shelf_h = max(shelf_h, fh)

    atlas_h = y + shelf_h + padding
    atlas_img = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    json_frames: dict[str, dict] = {}

    for key in sorted(frames.keys()):
        im = frames[key]
        px, py, fw, fh = placements[key]
        atlas_img.alpha_composite(im.convert("RGBA"), (px, py))
        json_frames[key] = {
            "frame": {"x": px, "y": py, "w": fw, "h": fh},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": fw, "h": fh},
            "sourceSize": {"w": fw, "h": fh},
            "pivot": {"x": 0.5, "y": 0.5},
        }

    out_png.parent.mkdir(parents=True, exist_ok=True)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    atlas_img.save(out_png, "PNG", optimize=True)

    meta = {
        "frames": json_frames,
        "meta": {
            "app": "tools/art_entities.py",
            "version": "1.0",
            "image": out_png.name,
            "format": "RGBA8888",
            "size": {"w": atlas_w, "h": atlas_h},
            "scale": "1",
        },
    }
    out_json.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def process_all_sheets() -> None:
    """Process all staged sheets in tools/raw_entities/ (+ chests_sheet) into atlases and 96x96 icons."""
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    entity_frames: dict[str, Image.Image] = {}
    vfx_frames: dict[str, Image.Image] = {}

    missing_sheets: list[str] = []
    for spec in SHEET_SPECS:
        raw_path = find_raw_sheet(spec.stem)
        if raw_path is None:
            missing_sheets.append(spec.stem)
            continue

        print(f"Processing {raw_path.name} ({spec.cols}x{spec.rows}, {spec.kind})...")
        sheet = Image.open(raw_path)
        glow_sheet = (
            spec.kind in {"vfx_pickups", "icons_passives_relics"}
            or spec.stem in {"icons_weapons_evolved", "icons_weapons_base", "heroes_2", "heroes_3", "enemies_2", "bosses_2"}
        )
        cells = slice_grid_owned(sheet, spec.cols, spec.rows, glow_mode=glow_sheet)

        if spec.kind.startswith("walk_"):
            target_size = 192 if spec.kind == "walk_boss" else 128
            rim = 0.25 if spec.kind == "walk_hero" else 0.22
            lift = 1.08 if spec.kind == "walk_hero" else 1.16
            for r_idx, eid in enumerate(spec.items):
                row_cells = cells[r_idx * spec.cols:(r_idx + 1) * spec.cols]
                # Synthesize frames that dropped signature weapons in raw generation
                if eid == "red_death":
                    row_cells[1] = synthesize_bob_frame(row_cells[0], dx=2, dy=-3)
                elif eid == "pugnala":
                    row_cells[3] = synthesize_bob_frame(row_cells[1], dx=2, dy=-3)
                elif eid == "antonio":
                    row_cells[3] = synthesize_bob_frame(row_cells[1], dx=2, dy=-2)
                outline_px = 0 if eid in GLOW_ENTITIES else 1
                aligned = align_walk_cycle(
                    eid,
                    row_cells,
                    target_size=target_size,
                    outline_px=outline_px,
                    rim_boost=rim,
                    midtone_lift=lift,
                )
                for f_idx, frame_img in enumerate(aligned):
                    entity_frames[f"{eid}_{f_idx}"] = frame_img
                portrait = make_portrait_icon(eid, row_cells[0], midtone_lift=lift)
                portrait.save(ICON_DIR / f"{eid}.png", "PNG", optimize=True)
        elif spec.kind == "vfx_pickups":
            for idx, fid in enumerate(spec.items):
                if not fid:
                    continue
                cell_img = clean_pentagram_holes(cells[idx]) if fid == "pentagram_sigil" else cells[idx]
                vfx_frames[fid] = make_vfx_frame(cell_img, fid)
                if fid in PICKUP_IDS or fid in RELIC_IDS:
                    make_item_icon(cell_img, glow=(fid == "vacuum_orb")).save(
                        ICON_DIR / f"{fid}.png", "PNG", optimize=True
                    )
        elif spec.kind == "icons_passives_relics":
            for idx, item_id in enumerate(spec.items):
                if not item_id:
                    continue
                make_item_icon(cells[idx], glow=False).save(ICON_DIR / f"{item_id}.png", "PNG", optimize=True)
                if item_id in ("relic_yellow_sign", "relic_ars_gouda"):
                    vfx_frames[item_id] = make_vfx_frame(cells[idx], item_id)
        elif spec.kind == "icons":
            for idx, item_id in enumerate(spec.items):
                if not item_id:
                    continue
                out_path = ICON_DIR / f"{item_id}.png"
                if spec.stem == "icons_powerups" and item_id == "armor" and out_path.exists():
                    continue
                make_item_icon(cells[idx], glow=False).save(out_path, "PNG", optimize=True)

    chests_path = find_raw_sheet("chests_sheet", base_dir=RAW_WORLD_DIR)
    if chests_path is not None:
        print(f"Extracting chest icons from {chests_path.name} (read-only)...")
        chest_cells = slice_grid_owned(Image.open(chests_path), 4, 2, glow_mode=False)
        for idx, cid in enumerate(("chest_bronze", "chest_silver", "chest_gold", "chest_arcana")):
            make_item_icon(chest_cells[idx], glow=(cid == "chest_arcana")).save(
                ICON_DIR / f"{cid}.png", "PNG", optimize=True
            )
    else:
        missing_sheets.append("raw_world/chests_sheet")

    if missing_sheets:
        print(f"WARNING: missing raw sheets: {missing_sheets}")

    if entity_frames:
        meta_ent = pack_phaser_hash_atlas(
            entity_frames,
            ATLAS_DIR / "entities.png",
            ATLAS_DIR / "entities.json",
            padding=2,
            max_width=2048,
        )
        print(f"Packed entities.png ({meta_ent['meta']['size']}) with {len(entity_frames)} frames.")

    if vfx_frames:
        meta_vfx = pack_phaser_hash_atlas(
            vfx_frames,
            ATLAS_DIR / "vfx.png",
            ATLAS_DIR / "vfx.json",
            padding=2,
            max_width=1024,
        )
        print(f"Packed vfx.png ({meta_vfx['meta']['size']}) with {len(vfx_frames)} frames.")


def build_contact_sheets(out_dir: Path) -> None:
    """Render dark-background contact sheets for visual inspection of all processed assets."""
    out_dir.mkdir(parents=True, exist_ok=True)
    icon_paths = [(i, ICON_DIR / f"{i}.png") for i in ALL_ICON_IDS if (ICON_DIR / f"{i}.png").exists()]
    if icon_paths:
        cols = 15
        rows = (len(icon_paths) + cols - 1) // cols
        cell = 112
        board = Image.new("RGBA", (cols * cell, rows * cell), (24, 20, 30, 255))
        draw = ImageDraw.Draw(board)
        for idx, (iid, p) in enumerate(icon_paths):
            r, c = divmod(idx, cols)
            x0, y0 = c * cell, r * cell
            draw.rectangle([x0 + 2, y0 + 2, x0 + cell - 3, y0 + cell - 3], outline=(58, 48, 72, 255))
            im = Image.open(p).convert("RGBA")
            board.alpha_composite(im, (x0 + 8, y0 + 4))
            draw.text((x0 + 6, y0 + cell - 14), iid[:14], fill=(215, 205, 195, 255))
        board.save(out_dir / "contact_icons.png", "PNG")

    vfx_json = ATLAS_DIR / "vfx.json"
    vfx_png = ATLAS_DIR / "vfx.png"
    if vfx_json.exists() and vfx_png.exists():
        data = json.loads(vfx_json.read_text(encoding="utf-8"))
        atlas = Image.open(vfx_png).convert("RGBA")
        keys = sorted(data["frames"].keys())
        cols = 7
        rows = (len(keys) + cols - 1) // cols
        cell = 116
        board = Image.new("RGBA", (cols * cell, rows * cell), (22, 18, 28, 255))
        draw = ImageDraw.Draw(board)
        for idx, k in enumerate(keys):
            r, c = divmod(idx, cols)
            x0, y0 = c * cell, r * cell
            fr = data["frames"][k]["frame"]
            crop = atlas.crop((fr["x"], fr["y"], fr["x"] + fr["w"], fr["y"] + fr["h"]))
            draw.rectangle([x0 + 2, y0 + 2, x0 + cell - 3, y0 + cell - 3], outline=(62, 52, 76, 255))
            board.alpha_composite(crop, (x0 + (cell - fr["w"]) // 2, y0 + 6))
            draw.text((x0 + 6, y0 + cell - 14), k[:15], fill=(220, 210, 195, 255))
        board.save(out_dir / "contact_vfx.png", "PNG")

    ent_json = ATLAS_DIR / "entities.json"
    ent_png = ATLAS_DIR / "entities.png"
    if ent_json.exists() and ent_png.exists():
        data = json.loads(ent_json.read_text(encoding="utf-8"))
        atlas = Image.open(ent_png).convert("RGBA")
        for group_name, ids, csize in (
            ("heroes", HERO_IDS, 128),
            ("enemies", REGULAR_ENEMY_IDS, 128),
            ("bosses", BOSS_ENEMY_IDS, 192),
        ):
            board = Image.new("RGBA", (4 * csize, len(ids) * (csize + 16)), (22, 18, 28, 255))
            draw = ImageDraw.Draw(board)
            for r_idx, eid in enumerate(ids):
                y0 = r_idx * (csize + 16)
                for f_idx in range(4):
                    k = f"{eid}_{f_idx}"
                    if k in data["frames"]:
                        fr = data["frames"][k]["frame"]
                        crop = atlas.crop((fr["x"], fr["y"], fr["x"] + fr["w"], fr["y"] + fr["h"]))
                        board.alpha_composite(crop, (f_idx * csize, y0))
                        draw.rectangle([f_idx * csize, y0, (f_idx + 1) * csize - 1, y0 + csize - 1], outline=(48, 40, 62, 255))
                draw.text((6, y0 + csize + 2), eid, fill=(225, 215, 200, 255))
            board.save(out_dir / f"contact_{group_name}.png", "PNG")


def verify_all_assets() -> tuple[bool, list[str]]:
    """Verify 100% of canonical entities, vfx, and 96x96 icons with PIL & JSON assertions."""
    errors: list[str] = []

    def check_atlas(png_path: Path, json_path: Path, expected_sizes: dict[str, tuple[int, int]]) -> None:
        if not png_path.exists() or not json_path.exists():
            errors.append(f"Missing atlas files: {png_path} / {json_path}")
            return
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"Invalid JSON in {json_path}: {exc}")
            return
        img = Image.open(png_path).convert("RGBA")
        frames = data.get("frames", {})
        for key, (ew, eh) in expected_sizes.items():
            if key not in frames:
                errors.append(f"Missing frame '{key}' in {json_path.name}")
                continue
            fr = frames[key]["frame"]
            if ew and (fr["w"] != ew or fr["h"] != eh):
                errors.append(f"Frame '{key}' size {fr['w']}x{fr['h']} != {ew}x{eh}")
            crop = img.crop((fr["x"], fr["y"], fr["x"] + fr["w"], fr["y"] + fr["h"]))
            arr = np.array(crop)
            alpha = arr[:, :, 3]
            if int(alpha.max()) < 64:
                errors.append(f"Frame '{key}' appears blank/empty")
            corners = [int(alpha[0, 0]), int(alpha[0, -1]), int(alpha[-1, 0]), int(alpha[-1, -1])]
            if max(corners) > 32:
                errors.append(f"Frame '{key}' has opaque corner matte ({corners})")

    expected_entities: dict[str, tuple[int, int]] = {}
    for hid in HERO_IDS:
        for f in range(4):
            expected_entities[f"{hid}_{f}"] = (128, 128)
    for eid in REGULAR_ENEMY_IDS:
        for f in range(4):
            expected_entities[f"{eid}_{f}"] = (128, 128)
    for bid in BOSS_ENEMY_IDS:
        for f in range(4):
            expected_entities[f"{bid}_{f}"] = (192, 192)

    check_atlas(ATLAS_DIR / "entities.png", ATLAS_DIR / "entities.json", expected_entities)

    expected_vfx: dict[str, tuple[int, int]] = {k: (0, 0) for k in ALL_VFX_FRAMES}
    check_atlas(ATLAS_DIR / "vfx.png", ATLAS_DIR / "vfx.json", expected_vfx)

    for icon_id in ALL_ICON_IDS:
        p = ICON_DIR / f"{icon_id}.png"
        if not p.exists():
            errors.append(f"Missing icon: {p.name}")
            continue
        im = Image.open(p).convert("RGBA")
        if im.size != (96, 96):
            errors.append(f"Icon {p.name} size {im.size} != (96, 96)")
            continue
        arr = np.array(im)
        alpha = arr[:, :, 3]
        if int(alpha.max()) < 64:
            errors.append(f"Icon {p.name} is empty")
        corners = [int(alpha[0, 0]), int(alpha[0, -1]), int(alpha[-1, 0]), int(alpha[-1, -1])]
        if max(corners) > 32:
            errors.append(f"Icon {p.name} has opaque corner matte ({corners})")

    return len(errors) == 0, errors


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Entities, VFX, and Icons art pipeline")
    parser.add_argument("--process", action="store_true", help="Process raw sheets into atlases and icons")
    parser.add_argument("--verify", action="store_true", help="Verify all output atlases & icons")
    parser.add_argument("--contact", action="store_true", help="Build visual contact sheets in tools/debug_contact/")
    args = parser.parse_args(list(argv) if argv is not None else None)
    if args.process:
        process_all_sheets()
    if args.contact:
        build_contact_sheets(ROOT / "tools" / "debug_contact")
    if args.verify:
        ok, errs = verify_all_assets()
        if ok:
            print(
                f"VERIFIED: {len(HERO_IDS)*4 + len(REGULAR_ENEMY_IDS)*4 + len(BOSS_ENEMY_IDS)*4} "
                f"entity frames, {len(ALL_VFX_FRAMES)} vfx frames, {len(ALL_ICON_IDS)} 96x96 icons."
            )
            return 0
        print(f"FAILED ({len(errs)} issues):")
        for e in errs[:40]:
            print(" -", e)
        return 1
    if not (args.process or args.contact or args.verify):
        parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
