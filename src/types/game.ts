export type ElementType = 'Aquis' | 'Pyris' | 'Aero' | 'Litho' | 'Fulgo' | 'Luxis' | 'Noctis';
export type BiomeType = 'Pyria' | 'Hydoria' | 'Aeria' | 'Geia' | 'Phosia' | 'Skotosia' | 'Boss Sanctum';
export type ItemCategory = 'weapon' | 'armor' | 'shield' | 'consumable';
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type CharacterClass = 'Cana' | 'Bhana' | 'Prana' | 'Gana';

export type StatKey = 'STR' | 'CON' | 'DEX' | 'INT' | 'WIS' | 'CHAR';

export interface ItemEntity {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: Rarity;
  biome: BiomeType | 'Universal';
  classReq: CharacterClass | 'All';
  description: string;
  appearance?: string;
  // Weapon stats
  baseAtk?: number;
  rangeMin?: number;
  rangeMax?: number;
  scalingStat?: StatKey;
  attacksPerAction?: number;
  // Armor/Shield stats
  baseAc?: number;
  dexPenalty?: number;
  conBonus?: number;
  // Consumable stats
  healHpPct?: number;
  restoreMpPct?: number;
  bonusStat?: StatKey;
  bonusStatValue?: number;
  durationRounds?: number;
  // Special elemental & status effects
  elementAffinity?: ElementType;
  effectTag?: 'burn' | 'stagger' | 'pull' | 'push' | 'splash' | 'shock' | 'root' | 'lifesteal' | 'shield' | 'pierce' | 'slow' | 'blind' | 'stealth';
  effectValue?: number;
  effectDescription?: string;
  isCustom?: boolean;
}

export type TileType = 'P' | 'W' | 'O' | 'C' | 'M' | 'B' | 'Portal' | 'Shop' | 'Shrine' | 'Spawn';

export interface MobEntity {
  id: string;
  name: string;
  cr: number;
  element: ElementType;
  hp: number;
  maxHp: number;
  isMiniBoss?: boolean;
  biome: BiomeType;
  rewardSr?: number;
}

export interface HexTile {
  q: number;
  r: number;
  ring: number;
  depth: number;
  biome: BiomeType;
  type: TileType;
  chestTier?: number;
  mob?: MobEntity;
  portalBehavior?: 'Stable' | 'Flickering' | 'Volatile';
  portalId?: number;
  spawnPlayerIndex?: number;
  isShop?: boolean;
  isShrine?: boolean;
}

export interface PlayerCharacter {
  id: number;
  name: string;
  archetype: CharacterClass;
  title: string;
  bio: string;
  color: string;
  affinity: ElementType;
  stats: Record<StatKey, number>;
  level: number;
  totalSr: number;
  walletSr: number;
  lives: number;
  maxHp: number;
  currentHp: number;
  maxMp: number;
  currentMp: number;
  counters: ElementType[];
  equippedWeapon?: ItemEntity;
  equippedArmor?: ItemEntity;
  equippedShield?: ItemEntity;
  pack: ItemEntity[];
  position: string; // "q,r"
  keys: number;
  statuses: { type: string; duration: number; value?: number }[];
  trail: string[];
}

export interface GameSettings {
  playersCount: number;
  seed: number;
  chunkRadius: number; // 0=1 tile, 1=7 tiles, etc.
  maxChunks: number;
  keysRequired: number;
  startingLives: number;
  spawnPenaltyRadius: number;
  srMultiplier: number;
  hitThreshold: number;
  damageDie: number;
}
