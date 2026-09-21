import type { CircuitDef } from '../data/circuits';

export interface DecoDef { key: string; cell: [number, number]; rot?: number } // rot radians, default 0; cell may be fractional (deco sits off-grid)

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
