import type { DecoDef } from '../core/CircuitTrack';

export interface CircuitDef {
  id: string;
  name: string; // menu label, uppercase Italian
  difficulty: 'easy' | 'medium' | 'hard';
  /** Ordered CLOSED loop of 4-connected grid cells [col,row]; travel follows
   * list order; row 0 = top (screen Y grows downward). */
  cells: [number, number][];
  /** Index into cells of the start/finish cell (must be a straight). */
  startIndex: number;
  deco: DecoDef[];
}

export const CIRCUITS: CircuitDef[] = [
  {
    id: 'ovale', name: 'OVALE', difficulty: 'easy', startIndex: 3,
    // 7×4 perimeter ring, travel clockwise (east along the top row).
    cells: [
      [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],
      [6,1],[6,2],[6,3],
      [5,3],[4,3],[3,3],[2,3],[1,3],[0,3],
      [0,2],[0,1],
    ],
    deco: [
      { key: 'grandStandCovered', cell: [2.5, -0.8] }, { key: 'grandStand', cell: [4.2, -0.8] },
      { key: 'billboard', cell: [7.0, 0.2], rot: Math.PI },
      { key: 'billboardLow', cell: [-1.0, 2.8] },
      { key: 'tentLong', cell: [1.0, -0.9] },
      { key: 'lightPostModern', cell: [-0.8, 0.0] }, { key: 'lightPostModern', cell: [7.0, 3.2] },
      { key: 'barrierRed', cell: [6.9, 1.5], rot: Math.PI / 2 }, { key: 'barrierWhite', cell: [-0.9, 1.5], rot: Math.PI / 2 },
      { key: 'pylon', cell: [1.5, 0.6] }, { key: 'pylon', cell: [5.5, 2.4] },
    ],
  },
  {
    id: 'esse', name: 'ESSE', difficulty: 'medium', startIndex: 2,
    // 8×4 ring with an S-chicane cut into the bottom straight.
    cells: [
      [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],
      [7,1],[7,2],[7,3],
      [6,3],[5,3],
      [5,2],[4,2],[3,2],
      [3,3],[2,3],[1,3],[0,3],
      [0,2],[0,1],
    ],
    deco: [
      { key: 'grandStandAwning', cell: [1.5, -0.8] }, { key: 'grandStandCovered', cell: [3.2, -0.8] },
      { key: 'pitsGarage', cell: [5.0, -0.8] }, { key: 'pitsOffice', cell: [6.1, -0.8] },
      { key: 'billboard', cell: [8.0, 1.5], rot: -Math.PI / 2 },
      { key: 'billboardLow', cell: [4.0, 1.2] },
      { key: 'lightPostModern', cell: [-0.8, 3.0] }, { key: 'lightColored', cell: [8.0, 0.0] },
      { key: 'barrierWhite', cell: [4.0, 2.9] }, { key: 'barrierRed', cell: [3.4, 1.6] },
      { key: 'tentRoofDouble', cell: [-1.0, 1.0] },
      { key: 'pylon', cell: [5.2, 2.5] }, { key: 'pylon', cell: [3.8, 2.6] },
    ],
  },
  {
    id: 'serpente', name: 'SERPENTE', difficulty: 'hard', startIndex: 13,
    // 8×4 with a top chicane and a bottom double-notch: ten 90° corners.
    cells: [
      [0,0],[1,0],
      [1,1],[2,1],
      [2,0],[3,0],[4,0],[5,0],
      [5,1],[6,1],
      [6,0],[7,0],
      [7,1],[7,2],[7,3],
      [6,3],[5,3],
      [5,2],[4,2],
      [4,3],[3,3],[2,3],
      [2,2],[1,2],
      [1,3],[0,3],
      [0,2],[0,1],
    ],
    deco: [
      { key: 'grandStand', cell: [8.0, 2.0], rot: -Math.PI / 2 },
      { key: 'grandStandCovered', cell: [8.0, 1.0], rot: -Math.PI / 2 },
      { key: 'lightColored', cell: [7.55, 2.0] },
      { key: 'pylon', cell: [1.5, -0.6] }, { key: 'pylon', cell: [6.5, -0.6] },
      { key: 'billboardLow', cell: [3.5, -0.8] }, { key: 'billboard', cell: [-1.0, 2.0], rot: Math.PI / 2 },
      { key: 'lightColored', cell: [0.0, -0.8] }, { key: 'lightPostModern', cell: [7.0, 4.0] },
      { key: 'barrierRed', cell: [1.5, 1.55], rot: 0 }, { key: 'barrierWhite', cell: [5.5, 1.55] },
      { key: 'tentLong', cell: [3.0, 4.0] },
      { key: 'pylon', cell: [2.0, 2.5] }, { key: 'pylon', cell: [4.5, 1.5] }, { key: 'pylon', cell: [6.0, 2.5] },
    ],
  },
];
