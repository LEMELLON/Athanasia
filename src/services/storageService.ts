import { ItemEntity, HexTile, PlayerCharacter, GameSettings, ChunkNode, BiomeType, TileType } from '../types/game';
import { DEFAULT_WEAPONS, DEFAULT_ARMOR_AND_SHIELDS, DEFAULT_CONSUMABLES, DEFAULT_PREMADE_HEROES } from '../data/defaultGameData';

export interface SavedGameState {
  version: number;
  lastUpdated: string;
  items: ItemEntity[];
  mapTiles: Record<string, HexTile>;
  chunkNodes?: Record<string, ChunkNode>;
  chunkK?: number;
  players: PlayerCharacter[];
  settings: GameSettings;
  activeTurnIndex: number;
  currentRound: number;
  combatLog: string[];
}

const STORAGE_KEY = 'arcana_resonatia_gm_save_v1';
const COOKIE_META_KEY = 'ar_session_meta';

// Helper to set a persistent cookie
function setCookie(name: string, value: string, days: number = 30) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export function createDefaultChunkNodes(): Record<string, ChunkNode> {
  const initial: Record<string, ChunkNode> = {};
  const biomesList: BiomeType[] = ['Pyria', 'Hydoria', 'Aeria', 'Geia', 'Phosia', 'Skotosia'];

  initial['0,0'] = { key: '0,0', q: 0, r: 0, biome: 'Boss Sanctum', isBoss: true };

  let spawnCount = 1;
  for (let ring = 1; ring <= 2; ring++) {
    let q = -ring;
    let s = ring;
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < ring; step++) {
        const k = `${q},${s}`;
        const isCorner = step === 0 && ring === 2;
        const assignedBiome = biomesList[(side + ring) % biomesList.length];

        initial[k] = {
          key: k,
          q,
          r: s,
          biome: assignedBiome,
          isBoss: false,
          spawnIndex: isCorner ? spawnCount++ : undefined
        };

        q += dirs[side][0];
        s += dirs[side][1];
      }
    }
  }
  return initial;
}

export function generateInitialMapTiles(chunks: Record<string, ChunkNode>, kr: number = 1): Record<string, HexTile> {
  const newTiles: Record<string, HexTile> = {};
  const A0 = kr + 1;
  const A1 = kr;
  const B0 = -kr;
  const B1 = 2 * kr + 1;

  const offsets: [number, number][] = [];
  for (let a = -kr; a <= kr; a++) {
    for (let b = Math.max(-kr, -a - kr); b <= Math.min(kr, -a + kr); b++) {
      offsets.push([a, b]);
    }
  }

  const biomesList: BiomeType[] = ['Pyria', 'Hydoria', 'Aeria', 'Geia', 'Phosia', 'Skotosia'];

  Object.values(chunks).forEach((ch, chIdx) => {
    const cq = ch.q * A0 + ch.r * B0;
    const cr = ch.q * A1 + ch.r * B1;

    let finalBiome: BiomeType = ch.biome === 'Random' ? biomesList[chIdx % biomesList.length] : ch.biome;
    if (ch.isBoss) finalBiome = 'Boss Sanctum';

    offsets.forEach((offset, idx) => {
      const tq = cq + offset[0];
      const tr = cr + offset[1];
      const key = `${tq},${tr}`;
      const ringDist = Math.max(Math.abs(tq), Math.abs(tr), Math.abs(tq + tr));
      const depth = Math.min(5, Math.max(0, Math.floor(6 * (ringDist / 12))));

      if (ch.isBoss) {
        newTiles[key] = {
          q: tq,
          r: tr,
          ring: ringDist,
          depth: 0,
          biome: 'Boss Sanctum',
          type: idx === 0 ? 'B' : 'P'
        };
        return;
      }

      if (ch.spawnIndex && idx === 0) {
        newTiles[key] = {
          q: tq,
          r: tr,
          ring: ringDist,
          depth,
          biome: finalBiome,
          type: 'Spawn',
          spawnPlayerIndex: ch.spawnIndex,
          isShop: true
        };
        return;
      }

      const isCenter = idx === 0;
      let type: TileType = 'P';
      let chestTierVal: number | undefined;

      if (isCenter && chIdx % 4 === 1) {
        type = 'C';
        chestTierVal = 1;
      } else if (idx === 1 && chIdx % 3 === 0) {
        type = 'O';
      }

      newTiles[key] = {
        q: tq,
        r: tr,
        ring: ringDist,
        depth,
        biome: finalBiome,
        type,
        chestTier: chestTierVal
      };
    });
  });

  return newTiles;
}

export function loadSavedState(): SavedGameState {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as SavedGameState;
      if (parsed.version && parsed.items && parsed.players) {
        if (!parsed.chunkNodes || Object.keys(parsed.chunkNodes).length === 0) {
          parsed.chunkNodes = createDefaultChunkNodes();
        }
        if (parsed.chunkK === undefined) {
          parsed.chunkK = 1;
        }
        if (!parsed.mapTiles || Object.keys(parsed.mapTiles).length === 0) {
          parsed.mapTiles = generateInitialMapTiles(parsed.chunkNodes, parsed.chunkK);
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to load state from localStorage:', err);
  }

  // Fallback default state
  const initialItems: ItemEntity[] = [
    ...DEFAULT_WEAPONS,
    ...DEFAULT_ARMOR_AND_SHIELDS,
    ...DEFAULT_CONSUMABLES
  ];

  const defaultChunks = createDefaultChunkNodes();
  const defaultTiles = generateInitialMapTiles(defaultChunks, 1);

  const defaultState: SavedGameState = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    items: initialItems,
    mapTiles: defaultTiles,
    chunkNodes: defaultChunks,
    chunkK: 1,
    players: JSON.parse(JSON.stringify(DEFAULT_PREMADE_HEROES)),
    settings: {
      playersCount: 4,
      seed: 7,
      chunkRadius: 1,
      maxChunks: 37,
      keysRequired: 2,
      startingLives: 3,
      spawnPenaltyRadius: 3,
      srMultiplier: 1.0,
      hitThreshold: 7,
      damageDie: 20
    },
    activeTurnIndex: 0,
    currentRound: 1,
    combatLog: ['The ancient Olympian trial begins. 4 champions race across the realms to defeat Aion.']
  };

  saveState(defaultState);
  return defaultState;
}

export function saveState(state: SavedGameState): void {
  try {
    if (typeof window !== 'undefined') {
      state.lastUpdated = new Date().toISOString();
      const serialized = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, serialized);
      // Also update cookie metadata so reloading and multi-tab sessions retain continuity
      setCookie(COOKIE_META_KEY, JSON.stringify({
        lastUpdated: state.lastUpdated,
        itemCount: state.items.length,
        round: state.currentRound,
        players: state.players.map(p => ({ id: p.id, name: p.name, hp: p.currentHp, lives: p.lives }))
      }));
    }
  } catch (err) {
    console.error('Failed to save state to localStorage:', err);
  }
}

export function exportStateToJson(state: SavedGameState): string {
  return JSON.stringify(state, null, 2);
}

export function importStateFromJson(jsonString: string): SavedGameState {
  const parsed = JSON.parse(jsonString) as SavedGameState;
  if (!parsed.items || !parsed.players || !parsed.settings) {
    throw new Error('Invalid Arcana Resonatia state file format.');
  }
  saveState(parsed);
  return parsed;
}

export function resetToDefaults(): SavedGameState {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
  return loadSavedState();
}
