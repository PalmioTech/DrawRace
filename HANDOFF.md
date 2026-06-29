# HANDOFF — Project Racing (draw-to-race mobile game)

Working name **"Project Racing"**. Repo: https://github.com/PalmioTech/DrawRace (branch `main`).

## Goal
Original mobile draw-to-race arcade game (inspired by DrawRace, not a clone). The
player draws a trajectory with their finger; the car replays it. Finger speed =
throttle. Top-down, touch-only, landscape, 60fps. Now styled as a **top-down rally**
(grass + dirt road + trees), Reckless-Racing-like.

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
  `Geometry.ts`, `Track.ts` (fits track into `PLAY_AREA`, borders, start line),
  `CarStats.ts` (setup loadout→stats).
- `src/scenes/` = Boot → Menu → Setup → Draw → Race → Result. Setup↔Draw ping-pong
  per human via the Phaser **registry** key `raceBuild` (RaceBuild type).
- `src/ui/` = `TrackView.ts` (procedural rally scene, baked to a RenderTexture),
  `Hud.ts` (circular lap badge + timer + live standings overlay), `Button.ts`,
  `theme.ts` (fonts/glow/colors helpers).
- `src/config/constants.ts` = **all tuning** (CAR physics, DRAW, SMOOTH, SETUP,
  STAT_SCALING, COLORS, PLAY_AREA, fonts). Tune feel here first.
- Specs in `docs/superpowers/specs/` (MVP + car-setup design).

## Current progress (all done + verified)
- Core loop: draw 3 laps (finger-speed throttle) → race → result. Modes: vs Computer
  + local Hotseat. Up to 4 cars.
- Physics: corner speed limit, **drift** (slide + yaw) only on sharp+fast corners,
  off-track = slow cruise (never blocks), eliminate after 2 off-track excursions.
- **Finish**: graceful ~1.5s eased power-slide to a **staggered park spot just past the
  finish line, inside the track** (not a hard stop).
- Car **setup** before drawing: 6-point budget across Grip/Speed/Brake/Accel/Offroad
  (`SetupScene`), AI gets auto loadout by difficulty. Saved to localStorage.
- **Car sprites** (yellow/green/blue/red PNGs in `public/assets/cars/`), rotated to heading.
- **Rally visuals**: grass + dirt road + pine trees/rocks + checkered line; start marker
  = dot + direction chevrons; prominent circular lap badge. Fonts = Saira.
- Full-screen track; HUD is a floating top-left overlay.
- localStorage save (best times, settings, last loadout), schema v2.

## What worked
- **Empirical tuning loop**: edit a constant → `preview_eval` a dev test → adjust. The
  dev hooks on `window` (DEV-only, in `src/main.ts`) are the verification backbone:
  `__smoke` (AI race), `__jitterTest` (noisy stroke → flip rate; target ~0),
  `__slideTest(dtMs)` (slide vs finger speed), `__elimTest`, `__statsTest`,
  `__recorderTest`, `__raceDemo`. Use these instead of guessing.
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
  to drive UI, `.emit('pointerup')` directly on the button container, or advance the
  engine via `r.engine.update(1/60)` in a loop.
- Headless preview RAF is paused between calls; `scene.start` is deferred — advance with
  `game.loop.step(...)` or take a screenshot to force frames.

## Next steps / open ideas
- Tune feel on a real phone (user iterates often): `CAR.slideGain/maxSlide/driftMaxAngle`,
  `cornerSlideMin/Full`, `driftSpeedMargin/CornerMin`, `maxLatAccel`, `DRAW.speedGain/smoothWindow`,
  AI in `AIDriver.ts` PARAMS. Finish anim: `CAR.finishDuration/finishBulge`.
- Content (post-MVP, see spec "OUT"): campaign/progression, more tracks/biomes, unlockable
  cars, cosmetics, power-ups/nitro, track editor, replays, audio.
- Visual polish options the user may want: real texture assets for photoreal rally
  (currently procedural/stylized); muted stat colors; track decorations (kerbs, barriers).
- Bundle is ~1.5MB (Phaser) — fine; could code-split later.
- Dev hooks in `main.ts` are DEV-guarded; remove or keep before any production release.

## Notes
- Git identity for commits in this env: `-c user.name="PalmioTech" -c user.email="dev@pecas.it"`.
- Commit/push only when asked (user has been asking each time).
