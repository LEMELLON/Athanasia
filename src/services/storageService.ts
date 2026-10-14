import { ItemEntity, HexTile, PlayerCharacter, GameSettings } from '../types/game';
import { DEFAULT_WEAPONS, DEFAULT_ARMOR_AND_SHIELDS, DEFAULT_CONSUMABLES, DEFAULT_PREMADE_HEROES } from '../data/defaultGameData';

export interface SavedGameState {
  version: number;
  lastUpdated: string;
  items: ItemEntity[];
  mapTiles: Record<string, HexTile>;
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

export function loadSavedState(): SavedGameState {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as SavedGameState;
      if (parsed.version && parsed.items && parsed.players) {
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

  const defaultState: SavedGameState = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    items: initialItems,
    mapTiles: {},
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
