export const HERO_IDS = [
  'antonio',
  'imelda',
  'pasqualina',
  'gennaro',
  'arca',
  'porta',
  'lama',
  'poe',
  'clerici',
  'dommario',
  'krochi',
  'christine',
  'pugnala',
  'mortaccio',
  'cavallo',
  'red_death',
] as const;

export type HeroId = (typeof HERO_IDS)[number];

export const BASE_WEAPON_IDS = [
  'whip',
  'magic_wand',
  'knife',
  'axe',
  'cross',
  'king_bible',
  'fire_wand',
  'garlic',
  'santa_water',
  'runetracer',
  'lightning_ring',
  'pentagram',
  'peachone',
  'ebony_wings',
  'phiera',
  'eight_sparrow',
  'bone',
  'cherry_bomb',
  'clock_lancet',
  'laurel',
] as const;

export type BaseWeaponId = (typeof BASE_WEAPON_IDS)[number];

export const EVOLVED_WEAPON_IDS = [
  'bloody_tear',
  'holy_wand',
  'thousand_edge',
  'death_spiral',
  'heaven_sword',
  'unholy_vespers',
  'hellfire',
  'soul_eater',
  'la_borra',
  'no_future',
  'thunder_loop',
  'gorgeous_moon',
  'vandalier',
  'phieraggi',
] as const;

export type EvolvedWeaponId = (typeof EVOLVED_WEAPON_IDS)[number];

export const WEAPON_IDS = [
  ...BASE_WEAPON_IDS,
  ...EVOLVED_WEAPON_IDS,
] as const;

export type WeaponId = BaseWeaponId | EvolvedWeaponId;

export const PASSIVE_IDS = [
  'spinach',
  'armor',
  'hollow_heart',
  'pummarola',
  'empty_tome',
  'candelabrador',
  'bracer',
  'spellbinder',
  'duplicator',
  'wings',
  'attract_orb',
  'crown',
  'clover',
  'stone_mask',
  'tiragisu',
  'skull_omaniac',
] as const;

export type PassiveId = (typeof PASSIVE_IDS)[number];

export const ARCANA_IDS = [
  'arcana_iv_awake',
  'arcana_vi_sarabande',
  'arcana_vii_iron_blue',
  'arcana_viii_mad_groove',
  'arcana_ix_divine_bloodline',
  'arcana_xi_waltz_pearls',
  'arcana_xii_out_of_bounds',
  'arcana_xvi_slash',
  'arcana_xvii_lost_painting',
  'arcana_xviii_boogaloo',
  'arcana_xix_heart_of_fire',
  'arcana_xx_silent_sanctuary',
] as const;

export type ArcanaId = (typeof ARCANA_IDS)[number];

export const POWERUP_IDS = [
  'might',
  'armor',
  'max_health',
  'recovery',
  'cooldown',
  'area',
  'speed',
  'duration',
  'amount',
  'move_speed',
  'magnet',
  'luck',
  'growth',
  'greed',
  'curse',
  'revival',
  'reroll',
  'skip',
  'banish',
] as const;

export type PowerUpId = (typeof POWERUP_IDS)[number];

export const STAGE_IDS = [
  'mad_forest',
  'inlaid_library',
  'dairy_plant',
  'gallo_tower',
  'cappella_magna',
] as const;

export type StageId = (typeof STAGE_IDS)[number];

export const REGULAR_ENEMY_IDS = [
  'bat_brown',
  'bat_swarm',
  'zombie',
  'skeleton',
  'skeleton_armored',
  'ghost',
  'werewolf',
  'mudman',
  'mummy',
  'dust_elemental',
  'nesuferit_mage',
  'lizardman',
  'iron_golem',
  'harpy',
  'dragon_shrimp',
  'imp_demon',
  'archdemon',
  'blood_knight',
] as const;

export type RegularEnemyId = (typeof REGULAR_ENEMY_IDS)[number];

export const BOSS_ENEMY_IDS = [
  'boss_giant_bat',
  'boss_werewolf_alpha',
  'boss_blue_venus',
  'boss_hag',
  'boss_nesuferit',
  'boss_sword_guardian',
  'boss_giant_crab',
  'boss_trinacria',
  'reaper_stalker',
  'reaper_red_death',
] as const;

export type BossEnemyId = (typeof BOSS_ENEMY_IDS)[number];

export const ENEMY_IDS = [
  ...REGULAR_ENEMY_IDS,
  ...BOSS_ENEMY_IDS,
] as const;

export type EnemyId = RegularEnemyId | BossEnemyId;

export const RELIC_IDS = [
  'relic_grimoire',
  'relic_map',
  'relic_ars_gouda',
  'relic_randomazzo',
  'relic_yellow_sign',
] as const;

export type RelicId = (typeof RELIC_IDS)[number];

export const PICKUP_IDS = [
  'xp_blue',
  'xp_green',
  'xp_red',
  'xp_gold',
  'coin',
  'gold_bag',
  'rich_gold_bag',
  'roast_chicken',
  'vacuum_orb',
  'rosary',
  'orologion',
  'chest_bronze',
  'chest_silver',
  'chest_gold',
  'chest_arcana',
] as const;

export type PickupId = (typeof PICKUP_IDS)[number];

export const PROP_IDS = [
  'brazier',
  'candelabra',
  'streetlamp',
  'dead_tree',
  'gravestone',
  'bookshelf',
  'minecart',
  'stone_pillar',
  'stained_pedestal',
] as const;

export type PropId = (typeof PROP_IDS)[number];

export type ChestTier = 'bronze' | 'silver' | 'gold' | 'arcana';

export type CatalogIconId =
  | HeroId
  | WeaponId
  | PassiveId
  | ArcanaId
  | PowerUpId
  | RelicId
  | StageId
  | EnemyId
  | PickupId;
