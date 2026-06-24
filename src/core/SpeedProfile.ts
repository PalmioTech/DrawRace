/**
 * Turns a raw timestamped finger stroke into a drivable Trajectory.
 *
 * This is the heart of the draw-to-race mechanic: the SPEED of the finger while
 * drawing becomes the car's target speed along the path. Draw fast on straights,
 * ease off into corners.
 */
import type { TimedPoint, Trajectory, Vec2, CarStats } from './types';
import { smoothAndResample } from './PathSmoother';
import { computeCurvatures, cumulativeLengths, smoothScalars } from './Geometry';
import { DRAW, SMOOTH } from '../config/constants';

/** Clamp helper. */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Build a Trajectory from a raw timed stroke.
 *
 * @param raw     timestamped finger samples
 * @param spacing node spacing (px) for the resampled path
 * @param stats   the drawing player's car stats (clamps to their min/max speed)
 */
export function buildHumanTrajectory(raw: TimedPoint[], spacing: number, stats: CarStats): Trajectory {
  const positions: Vec2[] = raw.map((p) => ({ x: p.x, y: p.y }));
  const points = smoothAndResample(positions, spacing);

  // --- 1. Finger speed sampled along the RAW (timed) stroke ---------------
  // For each raw sample compute instantaneous finger speed (px/s) and its
  // cumulative arc length, so we can map speed onto the resampled path.
  const rawCum = cumulativeLengths(positions);
  const rawSpeed: number[] = new Array(raw.length).fill(0);
  for (let i = 1; i < raw.length; i++) {
    const d = rawCum[i] - rawCum[i - 1];
    const dtMs = Math.max(1, raw[i].t - raw[i - 1].t);
    rawSpeed[i] = (d / dtMs) * 1000; // px/s
  }
  if (raw.length > 1) rawSpeed[0] = rawSpeed[1];

  // Smooth the finger speed with a moving average (touch input is jittery).
  const smoothed = movingAverage(rawSpeed, DRAW.smoothWindow);

  // --- 2. Map finger speed onto each resampled node by arc length ---------
  const totalRaw = rawCum[rawCum.length - 1] || 1;
  const speeds: number[] = new Array(points.length).fill(stats.minSpeed);
  for (let i = 0; i < points.length; i++) {
    // Resampled nodes are evenly spaced; map node i to a fraction of the raw
    // stroke length, then sample the (smoothed) finger speed there.
    const frac = points.length > 1 ? i / (points.length - 1) : 0;
    const targetS = frac * totalRaw;
    const fingerSpeed = sampleAtArcLength(rawCum, smoothed, targetS);
    speeds[i] = clamp(fingerSpeed * DRAW.speedGain, stats.minSpeed, stats.maxSpeed);
  }

  const curvatures = smoothScalars(computeCurvatures(points, spacing), SMOOTH.curvatureWindow);
  return {
    points,
    speeds: smoothScalars(speeds, 2),
    curvatures,
    spacing,
    length: (points.length - 1) * spacing,
  };
}

/** Moving average over a window of `w` samples. */
function movingAverage(values: number[], w: number): number[] {
  if (w <= 1) return values.slice();
  const out = new Array(values.length).fill(0);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -w; k <= w; k++) {
      const j = i + k;
      if (j >= 0 && j < values.length) {
        sum += values[j];
        count++;
      }
    }
    out[i] = sum / count;
  }
  return out;
}

/** Sample `values` (aligned to cumulative arc lengths `cum`) at arc length s. */
function sampleAtArcLength(cum: number[], values: number[], s: number): number {
  if (values.length === 0) return 0;
  if (s <= 0) return values[0];
  if (s >= cum[cum.length - 1]) return values[values.length - 1];
  for (let i = 1; i < cum.length; i++) {
    if (cum[i] >= s) {
      const segLen = cum[i] - cum[i - 1];
      const t = segLen > 1e-6 ? (s - cum[i - 1]) / segLen : 0;
      return values[i - 1] + (values[i] - values[i - 1]) * t;
    }
  }
  return values[values.length - 1];
}
