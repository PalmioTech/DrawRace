/**
 * Track geometry: builds a dense centerline polyline from a TrackDef, exposes
 * border polylines for rendering, the start/finish line, and projection helpers
 * used for off-track tests, lap counting and race-progress ranking.
 *
 * Pure logic — no Phaser dependency.
 */
import type { TrackDef } from '../data/tracks';
import type { Vec2 } from './types';
import type { Projection } from './Geometry';
import {
  sampleClosedSpline,
  cumulativeLengths,
  projectToPolyline,
  normalize,
  perp,
  sub,
  add,
  scale,
  dist,
} from './Geometry';
import { PLAY_AREA } from '../config/constants';

export class Track {
  readonly def: TrackDef;
  /** Dense closed centerline polyline (last point ≈ first). */
  readonly center: Vec2[];
  /** Cumulative arc length along `center`. */
  readonly cum: number[];
  /** Total centerline length (one lap). */
  readonly length: number;
  readonly halfWidth: number;

  /** Start/finish line endpoints (spanning the track width). */
  readonly startA: Vec2;
  readonly startB: Vec2;
  /** Forward direction at the start line. */
  readonly startDir: Vec2;
  /** Center of the start line. */
  readonly startPos: Vec2;

  constructor(def: TrackDef, area: { x: number; y: number; w: number; h: number } = PLAY_AREA) {
    this.def = def;
    this.halfWidth = def.halfWidth;

    // Fit the control points into the play area (scaled to fill it, inset by the
    // track width). Draw input and race rendering then share the same big map.
    const fitted = Track.fitControls(def.controls, area, def.halfWidth + 34);

    // Build the centerline and close the loop explicitly for clean projection.
    const dense = sampleClosedSpline(fitted, 18);
    dense.push(dense[0]);
    this.center = dense;
    this.cum = cumulativeLengths(dense);
    this.length = this.cum[this.cum.length - 1];

    // Start line: perpendicular to the centerline at point 0.
    this.startPos = this.center[0];
    this.startDir = normalize(sub(this.center[1], this.center[0]));
    const side = scale(perp(this.startDir), this.halfWidth);
    this.startA = add(this.startPos, side);
    this.startB = sub(this.startPos, side);
  }

  /** Scale + translate control points to fill `area` (inset on all sides). */
  private static fitControls(
    controls: Vec2[],
    area: { x: number; y: number; w: number; h: number },
    inset: number,
  ): Vec2[] {
    const xs = controls.map((p) => p.x);
    const ys = controls.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const sx = (area.w - 2 * inset) / (maxX - minX);
    const sy = (area.h - 2 * inset) / (maxY - minY);
    return controls.map((p) => ({
      x: area.x + inset + (p.x - minX) * sx,
      y: area.y + inset + (p.y - minY) * sy,
    }));
  }

  /** Project a point onto the centerline (distance + arc-length position). */
  project(p: Vec2): Projection {
    return projectToPolyline(p, this.center, this.cum);
  }

  /** Is the point on the drivable surface? */
  isOnTrack(p: Vec2): boolean {
    return this.project(p).dist <= this.halfWidth;
  }

  /** Point on the centerline at arc length `s` (wraps around the loop). */
  pointAt(s: number): Vec2 {
    const L = this.length;
    let sm = ((s % L) + L) % L;
    // Binary-ish linear scan (cheap; called rarely).
    for (let i = 0; i < this.center.length - 1; i++) {
      if (this.cum[i + 1] >= sm) {
        const segLen = this.cum[i + 1] - this.cum[i];
        const t = segLen > 1e-6 ? (sm - this.cum[i]) / segLen : 0;
        const a = this.center[i];
        const b = this.center[i + 1];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    return this.center[0];
  }

  /** Forward tangent at arc length `s`. */
  tangentAt(s: number): Vec2 {
    const a = this.pointAt(s);
    const b = this.pointAt(s + 4);
    return normalize(sub(b, a));
  }

  /** Left + right border polylines for rendering. */
  borders(): { left: Vec2[]; right: Vec2[] } {
    const left: Vec2[] = [];
    const right: Vec2[] = [];
    const n = this.center.length;
    for (let i = 0; i < n; i++) {
      const a = this.center[i];
      const b = this.center[(i + 1) % n];
      const dir = normalize(sub(b, a));
      const off = scale(perp(dir), this.halfWidth);
      left.push(add(a, off));
      right.push(sub(a, off));
    }
    return { left, right };
  }

  /** Convenience: starting grid positions, staggered behind the start line. */
  gridPositions(count: number): Vec2[] {
    const back = scale(this.startDir, -28);
    const lat = perp(this.startDir);
    const out: Vec2[] = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2 === 0 ? -1 : 1;
      const base = add(this.startPos, scale(back, row + 0.4));
      out.push(add(base, scale(lat, col * this.halfWidth * 0.45)));
    }
    return out;
  }

  /** Helper used by tests/AI: total length for N laps. */
  lapsLength(laps: number): number {
    return this.length * laps;
  }

  /** Distance between two arc-length positions, shortest way around. */
  arcDelta(a: number, b: number): number {
    return Math.abs(a - b);
  }

  /** Expose distance util for callers that already have a Vec2. */
  static distance(a: Vec2, b: Vec2): number {
    return dist(a, b);
  }
}
