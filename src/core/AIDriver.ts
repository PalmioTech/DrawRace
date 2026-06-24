/**
 * Generates an AI trajectory: it follows the track's ideal line (centerline with
 * a mild racing-line apex bias) for all laps, choosing target speeds from the
 * same cornering-grip physics the player is bound by — then injects occasional
 * mistakes. The resulting Trajectory is run by the exact same CarSim as a human's.
 */
import type { Trajectory, Vec2, Difficulty, CarStats } from './types';
import type { Track } from './Track';
import { computeCurvatures, smoothScalars } from './Geometry';
import { LAPS, PATH_SPACING, SMOOTH } from '../config/constants';

interface DiffParams {
  /** Fraction of the grip-limited corner speed the AI dares (≤1 safe). */
  aggression: number;
  /** Probability per node of an error (overcooking a corner). */
  errorRate: number;
  /** How badly an error overshoots the safe speed. */
  errorMag: number;
}

const PARAMS: Record<Difficulty, DiffParams> = {
  easy: { aggression: 0.66, errorRate: 0.1, errorMag: 1.3 },
  normal: { aggression: 0.8, errorRate: 0.05, errorMag: 1.4 },
  hard: { aggression: 0.9, errorRate: 0.022, errorMag: 1.5 },
};

/** Tiny deterministic PRNG (mulberry32) so each AI car is varied but reproducible. */
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

/**
 * Build an AI trajectory covering `LAPS` laps.
 *
 * @param track       the circuit
 * @param difficulty  AI skill level
 * @param seed        per-car seed (varies line + mistakes)
 */
export function buildAITrajectory(
  track: Track,
  difficulty: Difficulty,
  seed: number,
  stats: CarStats,
): Trajectory {
  const p = PARAMS[difficulty];
  const rand = rng(seed);
  const spacing = PATH_SPACING;

  // Lateral apex bias offset (px), constant per car, so lines differ slightly.
  const apexBias = (rand() * 2 - 1) * track.halfWidth * 0.45;

  // Walk the centerline LAPS times, sampling evenly by arc length.
  const points: Vec2[] = [];
  const lapLen = track.length;
  const total = lapLen * LAPS;
  for (let s = 0; s < total; s += spacing) {
    const base = track.pointAt(s);
    const tan = track.tangentAt(s);
    // Offset perpendicular to the tangent for a simple racing line.
    const nx = -tan.y;
    const ny = tan.x;
    points.push({ x: base.x + nx * apexBias, y: base.y + ny * apexBias });
  }

  const curvatures = smoothScalars(computeCurvatures(points, spacing), SMOOTH.curvatureWindow);

  // Choose target speeds from the corner-grip limit, scaled by aggression, with
  // occasional deliberate overshoots (mistakes).
  const speeds: number[] = points.map((_, i) => {
    const curv = Math.max(Math.abs(curvatures[i]), 1e-5);
    const cornerMax = Math.sqrt(stats.maxLatAccel / curv);
    let target = Math.min(stats.maxSpeed, cornerMax) * p.aggression;
    if (rand() < p.errorRate) {
      target = Math.min(stats.maxSpeed, cornerMax * p.errorMag); // overcook → will slide
    }
    return Math.max(stats.minSpeed, target);
  });

  return {
    points,
    speeds,
    curvatures,
    spacing,
    length: (points.length - 1) * spacing,
  };
}
