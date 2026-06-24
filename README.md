# Project Racing (MVP)

A mobile **draw-to-race** arcade game. You don't drive — you **draw the line** your
car follows. The speed of your finger while drawing becomes the car's throttle:
fast on the straights, ease off into the corners. Draw 3 laps, then watch the race.

> Working title. Built with **Phaser 3 + TypeScript + Vite**, WebGL, touch-first.

## Run

```bash
npm install
npm run dev        # open the printed URL; on a phone use the LAN URL
```

Build for production:

```bash
npm run build      # type-check + bundle to dist/
npm run preview    # serve the build (also on LAN for phone testing)
```

Requires Node 18+.

## How to play

1. **Menu** — pick a mode, number of cars (2–4), and AI difficulty.
   - **vs Computer** — you draw, the rest are AI.
   - **Hotseat** — each human draws in turn on the same device, then all race together.
2. **Draw** — starting at the white start/finish line, trace **3 full laps** with
   your finger. The line is colored by finger speed (pink = slow, cyan = fast).
   You must complete 3 laps for the line to be valid. Tap **REDRAW** to retry,
   **NEXT/RACE** to confirm.
3. **Race** — cars replay their lines. Drawing too fast into a tight corner makes
   the car **slide wide and lose speed** (a time penalty). Cars don't collide —
   each runs its own line; ranking is by track progress.
4. **Result** — final times, best-time record (saved locally), race again or menu.

## Architecture

`src/core/` is pure TypeScript (no Phaser) so the game logic is testable in
isolation. `src/scenes/` only handle rendering + input.

```
src/
├── main.ts              # Phaser bootstrap (mobile FIT scaling, scene flow)
├── config/constants.ts  # all physics tuning + neon theme
├── core/                # engine-agnostic logic
│   ├── types.ts             # shared types (Vec2, Trajectory, RaceConfig…)
│   ├── Geometry.ts          # vectors, Catmull-Rom, resampling, projection
│   ├── Track.ts             # circuit geometry, borders, start line, projection
│   ├── PathRecorder.ts      # records the timed stroke, counts laps
│   ├── PathSmoother.ts      # spline + arc-length resample of a stroke
│   ├── SpeedProfile.ts      # finger timing → drivable Trajectory  ← core mechanic
│   ├── CarSim.ts            # one car: follow line, corner grip, slide, off-track
│   ├── RaceEngine.ts        # fixed-timestep update of all cars + ranking
│   └── AIDriver.ts          # generates an AI Trajectory (ideal line + mistakes)
├── data/
│   ├── tracks.ts            # track definitions (MVP: "Neon Loop")
│   └── SaveManager.ts       # versioned localStorage (best times, settings)
├── ui/
│   ├── TrackView.ts         # renders a Track (fill, neon borders, start line)
│   ├── Button.ts            # touch-friendly neon button
│   └── Hud.ts               # in-race timer, lap, live ranking
└── scenes/
    ├── BootScene.ts
    ├── MenuScene.ts
    ├── DrawScene.ts
    ├── RaceScene.ts
    └── ResultScene.ts
```

**Key idea:** `CarSim` doesn't know whether a `Trajectory` came from a human draw
or the AI — both are just points + per-point target speeds + curvature. The same
simulation runs everyone.

## Tuning

All feel constants live in `src/config/constants.ts` (`CAR`, `DRAW`, `PATH_SPACING`).
Start there to adjust corner grip (`maxLatAccel`), finger-speed → car-speed mapping
(`DRAW.speedGain`), acceleration, and slide behaviour.

## Scope

This is the **MVP vertical slice**: one track, vs-AI + hotseat, draw-to-race with
finger-speed throttle, grip/slide physics, AI with difficulty + mistakes, live
ranking, local best times.

Planned next (not in MVP): campaign/progression, unlockable cars, more tracks &
biomes, power-ups/nitro, replays, cosmetics shop, track editor, audio. See
[the design spec](docs/superpowers/specs/2026-06-24-project-racing-design.md).
