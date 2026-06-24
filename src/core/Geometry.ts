/**
 * Pure geometry helpers: vectors, Catmull-Rom splines, arc-length resampling,
 * polyline projection and curvature. No Phaser dependency — unit-testable.
 */
import type { Vec2 } from './types';

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l > 1e-6 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

/** Left-hand perpendicular (rotate +90°). */
export function perp(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x };
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Catmull-Rom interpolation between p1 and p2 (p0,p3 are neighbours). */
export function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

/**
 * Sample a CLOSED Catmull-Rom loop through `controls`, producing a dense
 * polyline. Used to build the track centerline from a handful of control points.
 */
export function sampleClosedSpline(controls: Vec2[], samplesPerSeg = 16): Vec2[] {
  const n = controls.length;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = controls[(i - 1 + n) % n];
    const p1 = controls[i];
    const p2 = controls[(i + 1) % n];
    const p3 = controls[(i + 2) % n];
    for (let s = 0; s < samplesPerSeg; s++) {
      out.push(catmullRom(p0, p1, p2, p3, s / samplesPerSeg));
    }
  }
  return out;
}

/**
 * Sample an OPEN Catmull-Rom spline through `points` (endpoints duplicated),
 * producing a dense polyline. Used to smooth a raw finger stroke.
 */
export function sampleOpenSpline(points: Vec2[], samplesPerSeg = 12): Vec2[] {
  if (points.length < 2) return points.slice();
  const out: Vec2[] = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    for (let s = 0; s < samplesPerSeg; s++) {
      out.push(catmullRom(p0, p1, p2, p3, s / samplesPerSeg));
    }
  }
  out.push(points[n - 1]);
  return out;
}

/** Cumulative arc length along a polyline. Returns array of length points.length. */
export function cumulativeLengths(points: Vec2[]): number[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  }
  return cum;
}

/**
 * Resample a dense polyline into evenly spaced points `spacing` px apart.
 * Returns at least the first point.
 */
export function resampleByArcLength(dense: Vec2[], spacing: number): Vec2[] {
  if (dense.length === 0) return [];
  const out: Vec2[] = [dense[0]];
  let prev = dense[0];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    let segStart = prev;
    const segEnd = dense[i];
    let segLen = dist(segStart, segEnd);
    // Place as many evenly spaced nodes as fit inside this segment.
    while (acc + segLen >= spacing) {
      const remain = spacing - acc;
      const t = remain / segLen;
      const node = lerp(segStart, segEnd, t);
      out.push(node);
      segStart = node;
      segLen = dist(segStart, segEnd);
      acc = 0;
    }
    acc += segLen;
    prev = segEnd;
  }
  return out;
}

/**
 * SIGNED discrete curvature at each point of an evenly spaced polyline.
 * Sign encodes turn direction (+ left / − right); magnitude ≈ 1/radius.
 * Use Math.abs() when you only need the corner tightness.
 */
export function computeCurvatures(points: Vec2[], spacing: number): number[] {
  const n = points.length;
  const curv = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const a = sub(points[i], points[i - 1]);
    const b = sub(points[i + 1], points[i]);
    const la = len(a);
    const lb = len(b);
    if (la < 1e-4 || lb < 1e-4) continue;
    // Signed turn angle between consecutive segments.
    const cross = a.x * b.y - a.y * b.x;
    const dot = a.x * b.x + a.y * b.y;
    const angle = Math.atan2(cross, dot);
    // curvature ≈ angle / arc length over the two half-segments.
    curv[i] = angle / spacing;
  }
  if (n > 1) {
    curv[0] = curv[1];
    curv[n - 1] = curv[n - 2];
  }
  return curv;
}

/** Moving-average smoothing of a scalar array over a ±w window. */
export function smoothScalars(values: number[], w: number): number[] {
  if (w <= 0) return values.slice();
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

/**
 * Moving-average smoothing of a polyline's positions over a ±w window.
 * Endpoints are kept fixed so the line still starts/ends where drawn.
 */
export function smoothPoints(points: Vec2[], w: number): Vec2[] {
  if (w <= 0 || points.length < 3) return points.slice();
  const out: Vec2[] = points.map((p) => ({ ...p }));
  for (let i = 1; i < points.length - 1; i++) {
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (let k = -w; k <= w; k++) {
      const j = i + k;
      if (j >= 0 && j < points.length) {
        sx += points[j].x;
        sy += points[j].y;
        count++;
      }
    }
    out[i] = { x: sx / count, y: sy / count };
  }
  return out;
}

export interface Projection {
  /** Closest distance from the query point to the polyline. */
  dist: number;
  /** Arc-length position along the polyline of the closest point. */
  s: number;
  /** Index of the segment start. */
  index: number;
}

/**
 * Project a point onto a polyline. `cum` are precomputed cumulative lengths.
 * O(n) — fine for the few queries per car per tick in this game.
 */
export function projectToPolyline(p: Vec2, poly: Vec2[], cum: number[]): Projection {
  let best: Projection = { dist: Infinity, s: 0, index: 0 };
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const ab = sub(b, a);
    const segLen2 = ab.x * ab.x + ab.y * ab.y;
    let t = 0;
    if (segLen2 > 1e-6) {
      t = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / segLen2;
      t = Math.max(0, Math.min(1, t));
    }
    const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t };
    const d = dist(p, proj);
    if (d < best.dist) {
      best = { dist: d, s: cum[i] + Math.sqrt(segLen2) * t, index: i };
    }
  }
  return best;
}

/** Do segments p1-p2 and p3-p4 intersect? Used for start-line crossing detection. */
export function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
