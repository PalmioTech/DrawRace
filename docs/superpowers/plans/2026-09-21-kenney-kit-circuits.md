# Kenney Kit Modular Circuits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single spline rally track with 3 menu-selectable asphalt circuits auto-tiled from grid cell paths, rendered with top-down PNGs generated from the Kenney Racing Kit 3D models.

**Architecture:** A one-off browser pipeline renders kit GLBs to top-down PNGs (`public/assets/kit/`). `CircuitDef` (cell loop + deco list) → `buildCircuit()` derives per-cell piece + rotation and a dense centerline (segments + quarter arcs), uniformly fitted to `PLAY_AREA` → feeds a slimmed `Track` (prebuilt centerline; spline code deleted). TrackView v3 bakes grass + pieces + deco into one RenderTexture. Menu gains a PISTA row; `trackId` flows through `RaceBuild`.

**Tech Stack:** Phaser 3 + TypeScript + Vite (no new dependencies; three.js only inside the throwaway pipeline page).

**Spec:** `docs/superpowers/specs/2026-09-21-kenney-kit-circuits-design.md`

## Global Constraints

- No new npm dependencies. The pipeline page loads three.js from CDN and is never committed.
- All gameplay units stay in design px and seconds; physics constants in `src/config/constants.ts` untouched.
- Kit art is CC0; copy the kit `License.txt` to `public/assets/kit/LICENSE.txt`.
- Repo has no test runner: verification uses `npx tsc --noEmit`, `npm run build`, and the DEV window hooks in `src/main.ts` driven from the browser (established pattern; see HANDOFF.md).
- Buttons fire on `pointerdown` (emit `'pointerdown'` to drive UI from the console).
- The dev server is managed by the harness (`preview_start`, name `dev`), never via Bash.
- Commit at the end of every task and push to `origin main` (user's standing rule). Commit as `git -c user.name="PalmioTech" -c user.email="dev@pecas.it" commit ...`.
- Unzipped kit location: `/private/tmp/claude-501/-Users-devpecas-Documents-PrivateWeb-DrawRace/b527e749-555b-43c0-8b60-6980b6b4648a/scratchpad/kit/` (GLBs under `Models/GLTF format/`). If missing, re-unzip `/Users/devpecas/Downloads/kenney_racing-kit.zip` there.

---

### Task 1: Asset pipeline — top-down PNGs from kit GLBs

**Files:**
- Create: `public/assets/kit/*.png` (~28 files, listed below) + `public/assets/kit/LICENSE.txt`
- Create: `src/config/kit.ts`
- Temporary (delete before commit): `public/kit-render.html`, `public/kit-models/*.glb`

**Interfaces:**
- Produces: PNG textures keyed by filename (loaded in Task 4), and `src/config/kit.ts`:

```ts
/** Kit render pipeline constants (measured, do not guess). */
export const KIT = {
  /** Pipeline render scale: pixels per kit world unit (road tile = 1 unit). */
  pxPerUnit: 256,
  /** Opaque road-surface width of roadStraight.png as a fraction of the tile
   * (measured from the rendered PNG's center row). */
  roadSurfaceFrac: 0.0, // ← replace with measured value, e.g. 0.72
} as const;

/** Canonical orientations of the rendered art (verified visually in Task 1):
 * - roadStraight: road runs VERTICALLY (travel N–S).
 * - roadCornerSmall: connects the SOUTH edge to the WEST edge.
 * Rotation tables in CircuitTrack.ts are written against these. */
```

**Pieces to render** (GLB name → png name): roads `roadStraight`, `roadCornerSmall`, `roadStart`, `roadStartPositions`; dressing `grandStand`, `grandStandAwning`, `grandStandCovered`, `pitsGarage`, `pitsGarageClosed`, `pitsOffice`, `billboard`, `billboardLow`, `flagCheckers`, `flagRed`, `flagGreen`, `lightPostModern`, `lightColored`, `barrierRed`, `barrierWhite`, `tentLong`, `tentRoofDouble`, `treeLarge`, `treeSmall`, `pylon`, `overheadLights`.

- [ ] **Step 1: Stage models + pipeline page under the dev server**

Copy the ~26 GLBs to `public/kit-models/`. Write `public/kit-render.html`: three.js (CDN import map, `three@0.160.0` + GLTFLoader), `OrthographicCamera` looking straight down (−Y up = screen north), transparent `WebGLRenderer({alpha:true, preserveDrawingBuffer:true})`, ambient + directional light (directional from straight above so the top-down read is flat, slight offset for depth). For each model: compute XZ bbox, size the canvas to `ceil(bbox * 256)` px, frame the ortho camera exactly to the bbox, render, `canvas.toDataURL('image/png')`. Expose `window.__renderAll()` → `{name: dataURL}` and `window.__renderOne(name)`.

- [ ] **Step 2: Extract PNGs**

Open `http://localhost:5173/kit-render.html` in the browser pane. For each piece call `__renderOne`, pipe the base64 through Bash `base64 -d > public/assets/kit/<name>.png`. (If a dataURL is too large for one tool result, return it in two slices and concatenate.)

- [ ] **Step 3: Verify renders visually**

Read 4–5 of the PNGs (Read tool renders images): roadStraight must read as vertical asphalt with edges; roadCornerSmall must connect south→west (else record the ACTUAL canonical edges in the `kit.ts` comment and adjust the Task 3 rotation table accordingly); grandstand/pits/billboard must be recognizable from above. Re-render with tweaked lighting if flat/illegible.

- [ ] **Step 4: Measure road surface fraction**

`roadStraight.png` center row: count opaque (alpha>0) pixels / width → write the value into `KIT.roadSurfaceFrac`. Command:

```bash
python3 - <<'EOF'
from PIL import Image
im = Image.open('public/assets/kit/roadStraight.png').convert('RGBA')
row = [im.getpixel((x, im.height//2))[3] > 0 for x in range(im.width)]
print(sum(row) / im.width)
EOF
```

(If PIL missing: `sips` can't read alpha — fall back to a 10-line canvas measurement in the pipeline page.)

- [ ] **Step 5: License + cleanup + type-check**

Copy kit `License.txt` → `public/assets/kit/LICENSE.txt`. Delete `public/kit-render.html` and `public/kit-models/`. Run `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add public/assets/kit src/config/kit.ts
git -c user.name="PalmioTech" -c user.email="dev@pecas.it" commit -m "Kit pipeline output: top-down PNGs from Kenney Racing Kit + measured constants

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 2: Circuit definitions + validator

**Files:**
- Create: `src/data/circuits.ts`
- Create: `src/core/CircuitTrack.ts` (validator only in this task)
- Modify: `src/main.ts` (add `__circuitTest` hook in the DEV block)

**Interfaces:**
- Produces:

```ts
// src/data/circuits.ts
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
export const CIRCUITS: CircuitDef[];

// src/core/CircuitTrack.ts
export interface DecoDef { key: string; cell: [number, number]; rot?: number } // rot radians, default 0; cell may be fractional (deco sits off-grid)
export function validateCircuit(def: CircuitDef): string[]; // [] = valid, else human-readable problems
```

- [ ] **Step 1: Write the three circuits**

```ts
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
      { key: 'flagCheckers', cell: [3, -0.55] },
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
      { key: 'flagCheckers', cell: [2, -0.55] },
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
      { key: 'flagCheckers', cell: [7.55, 2.0], rot: Math.PI / 2 },
      { key: 'flagRed', cell: [1.5, -0.6] }, { key: 'flagGreen', cell: [6.5, -0.6] },
      { key: 'billboardLow', cell: [3.5, -0.8] }, { key: 'billboard', cell: [-1.0, 2.0], rot: Math.PI / 2 },
      { key: 'lightColored', cell: [0.0, -0.8] }, { key: 'lightPostModern', cell: [7.0, 4.0] },
      { key: 'barrierRed', cell: [1.5, 1.55], rot: 0 }, { key: 'barrierWhite', cell: [5.5, 1.55] },
      { key: 'tentLong', cell: [3.0, 4.0] },
      { key: 'pylon', cell: [2.0, 2.5] }, { key: 'pylon', cell: [4.5, 1.5] }, { key: 'pylon', cell: [6.0, 2.5] },
    ],
  },
];
```

- [ ] **Step 2: Write the validator**

```ts
// src/core/CircuitTrack.ts
import type { CircuitDef } from '../data/circuits';

export interface DecoDef { key: string; cell: [number, number]; rot?: number }

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
```

- [ ] **Step 3: Wire the dev hook**

In `src/main.ts` DEV block add:

```ts
w.__circuitTest = () => CIRCUITS.map((d) => ({ id: d.id, problems: validateCircuit(d) }));
```

(add `__circuitTest: () => unknown;` to the `w` type and the imports `CIRCUITS`, `validateCircuit`).

- [ ] **Step 4: Verify**

`npx tsc --noEmit` clean. In the browser (dev preview): `__circuitTest()` → every circuit reports `problems: []`. Temporarily corrupt one cell in the console-loaded copy is NOT possible (module const) — instead verify the validator negatively by calling `validateCircuit({...CIRCUITS[0], startIndex: 0})` in a quick `javascript_tool` eval via `window.__circuitTest` variant: acceptable to skip; the positive check + tsc suffices.

- [ ] **Step 5: Commit + push** (same pattern as Task 1, message `"Circuit definitions (3 tracks) + structural validator"`).

---

### Task 3: Geometry — buildCircuit + Track refactor

**Files:**
- Modify: `src/core/CircuitTrack.ts` (add layout builder)
- Modify: `src/core/Track.ts` (constructor from prebuilt centerline; delete spline fitting)
- Modify: `src/core/Geometry.ts` (delete `sampleClosedSpline` if now unused — grep first)
- Delete: `src/data/tracks.ts`
- Modify: `src/main.ts` (hooks use circuit 0)

**Interfaces:**
- Consumes: `CIRCUITS`, `validateCircuit` (Task 2), `KIT.roadSurfaceFrac` (Task 1).
- Produces:

```ts
// CircuitTrack.ts
export interface PiecePlacement { key: string; x: number; y: number; rot: number }
export interface CircuitLayout {
  track: Track;
  cellPx: number;
  pieces: PiecePlacement[]; // road tiles incl. roadStart + roadStartPositions
  deco: PiecePlacement[];
}
export function buildCircuit(def: CircuitDef): CircuitLayout;

// Track.ts — new constructor; EVERY other public member keeps its signature
export class Track {
  /** center: dense CLOSED polyline (last point ≈ first) starting AT the start
   * line, already in design px, travel = array order. */
  constructor(center: Vec2[], halfWidth: number);
}
```

- [ ] **Step 1: Slim Track**

Remove `TrackDef` import, `def` field, `fitControls`, spline sampling. Constructor becomes:

```ts
constructor(center: Vec2[], halfWidth: number) {
  this.halfWidth = halfWidth;
  const dense = [...center];
  if (Math.hypot(dense[0].x - dense[dense.length - 1].x, dense[0].y - dense[dense.length - 1].y) > 1e-3) {
    dense.push({ ...dense[0] });
  }
  this.center = dense;
  this.cum = cumulativeLengths(dense);
  this.length = this.cum[this.cum.length - 1];
  this.startPos = this.center[0];
  this.startDir = normalize(sub(this.center[1], this.center[0]));
  const side = scale(perp(this.startDir), this.halfWidth);
  this.startA = add(this.startPos, side);
  this.startB = sub(this.startPos, side);
}
```

Grep `sampleClosedSpline` — if only old Track used it, delete it from `Geometry.ts`. Delete `src/data/tracks.ts`; `tsc` will list every stale `NEON_LOOP`/`TrackDef` import (main.ts, MenuScene, DrawScene — fixed in this task and Task 5; for now point them at `buildCircuit(CIRCUITS[0])` to keep the build green).

- [ ] **Step 2: Implement buildCircuit**

```ts
import { PLAY_AREA } from '../config/constants';
import { KIT } from '../config/kit';
import { Track } from './Track';
import type { Vec2 } from './types';

const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E,S,W,N
const dirIdx = (from: [number, number], to: [number, number]) =>
  DIRS.findIndex((d) => d[0] === to[0] - from[0] && d[1] === to[1] - from[1]);
// Straight art runs vertically → N/S travel = rot 0, E/W = PI/2.
const straightRot = (d: number) => (d % 2 === 0 ? Math.PI / 2 : 0);
// Corner art connects SOUTH↔WEST edges (canonical, see kit.ts). A corner
// cell's two open edges are (opposite of entry dir) and (exit dir).
// Quarter-turn lookup keyed by the unordered open-edge pair:
const CORNER_ROT: Record<string, number> = {
  'S,W': 0, 'N,W': Math.PI / 2, 'E,N': Math.PI, 'E,S': -Math.PI / 2,
};
const EDGE = ['E', 'S', 'W', 'N'];
const edgePair = (a: number, b: number) => [EDGE[a], EDGE[b]].sort().join(',');

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
      const key = i === 0 ? 'roadStart' : 'roadStraight';
      pieces.push({ key, x: cc.x, y: cc.y, rot: straightRot(dOut) });
      // start grid slots on the straight BEFORE the start line (last cell if straight)
      if (i === 0) {
        const prevPrev = cells[(n - 2) % n];
        if (dirIdx(prevPrev, prev) === dIn) {
          const pc = cellCenter(prev);
          pieces.push({ key: 'roadStartPositions', x: pc.x, y: pc.y, rot: straightRot(dIn) });
        }
      }
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
```

- [ ] **Step 3: Update dev hooks**

`src/main.ts`: replace every `new Track(NEON_LOOP)` with `buildCircuit(CIRCUITS[0]).track`; `trackId: NEON_LOOP.id` → `CIRCUITS[0].id`; drop the `NEON_LOOP` import. `__raceDemo` passes the layout too once Task 4 lands — for now keep it compiling by passing `track` only if RaceScene still accepts it (Task 4 changes both sides; if executing tasks in order, `__raceDemo` is finished in Task 4).

- [ ] **Step 4: Verify geometry headlessly**

`npx tsc --noEmit` clean. Browser hooks: `__circuitTest()` all `[]`; `__smoke()` → `finished: true`, plausible `trackLen`; `__jitterTest()` → `flipRate` ≤ 0.001; `__elimTest()` → `eliminated: true`; `__recorderTest()` → `complete: true`. These exercise projection, laps, off-track and finish on the new Track.

- [ ] **Step 5: Commit + push** (`"Grid auto-tiled circuit geometry; Track takes a prebuilt centerline"`).

---

### Task 4: TrackView v3 + scene wiring

**Files:**
- Modify: `src/ui/TrackView.ts` (full rewrite of `drawTrack`)
- Modify: `src/scenes/BootScene.ts` (preload kit PNGs; drop `dirt`, `rock1..3`, pack trees if unused elsewhere — grep)
- Modify: `src/scenes/DrawScene.ts`, `src/scenes/RaceScene.ts`, `src/main.ts` (`__raceDemo`)
- Modify: `src/core/types.ts` (`RaceBuild.trackId: string`)

**Interfaces:**
- Consumes: `buildCircuit`, `CircuitLayout`, `KIT.pxPerUnit`.
- Produces: `drawTrack(scene: Phaser.Scene, layout: CircuitLayout): void`; `RaceScene` payload becomes `{ layout: CircuitLayout; cars: Car[]; config: RaceConfig; trackId: string }` (engine uses `layout.track`).

- [ ] **Step 1: BootScene preloads**

`this.load.setPath('assets/kit')` then `this.load.image(key, key + '.png')` for every rendered piece key (Task 1 list). Keep pack `grass` + pack car sprites. Remove `dirt`, `tree-large`, `tree-small`, `rock1..3` loads (TrackView v3 uses kit `treeLarge`/`treeSmall`; grep confirms nothing else uses the pack ones) and delete their files from `public/assets/kenney/` except `grass.png`, the 4 car PNGs and `LICENSE.txt`.

- [ ] **Step 2: Rewrite drawTrack**

```ts
export function drawTrack(scene: Phaser.Scene, layout: CircuitLayout): void {
  const { width: W, height: H } = DESIGN;
  const rt = scene.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(-50);

  const grass = scene.make.tileSprite({ x: 0, y: 0, width: W, height: H, key: 'grass', add: false }).setOrigin(0, 0);
  rt.draw(grass);
  grass.destroy();

  const tmp = scene.make.image({ add: false });
  const stamp = (p: PiecePlacement) => {
    tmp.setTexture(p.key);
    // every kit PNG was rendered at KIT.pxPerUnit px per world unit
    const s = layout.cellPx / KIT.pxPerUnit;
    tmp.setScale(s).setRotation(p.rot).setPosition(p.x, p.y);
    rt.draw(tmp);
  };
  // scenery trees: same rejection-sampled scatter as before, but kit sprites
  const rand = rng(20260921);
  const treeScatter: PiecePlacement[] = [];
  let tries = 0;
  while (treeScatter.length < 26 && tries < 3000) {
    tries++;
    const x = 20 + rand() * (W - 40);
    const y = 20 + rand() * (H - 40);
    if (layout.track.project({ x, y }).dist < layout.track.halfWidth + layout.cellPx * 0.55) continue;
    if (treeScatter.some((t) => Math.hypot(t.x - x, t.y - y) < 64)) continue;
    treeScatter.push({ key: rand() < 0.6 ? 'treeLarge' : 'treeSmall', x, y, rot: rand() * Math.PI * 2 });
  }
  for (const p of layout.pieces) stamp(p);
  for (const p of treeScatter) stamp(p);
  for (const p of layout.deco) stamp(p);
  tmp.destroy();
}
```

(keep the `rng` helper; delete DIRT/checkered code — `roadStart` art carries the finish line.)

- [ ] **Step 3: Scene wiring**

`RaceBuild` gains `trackId: string` (set in Task 5's menu; default `CIRCUITS[0].id` for now where built). `DrawScene.create`: `const layout = buildCircuit(CIRCUITS.find(c => c.id === this.build.trackId) ?? CIRCUITS[0]); this.track = layout.track; drawTrack(this, layout);` and pass `layout` (not `track`) when starting `Race`. `RaceScene`: payload `layout`; `this.engine = new RaceEngine(layout.track, cars)`; `drawTrack(this, layout)`; every other `track` use reads `layout.track`. `__raceDemo` builds `const layout = buildCircuit(CIRCUITS[0])` and starts Race with it.

- [ ] **Step 4: Verify in browser**

`tsc` clean → reload preview → `__raceDemo()`: screenshot shows asphalt ring with kerbs, start line art, grid slots, grandstands/billboards/trees; run race to finish (step the loop with increasing timestamps), finish parking stays on asphalt (reuse the max-finish-dist probe from HANDOFF context: for each car while `finishing`, `layout.track.project(c.pos).dist + 13 ≤ halfWidth` must hold). Draw flow: start a hotseat build via registry, screenshot DrawScene (track + start marker + drawn line legible on asphalt).

- [ ] **Step 5: Commit + push** (`"TrackView v3: baked kit-tile circuits; scenes carry CircuitLayout"`).

---

### Task 5: Menu PISTA row + flow + cleanup

**Files:**
- Modify: `src/scenes/MenuScene.ts`, `src/scenes/ResultScene.ts` (only if it references trackId — grep), `HANDOFF.md`

**Interfaces:**
- Consumes: `CIRCUITS` (id, name), `save.getBestTime(trackId)`, `RaceBuild.trackId` (Task 4).

- [ ] **Step 1: PISTA section in MenuScene**

Reflow create() Y coordinates to fit 5 rows (title 40, best 92; PISTA label 126, buttons 170; MODE 238/284; CARS 350/396; AI DIFficulty 462/508; START 592; footer 668). Add:

```ts
private trackId = CIRCUITS[0].id;
private trackButtons: Button[] = [];
// in create(), mirroring the CARS row pattern:
this.section(cx, 126, 'PISTA');
this.trackButtons = CIRCUITS.map((c, i) =>
  makeButton(this, cx - 220 + i * 220, 170, 200, 62, c.name, () => this.setTrack(c.id)),
);
private setTrack(id: string): void { this.trackId = id; this.refresh(); }
```

`refresh()`: `this.trackButtons.forEach((b, i) => b.setSelected(CIRCUITS[i].id === this.trackId));` and the best-time text updates from `save.getBestTime(this.trackId)` (make `bestText` a field; text `BEST <t>s` or `NO RECORD YET`). `start()` sets `trackId: this.trackId` in the `RaceBuild`.

- [ ] **Step 2: Result flow**

Grep `trackId` in `ResultScene` — best-time recording already keys on the raced trackId passed through the Race payload; fix any remaining hardcoded id.

- [ ] **Step 3: Full verify, all three circuits**

`tsc` + `npm run build` clean. Browser: for each circuit — select in menu (emit `pointerdown`), START → Setup → verify DrawScene shows that circuit (screenshot), and `__smoke`-style AI race on it completes: quickest is a `javascript_tool` loop building `buildCircuit(CIRCUITS[i])` + 4 AI cars + `RaceEngine` stepped to completion (mirrors `__smoke` but parametric). Menu best-time label switches per selected track.

- [ ] **Step 4: HANDOFF.md**

Update: tracks are now grid circuits (`circuits.ts` + `CircuitTrack.ts`), kit asset pipeline summary (one-off, not in repo), NEON_LOOP/TrackDef gone, TrackView v3 bakes kit tiles, menu has PISTA row.

- [ ] **Step 5: Commit + push** (`"Menu track selection (3 circuits), per-track best times, docs"`).

---

## Self-review notes

- Spec coverage: pipeline→T1, defs/validator→T2, geometry/Track→T3, rendering/scenes→T4, menu/save/cleanup/verify→T5. Out-of-scope items untouched.
- Corner canonical orientation is measured in T1 and consumed by T3's `CORNER_ROT`; if T1 finds a different canonical pair, T1 records it in `kit.ts` and T3 shifts every entry by the same quarter-turn delta.
- `roadStartPositions` only placed when the cell before the start is straight; all three authored circuits satisfy this (ovale idx3←idx2 straight; esse idx2←idx1 straight; serpente idx13←idx12 straight).
