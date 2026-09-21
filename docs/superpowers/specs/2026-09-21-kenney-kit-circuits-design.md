# Kenney Racing Kit — Modular Circuits

Date: 2026-09-21 · Status: approved design

## Goal

Replace the single hardcoded rally track (NEON_LOOP spline) with **3 selectable
asphalt circuits** built from the Kenney Racing Kit (CC0, 3D GLB models),
rendered top-down. Full trackside dressing (grandstands, pit buildings,
billboards, lights). Draw-to-race physics, AI, HUD and draw mechanic stay
unchanged.

## Decisions (from brainstorming)

- Kit pieces → **top-down PNG renders** via a one-off three.js pipeline (the
  kit ships no top-down 2D art).
- Circuits are **grid-based, auto-tiled** from a cell path (approach A):
  authoring a track = listing grid cells. Corners are 90°, one radius.
- Asphalt circuits **replace** the dirt rally look entirely.
- **3 circuits** selectable from the main menu: easy oval, medium mixed,
  hard hairpins. Best time saved per track (already keyed by trackId).
- Dressing level: **full** (grandstands, pit lane visuals, billboards, lights,
  flags, barriers, trees).
- Cars keep the already-integrated Racing *Pack* sprites (kit race cars come
  only in green/orange/red/white; pack matches our yellow/green/blue/red).

## 1. Asset pipeline (one-off, throwaway script)

- A scratchpad three.js HTML page loads each needed GLB from the unzipped kit,
  renders it with an **orthographic camera looking straight down**, transparent
  background, **fixed pixels-per-world-unit** scale shared by all pieces (so
  they snap on the grid), and exports PNGs.
- Driven from the browser pane; output saved to `public/assets/kit/`.
- Kit license (CC0) copied alongside as `LICENSE.txt`.
- Pieces (~25–30): `roadStraight`, `roadCornerSmall`, `roadStart` (finish
  line), `roadStartPositions` (grid slots), plus dressing: `grandStand`,
  `grandStandAwning`, `grandStandCovered`, `pitsGarage`, `pitsOffice`,
  `billboard`, `billboardLow`, `flagCheckers`, `flagRed`, `lightPostModern`,
  `barrierRed`, `barrierWhite`, `tentLong`, `treeLarge`, `treeSmall`, `pylon`.
  Exact list may shrink/grow a little at render time based on how each reads
  from above; the pipeline makes re-rendering cheap.
- The pipeline page/script is NOT committed to the repo. Only the PNGs are.

## 2. Circuit definition — `src/data/circuits.ts`

```ts
interface CircuitDef {
  id: string;
  name: string;         // menu label
  difficulty: 'easy' | 'medium' | 'hard';
  cells: [number, number][];  // ordered CLOSED loop of grid cells (col,row)
  startIndex: number;         // index into cells: start/finish straight
  deco: { key: string; cell: [number, number]; rot?: number }[];
}
```

- `CELL` constant (design px) sized so the road surface width lands near the
  current feel (halfWidth ≈ 55–60 design px).
- A **validator** (dev-time) asserts: loop closed, cells 4-connected and
  distinct, no diagonal steps, startIndex is on a straight.
- Three authored circuits: easy wide oval, medium mixed S-curves, hard with
  hairpin-like stacked 90° pairs + chicane. Deco lists placed manually per
  circuit (grandstands along main straight, pit row behind it, billboards
  outside corners, etc.).

## 3. Geometry derivation — circuit → Track

- New builder (`src/core/CircuitTrack.ts`): walks the cell loop; per cell
  derives piece + rotation:
  - prev→next collinear → straight (rot from direction);
  - else → corner (rot from turn); start cell → `roadStart` piece.
- Centerline: straights = segments through cell centers; corners = quarter
  arcs (radius `CELL/2`, centered on the inner cell corner), sampled densely.
- `Track` class: constructor refactored to accept a **prebuilt centerline
  polyline + halfWidth + start index** (the spline-fitting path and
  `TrackDef`/NEON_LOOP are deleted). Everything downstream (project, borders,
  laps, ranking, off-track, AI, draw recorder) consumes the same Track API —
  unchanged.
- Fit: **uniform** scale + centering into PLAY_AREA (tiles must not stretch;
  grass fills the leftover screen). The piece layout and the centerline share
  the same transform.

## 4. Rendering — TrackView v3

- Grass ground: existing pack grass TileSprite (full screen).
- Road: one image per cell (`roadStraight`/`roadCornerSmall`/`roadStart`
  PNG, rotated), placed on the transformed grid.
- Dressing: images from `deco` list, plus start-grid slots on the start
  straight.
- Everything static is **baked into one RenderTexture** (100+ images → 1 draw).
- Drawn line (depth 10) and cars (depth 25) render on top, unchanged.
- Kit trees replace pack trees/rocks. Pack `dirt.png` no longer used by the
  track (removed from preload if nothing else uses it).

## 5. Menu, save, cleanup

- MenuScene: new PISTA section — 3 toggle buttons (like MODE/CARS rows).
  Selected track's best time shown in the header badge. Chosen trackId flows
  through the existing RaceBuild/registry into Setup/Draw/Race/Result.
- Save: best times already per-trackId; nothing to migrate.
- Delete: `NEON_LOOP`, `TrackDef`, spline sampling in `Geometry`
  (`sampleClosedSpline`) if unused elsewhere, dirt-road mask rendering.
- Dev hooks in `main.ts` switch from NEON_LOOP to circuit #0.

## 6. Verification

- `tsc` clean; `npm run build` clean.
- Dev hooks pass on the new Track: `__smoke` (AI race completes on each of the
  3 circuits), `__jitterTest` (flip rate ~0), `__elimTest`, `__recorderTest`.
- Circuit validator passes for all 3 authored circuits.
- Browser: screenshot each circuit (draw scene + race), full race demo runs,
  finish parking stays on track.

## Out of scope

- Large-radius corners / non-90° curves (future upgrade if corners feel stiff).
- Kit race car sprites, elevation pieces (ramps/bridges), road splits.
- Audio, campaign, unlocks.
