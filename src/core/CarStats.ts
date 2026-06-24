/**
 * Car setup logic: resolve a chosen Loadout (levels per stat) into concrete
 * CarStats, plus loadout helpers (default, validation, AI generation).
 *
 * Pure logic — no Phaser dependency.
 */
import type { StatKey, Loadout, CarStats, Difficulty } from './types';
import { CAR, SETUP, STAT_SCALING } from '../config/constants';

/** Stat order for UI + iteration. */
export const STAT_KEYS: StatKey[] = ['grip', 'speed', 'brake', 'accel', 'offroad'];

/** Human-readable labels (Italian, matching the game UI). */
export const STAT_LABELS: Record<StatKey, string> = {
  grip: 'GRIP',
  speed: 'VELOCITA',
  brake: 'FRENATA',
  accel: 'ACCELERAZIONE',
  offroad: 'TENUTA',
};

/** An all-zero loadout (= the base car). */
export function defaultLoadout(): Loadout {
  return { grip: 0, speed: 0, brake: 0, accel: 0, offroad: 0 };
}

/** Total points spent in a loadout. */
export function loadoutTotal(l: Loadout): number {
  return STAT_KEYS.reduce((sum, k) => sum + (l[k] || 0), 0);
}

/** Clamp a loadout to legal bounds (each ≤ maxLevel, total ≤ budget). */
export function sanitizeLoadout(l: Loadout): Loadout {
  const out = defaultLoadout();
  let spent = 0;
  for (const k of STAT_KEYS) {
    const lvl = Math.max(0, Math.min(SETUP.maxLevel, Math.floor(l[k] || 0)));
    const allowed = Math.min(lvl, SETUP.budget - spent);
    out[k] = allowed;
    spent += allowed;
  }
  return out;
}

/** Resolve a loadout into the concrete stats the simulation uses. */
export function resolveStats(loadout: Loadout): CarStats {
  const l = sanitizeLoadout(loadout);
  return {
    maxSpeed: CAR.maxSpeed * (1 + STAT_SCALING.speed * l.speed),
    minSpeed: CAR.minSpeed,
    accel: CAR.accel * (1 + STAT_SCALING.accel * l.accel),
    brake: CAR.brake * (1 + STAT_SCALING.brake * l.brake),
    maxLatAccel: CAR.maxLatAccel * (1 + STAT_SCALING.gripLat * l.grip),
    slideGain: CAR.slideGain * (1 - STAT_SCALING.gripSlide * l.grip),
    eliminateAfterOffRuns: CAR.eliminateAfterOffRuns + STAT_SCALING.offroad * l.offroad,
    // Unscaled passthroughs.
    slideEase: CAR.slideEase,
    maxSlide: CAR.maxSlide,
    renderSmooth: CAR.renderSmooth,
    offTrackGrip: CAR.offTrackGrip,
    minOnGapPx: CAR.minOnGapPx,
  };
}

/** The base car's stats (level-0 loadout). */
export function baseStats(): CarStats {
  return resolveStats(defaultLoadout());
}

/** Tiny deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-difficulty stat weights for AI point allocation. */
const AI_WEIGHTS: Record<Difficulty, Record<StatKey, number>> = {
  // Easy: dumps into top speed without grip/brake → overcooks corners.
  easy: { grip: 1, speed: 4, brake: 1, accel: 2, offroad: 1 },
  // Normal: even spread.
  normal: { grip: 1, speed: 1, brake: 1, accel: 1, offroad: 1 },
  // Hard: favors grip + brake (corner mastery), some speed.
  hard: { grip: 3, speed: 2, brake: 2, accel: 1, offroad: 1 },
};

/**
 * Generate a valid AI loadout: spend the full budget, one point at a time, by
 * weighted random choice among stats not yet maxed. Deterministic per seed.
 */
export function aiLoadout(difficulty: Difficulty, seed: number): Loadout {
  const rand = rng(seed);
  const weights = AI_WEIGHTS[difficulty];
  const out = defaultLoadout();
  for (let p = 0; p < SETUP.budget; p++) {
    const open = STAT_KEYS.filter((k) => out[k] < SETUP.maxLevel);
    if (open.length === 0) break;
    const totalW = open.reduce((s, k) => s + weights[k], 0);
    let r = rand() * totalW;
    let chosen = open[0];
    for (const k of open) {
      r -= weights[k];
      if (r <= 0) {
        chosen = k;
        break;
      }
    }
    out[chosen]++;
  }
  return out;
}
