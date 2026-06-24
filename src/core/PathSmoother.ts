/**
 * Smooths a raw finger stroke into an evenly spaced, fluid polyline using a
 * Catmull-Rom spline followed by arc-length resampling.
 */
import type { Vec2 } from './types';
import { sampleOpenSpline, resampleByArcLength, smoothPoints } from './Geometry';
import { SMOOTH } from '../config/constants';

/**
 * @param raw     raw stroke positions
 * @param spacing target distance between output nodes (px)
 * @returns evenly spaced, smoothed points (empty if input too short)
 */
export function smoothAndResample(raw: Vec2[], spacing: number): Vec2[] {
  if (raw.length < 2) return raw.slice();
  // Light pre-decimation so the spline isn't fed thousands of near-duplicate
  // touch samples (keeps curvature sane).
  const decimated: Vec2[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const last = decimated[decimated.length - 1];
    if (Math.hypot(raw[i].x - last.x, raw[i].y - last.y) >= spacing * 0.6) {
      decimated.push(raw[i]);
    }
  }
  if (decimated[decimated.length - 1] !== raw[raw.length - 1]) {
    decimated.push(raw[raw.length - 1]);
  }
  const dense = sampleOpenSpline(decimated, 12);
  const even = resampleByArcLength(dense, spacing);
  // Extra moving-average pass: the spline alone still leaves finger jitter that
  // produces noisy curvature (and a bouncing car). This flattens it.
  return smoothPoints(even, SMOOTH.pathWindow);
}
