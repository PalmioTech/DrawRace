# HANDOFF — Project Racing (draw-to-race mobile game)

Working name **"Project Racing"**. Repo: https://github.com/PalmioTech/DrawRace (branch `main`).

## Goal
Original mobile draw-to-race arcade game (inspired by DrawRace, not a clone). The
player draws a trajectory with their finger; the car replays it. Finger speed =
throttle. Top-down, touch-only, landscape, 60fps. Styled as a **top-down rally**
using top-down PNGs rendered from the Kenney Racing Kit (asphalt road tiles,
grandstands, billboards, trees, barriers), Reckless-Racing-like.

## Stack & how to run
- **Phaser 3 + TypeScript + Vite**. No React.
- `npm install`, then `npm run dev` (LAN-exposed via `.claude/launch.json` → test on
  phone at `http://<mac-LAN-ip>:5173/`; the Mac IP changes with network — re-check with
  `ipconfig getifaddr en0`). `npm run build` = tsc + vite build.
- Preview/verify in this harness: use `preview_start` (name `dev`), set a landscape
  viewport with `preview_resize` (e.g. 900×460), drive scenes via `preview_eval`.

## Architecture (key files)
- `src/core/` = pure logic, no Phaser. `CarSim.ts` (per-car physics + drift + finish
  anim), `RaceEngine.ts` (fixed-step + ranking), `AIDriver.ts`, `SpeedProfile.ts`
  (finger timing→trajectory), `PathRecorder.ts` (records stroke, counts laps),
  `Geometry.ts`, `Track.ts` (thin polyline wrapper — `project`, `isOnTrack`,
  `pointAt`/`tangentAt`, borders, start line; takes an already-built centerline,
  does no fitting/spline-sampling of its own), `CircuitTrack.ts` (`buildCircuit(def)`
  walks a `CircuitDef`'s 4-connected grid-cell loop into a `CircuitLayout`: the
  `Track` centerline plus every kit-tile `PiecePlacement` and circuit `deco`
  placement, auto-tiled from cell adjacency — straight/corner/start pieces and
  rotations are derived, not authored by hand), `CarStats.ts` (setup loadout→stats).
- `src/data/circuits.ts` = the 3 track definitions (`CIRCUITS`: `ovale` easy,
  `esse` medium, `serpente` hard) — each a `CircuitDef` (grid-cell loop, start
  index, trackside `deco` list). Add a track by adding a `CircuitDef` here;
  `validateCircuit` (in `CircuitTrack.ts`) checks structural validity (closed
  4-connected loop, start cell is a straight, etc.) — see `__circuitTest()`.
- `src/scenes/` = Boot → Menu → Setup → Draw → Race → Result. Setup↔Draw ping-pong
  per human via the Phaser **registry** key `raceBuild` (RaceBuild type, carries
  `trackId`). Menu's PISTA row picks the circuit; Draw/Race resolve it from
  `CIRCUITS` by id.
- `src/ui/` = `TrackView.ts` (**v3**: bakes a `CircuitLayout` — ground fill, kit
  road/deco tile PNGs, scattered trees — into one `RenderTexture`; no more
  procedural dirt-road drawing), `Hud.ts` (circular lap badge + timer + live
  standings overlay), `Button.ts`, `theme.ts` (fonts/glow/colors helpers).
- `src/config/constants.ts` = **all tuning** (CAR physics, DRAW, SMOOTH, SETUP,
  STAT_SCALING, COLORS, PLAY_AREA, fonts). Tune feel here first. `src/config/kit.ts`
  = Kenney Racing Kit render constants (`pxPerUnit`, `roadSurfaceFrac`, corner
  rotation table, canonical-orientation notes).
- Specs in `docs/superpowers/specs/` (MVP + car-setup design).

### Kit asset pipeline (one-off, not in the repo)
The 21 top-down PNGs in `public/assets/kit/` (roads, grandstands, billboards,
barriers, lights, trees, pylons, tents) were rendered once from the Kenney
Racing Kit's GLB models via a temporary `public/kit-render.html` (three.js,
`OrthographicCamera` straight down, per-model bbox → canvas size) driven
through the browser, then the PNGs were saved and the render harness deleted.
That pipeline is **not part of this repo** — to add a new kit model, recreate
the same one-off render step (see `.superpowers/sdd/2026-09-21-kenney-kit-circuits/task-1-report.md`
for the exact method and measured constants). The flag models (thin, edge-on
from directly above) rendered as illegible gray blobs and were dropped; so was
the duplicate `pitsGarageClosed`.

## Current progress (all done + verified)
- Core loop: draw 3 laps (finger-speed throttle) → race → result. Modes: vs Computer
  + local Hotseat. Up to 4 cars.
- **3 selectable grid circuits** (`ovale`/`esse`/`serpente`, easy/medium/hard) built
  from `data/circuits.ts` + `core/CircuitTrack.ts`; menu has a **PISTA row** (one
  button per circuit) above MODE/CARS/AI DIFFICULTY, with a per-track best-time
  label that switches on selection. Selected `trackId` flows through `RaceBuild` →
  Setup → Draw → Race → Result (best time is recorded/read per track).
  Old spline-fitted single-track system (`NEON_LOOP`/`TrackDef`/`data/tracks.ts`,
  `sampleClosedSpline`) is gone.
- Physics: corner speed limit, **drift** (slide + yaw) only on sharp+fast corners,
  off-track = slow cruise (never blocks), eliminate after 2 off-track excursions.
- **Finish**: graceful ~1.5s eased power-slide to a **staggered park spot just past the
  finish line, inside the track** (not a hard stop).
- Car **setup** before drawing: 6-point budget across Grip/Speed/Brake/Accel/Offroad
  (`SetupScene`), AI gets auto loadout by difficulty. Saved to localStorage.
- **Car sprites** (yellow/green/blue/red PNGs in `public/assets/cars/`), rotated to heading.
- **Rally visuals**: `TrackView` v3 bakes Kenney-Racing-Kit top-down PNGs (asphalt
  road tiles auto-tiled to each circuit's grid, grandstands, billboards, barriers,
  lights, pylons, tents, scattered trees) into one `RenderTexture`, on a flat
  verge-color ground fill (chosen to be seamless against the kit tiles' own baked
  grass edge — plain pack `grass.png` showed a color seam, see task-4 report);
  start marker = the kit's own start-line art. Fonts = Saira.
- Full-screen track; HUD is a floating top-left overlay.
- localStorage save (best times **per track**, settings, last loadout), schema v2.

## What worked
- **Empirical tuning loop**: edit a constant → `preview_eval` a dev test → adjust. The
  dev hooks on `window` (DEV-only, in `src/main.ts`) are the verification backbone:
  `__smoke(circuitIndex = 0)` (AI race on `CIRCUITS[circuitIndex]` — pass 0/1/2 to
  smoke-test each circuit), `__circuitTest` (structural validation of all `CIRCUITS`),
  `__jitterTest` (noisy stroke → flip rate; target ~0), `__slideTest(dtMs)` (slide vs
  finger speed), `__elimTest`, `__statsTest`, `__recorderTest`, `__raceDemo`. Use
  these instead of guessing.
- Drift stability: smooth/continuous gates (corner factor × over-speed factor, both
  0..1) + low-pass render position + signed smoothed curvature → no bouncing (flip ~0).
- Baking the static rally scene to a **RenderTexture** fixed render perf (was timing out
  re-drawing hundreds of shapes per frame).
- Finish at the **finish-line crossing count** (debounced), not trajectory end.

## What didn't work (avoid repeating)
- Per-tick slide direction from instantaneous curvature → car bounced L/R. Fixed via
  smoothing + stable slide sign.
- A big curvature multiplier on slide → instant saturation + jitter. Removed.
- Hard on/off drift gate → stutter near threshold. Replaced with continuous gates.
- Finish based on trajectory end → car drifted off past the line. Then "stop at line"
  felt like a hard block; then a too-fast/too-short slide. Final = eased 1.5s arc.
- `screen.orientation.lock` (gyroscope) → dropped; CSS "rotate device" overlay handles
  portrait, game runs landscape.
- Synthetic DOM pointer events in `preview_eval` don't reach Phaser input (no `pageX`);
  to drive UI, `.emit('pointerdown')` directly on the button container (buttons fire on down), or advance the
  engine via `r.engine.update(1/60)` in a loop.
- Headless preview RAF is paused between calls; `scene.start` is deferred — advance with
  `game.loop.step(...)` or take a screenshot to force frames.

## Next steps / open ideas
- Tune feel on a real phone (user iterates often): `CAR.slideGain/maxSlide/driftMaxAngle`,
  `cornerSlideMin/Full`, `driftSpeedMargin/CornerMin`, `maxLatAccel`, `DRAW.speedGain/smoothWindow`,
  AI in `AIDriver.ts` PARAMS. Finish anim: `CAR.finishDuration/finishBulge`.
- Content (post-MVP, see spec "OUT"): campaign/progression, more tracks/biomes, unlockable
  cars, cosmetics, power-ups/nitro, track editor, replays, audio.
- Visual polish options the user may want: higher-res/photoreal ground and road
  textures (currently Kenney kit renders); muted stat colors; more circuits (add a
  `CircuitDef` to `data/circuits.ts`).
- Bundle is ~1.5MB (Phaser) — fine; could code-split later.
- Dev hooks in `main.ts` are DEV-guarded; remove or keep before any production release.

## Notes
- Git identity for commits in this env: `-c user.name="PalmioTech" -c user.email="dev@pecas.it"`.
- Commit/push only when asked (user has been asking each time).
