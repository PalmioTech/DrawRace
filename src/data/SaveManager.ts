/**
 * Local persistence via localStorage. Versioned JSON so the schema can evolve.
 * MVP stores best times per track + settings; `unlocks` is reserved for later.
 */
import type { Difficulty, Loadout } from '../core/types';
import { defaultLoadout, sanitizeLoadout } from '../core/CarStats';

const KEY = 'project-racing:save';
const SCHEMA_VERSION = 2;

export interface SaveData {
  schemaVersion: number;
  bestTimes: Record<string, number>; // trackId -> best total race time (s)
  settings: {
    audio: boolean;
    difficulty: Difficulty;
  };
  lastLoadout: Loadout; // player's last chosen car setup
  unlocks: string[]; // reserved for future progression
}

const DEFAULT: SaveData = {
  schemaVersion: SCHEMA_VERSION,
  bestTimes: {},
  settings: { audio: true, difficulty: 'normal' },
  lastLoadout: defaultLoadout(),
  unlocks: [],
};

export class SaveManager {
  private data: SaveData;

  constructor() {
    this.data = SaveManager.load();
  }

  private static load(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT);
      const parsed = JSON.parse(raw) as SaveData;
      if (parsed.schemaVersion !== SCHEMA_VERSION) {
        // Simple forward migration: keep what we can, reset the rest.
        return { ...structuredClone(DEFAULT), bestTimes: parsed.bestTimes ?? {} };
      }
      return parsed;
    } catch {
      return structuredClone(DEFAULT);
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage may be unavailable (private mode) — ignore */
    }
  }

  getBestTime(trackId: string): number | undefined {
    return this.data.bestTimes[trackId];
  }

  /** Records a time if it beats the stored best. Returns true if it's a new record. */
  recordTime(trackId: string, time: number): boolean {
    const prev = this.data.bestTimes[trackId];
    if (prev === undefined || time < prev) {
      this.data.bestTimes[trackId] = time;
      this.persist();
      return true;
    }
    return false;
  }

  get settings(): SaveData['settings'] {
    return this.data.settings;
  }

  setDifficulty(d: Difficulty): void {
    this.data.settings.difficulty = d;
    this.persist();
  }

  setAudio(on: boolean): void {
    this.data.settings.audio = on;
    this.persist();
  }

  /** Wipe stored best times (settings and loadout survive). */
  clearBestTimes(): void {
    this.data.bestTimes = {};
    this.persist();
  }

  /** Player's last car setup (sanitized to legal bounds). */
  getLoadout(): Loadout {
    return sanitizeLoadout(this.data.lastLoadout ?? defaultLoadout());
  }

  setLoadout(loadout: Loadout): void {
    this.data.lastLoadout = sanitizeLoadout(loadout);
    this.persist();
  }
}

/** Shared singleton. */
export const save = new SaveManager();
