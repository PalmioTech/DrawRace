import type { CircuitDef } from '../data/circuits';
import { PLAY_AREA } from '../config/constants';
import { KIT } from '../config/kit';
import { Track } from './Track';
import type { Vec2 } from './types';

export interface DecoDef { key: string; cell: [number, number]; rot?: number } // rot radians, default 0; cell may be fractional (deco sits off-grid)

export interface PiecePlacement { key: string; x: number; y: number; rot: number }
export interface CircuitLayout {
  track: Track;
  cellPx: number;
  pieces: PiecePlacement[]; // road tiles incl. roadStart + roadStartPositions
  deco: PiecePlacement[];
}

const adj = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

/** Structural checks for a circuit. Returns [] when valid. */
export function validateCircuit(def: CircuitDef): string[] {
  const out: string[] = [];
  const c = def.cells;
  if (c.length < 8) out.push('fewer than 8 cells');
  const seen = new Set(c.map((p) => p.join(',')));
  if (seen.size !== c.length) out.push('duplicate cells');
  for (let i = 0; i < c.length; i++) {
    if (!adj(c[i], c[(i + 1) % c.length])) out.push(`cells ${i} and ${(i + 1) % c.length} not 4-adjacent`);
  }
  const i = def.startIndex;
  if (i < 0 || i >= c.length) out.push('startIndex out of range');
  else {
    const prev = c[(i - 1 + c.length) % c.length];
    const next = c[(i + 1) % c.length];
    const straight = prev[0] === next[0] || prev[1] === next[1];
    if (!straight) out.push('startIndex is not on a straight');
  }
  return out;
}

const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E,S,W,N
const dirIdx = (from: [number, number], to: [number, number]) =>
  DIRS.findIndex((d) => d[0] === to[0] - from[0] && d[1] === to[1] - from[1]);
// Straight art runs vertically → N/S travel = rot 0, E/W = PI/2.
const straightRot = (d: number) => (d % 2 === 0 ? Math.PI / 2 : 0);
// Corner art connects the SOUTH edge to the EAST edge (canonical, measured in
// Task 1 — see the comment in config/kit.ts). A corner cell's two open edges
// are (opposite of entry dir) and (exit dir). Quarter-turn lookup keyed by the
// unordered open-edge pair:
const CORNER_ROT: Record<string, number> = {
  'E,S': 0, 'S,W': Math.PI / 2, 'N,W': Math.PI, 'E,N': -Math.PI / 2,
};
const EDGE = ['E', 'S', 'W', 'N'];
const edgePair = (a: number, b: number) => [EDGE[a], EDGE[b]].sort().join(',');

/** Build road-tile placements + centerline for a circuit, fit to PLAY_AREA. */
export function buildCircuit(def: CircuitDef): CircuitLayout {
  const problems = validateCircuit(def);
  if (problems.length) throw new Error(`circuit ${def.id}: ${problems.join('; ')}`);

  // Uniform fit: cell size from grid bounds, centered in PLAY_AREA.
  const cols = Math.max(...def.cells.map((c) => c[0])) + 1;
  const rows = Math.max(...def.cells.map((c) => c[1])) + 1;
  const margin = 24;
  const cellPx = Math.min((PLAY_AREA.w - margin * 2) / cols, (PLAY_AREA.h - margin * 2) / rows);
  const originX = PLAY_AREA.x + (PLAY_AREA.w - cols * cellPx) / 2;
  const originY = PLAY_AREA.y + (PLAY_AREA.h - rows * cellPx) / 2;
  const cellCenter = (c: [number, number]): Vec2 => ({
    x: originX + (c[0] + 0.5) * cellPx,
    y: originY + (c[1] + 0.5) * cellPx,
  });

  // Rotate the loop so it BEGINS at the start cell (Track wants start at 0).
  const n = def.cells.length;
  const cells = def.cells.map((_, i) => def.cells[(def.startIndex + i) % n]);
  const preStartIdx = n - 1; // cell immediately before the start cell, post-rotation

  const pieces: PiecePlacement[] = [];
  const center: Vec2[] = [];
  const STEP = 8; // px between straight samples
  for (let i = 0; i < n; i++) {
    const prev = cells[(i - 1 + n) % n];
    const cur = cells[i];
    const next = cells[(i + 1) % n];
    const dIn = dirIdx(prev, cur);
    const dOut = dirIdx(cur, next);
    const cc = cellCenter(cur);
    if (dIn === dOut) {
      // straight: entry-edge midpoint → exit-edge midpoint
      const d = DIRS[dOut];
      const a = { x: cc.x - (d[0] * cellPx) / 2, y: cc.y - (d[1] * cellPx) / 2 };
      const steps = Math.max(2, Math.round(cellPx / STEP));
      for (let s = 0; s < steps; s++) {
        center.push({ x: a.x + (d[0] * cellPx * s) / steps, y: a.y + (d[1] * cellPx * s) / steps });
      }
      // The pre-start straight gets the starting-grid art INSTEAD of a plain
      // road tile (not in addition — an extra overlapping tile stamped later
      // would cover the grid markings).
      const key = i === 0 ? 'roadStart' : i === preStartIdx ? 'roadStartPositions' : 'roadStraight';
      pieces.push({ key, x: cc.x, y: cc.y, rot: straightRot(dOut) });
    } else {
      // corner: quarter arc, radius cellPx/2, centered on the shared corner
      const eIn = DIRS[(dIn + 2) % 4]; // toward entry edge
      const eOut = DIRS[dOut];
      const k = { x: cc.x + ((eIn[0] + eOut[0]) * cellPx) / 2, y: cc.y + ((eIn[1] + eOut[1]) * cellPx) / 2 };
      const a0 = Math.atan2(cc.y + (eIn[1] * cellPx) / 2 - k.y, cc.x + (eIn[0] * cellPx) / 2 - k.x);
      const a1 = Math.atan2(cc.y + (eOut[1] * cellPx) / 2 - k.y, cc.x + (eOut[0] * cellPx) / 2 - k.x);
      let sweep = a1 - a0;
      if (sweep > Math.PI) sweep -= 2 * Math.PI;
      if (sweep < -Math.PI) sweep += 2 * Math.PI;
      const SEGS = 14;
      for (let s = 0; s < SEGS; s++) {
        const ang = a0 + (sweep * s) / SEGS;
        center.push({ x: k.x + (Math.cos(ang) * cellPx) / 2, y: k.y + (Math.sin(ang) * cellPx) / 2 });
      }
      pieces.push({ key: 'roadCornerSmall', x: cc.x, y: cc.y, rot: CORNER_ROT[edgePair((dIn + 2) % 4, dOut)] });
    }
  }

  const halfWidth = (cellPx * KIT.roadSurfaceFrac) / 2;
  const track = new Track(center, halfWidth);
  const deco: PiecePlacement[] = def.deco.map((d) => ({
    key: d.key,
    x: originX + (d.cell[0] + 0.5) * cellPx,
    y: originY + (d.cell[1] + 0.5) * cellPx,
    rot: d.rot ?? 0,
  }));
  return { track, cellPx, pieces, deco };
}
