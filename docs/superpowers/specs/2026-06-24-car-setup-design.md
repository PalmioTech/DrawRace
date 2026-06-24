# Car Setup (Pre-Race Customization) — Design Spec

**Status:** Approved (brainstorming)
**Date:** 2026-06-24
**Project:** Project Racing (working name)
**Builds on:** [MVP design](2026-06-24-project-racing-design.md)

---

## 1. Goal

Before drawing, each player tunes their car by spending a fixed point budget across
five stats. This adds a meaningful pre-race decision (tradeoffs) without an economy
or unlocks. AI opponents get an automatic build within the same budget, so races stay
fair.

## 2. Stats & Physics Mapping

Five stats, each **level 0–3**. A **budget of 6 points** is distributed across them
(so you cannot max everything: 5×3 = 15 possible, only 6 spendable). **Level 0 = the
current car** (today's `CAR` constants); points only add on top. The budget itself is
the tradeoff.

| Stat (key)        | Effect (player-facing)                  | Physics mapping                      | Per level         |
|-------------------|------------------------------------------|--------------------------------------|-------------------|
| Grip (`grip`)     | Less sliding, faster corners             | `maxLatAccel ↑`, `slideGain ↓`       | +18% lat, −18% slide |
| Speed (`speed`)   | Higher top speed on straights            | `maxSpeed ↑`                         | +10%              |
| Brake (`brake`)   | Slows better into corners                | `brake ↑`                            | +20%              |
| Accel (`accel`)   | Recovers faster out of corners           | `accel ↑`                            | +18%              |
| Offroad (`offroad`)| Tolerates more off-track excursions     | `eliminateAfterOffRuns` = 2 + level  | +1 (2 → 5)        |

All multipliers/deltas live in `config/constants.ts` (a `STAT_SCALING` block) and are
tunable. They scale the existing base `CAR` values.

### Resolved stats

A `Loadout` (the chosen levels) resolves to a `CarStats` object holding the final
numeric values used by the simulation:

```
CarStats {
  maxSpeed, accel, brake, maxLatAccel, slideGain,   // scaled from CAR by levels
  eliminateAfterOffRuns,                             // 2 + offroad level
  // unscaled values copied from CAR for convenience:
  minSpeed, slideEase, maxSlide, renderSmooth, offTrackGrip, minOnGapPx, radius
}
```

`CarSim` reads everything customizable from the car's `CarStats` instead of the global
`CAR`. Values not affected by stats are copied through from `CAR` so `CarSim` has one
source of truth.

## 3. AI Builds

AI opponents receive an auto-generated `Loadout` within the same 6-point budget, varied
by difficulty and a per-car seed:

- **easy** — weaker / lopsided builds (points dumped into one stat, often a wrong one).
- **normal** — balanced spread.
- **hard** — strong, sensible spread (grip/brake favored).

`aiLoadout(difficulty, seed)` returns a valid 6-point loadout. The AI's trajectory
(`buildAITrajectory`) then uses that car's resolved `CarStats` (so a high-grip AI takes
corners faster, etc.).

## 4. Flow & UI

Interleaved per human — **each player sets up, then immediately draws**:

```
Menu → [Setup P1 → Draw P1] → [Setup P2 → Draw P2] → … → Race
```

- **SetupScene** configures ONE human at a time. On confirm it starts `DrawScene` for
  that same human.
- **DrawScene** now handles ONE human per invocation. When that human's stroke is
  accepted: if more humans remain → `SetupScene` for the next; otherwise → `RaceScene`.
- **vs Computer** mode has a single human (P1): Setup P1 → Draw P1 → Race. AI cars get
  auto builds. **Hotseat** loops every human through setup+draw.

### Shared state (Phaser registry)

Because setup and draw ping-pong across scenes, the accumulating build state lives in
the Phaser **registry** under a single key, e.g. `raceBuild`:

```
RaceBuild {
  config: RaceConfig,
  humanLoadouts: Loadout[],        // one per human, filled as they confirm setup
  humanTrajectories: Trajectory[], // one per human, filled as they finish drawing
  currentHuman: number,            // index of the human being set up / drawing
}
```

MenuScene initializes `raceBuild` and starts `SetupScene`. SetupScene pushes the
loadout and advances to Draw. DrawScene pushes the trajectory and advances to the next
Setup or to Race. RaceScene reads loadouts + trajectories to build the cars.

### SetupScene layout (landscape)

- Title: `P{n}: configura auto`.
- Five stat rows, each: stat label, level pips (`●●●○`), `−` and `+` touch buttons.
- Budget readout: `Punti: X/6`. `+` disabled when budget spent or stat at 3; `−`
  disabled at 0.
- `CONFERMA` button (proceeds to draw). Player's loadout pre-filled from the last
  saved build.
- Big, touch-friendly controls per the MVP UI rules.

## 5. Persistence

`SaveManager` stores the player's last loadout (`lastLoadout`) and loads it as the
default in SetupScene. Versioned alongside existing save data. AI builds are not saved.

## 6. Architecture Changes

New / changed units (each small, single-purpose):

- **`core/types.ts`** — add `StatKey`, `Loadout`, `CarStats`, `RaceBuild`.
- **`core/CarStats.ts`** (new) — `resolveStats(loadout): CarStats`, `defaultLoadout`,
  `aiLoadout(difficulty, seed)`, `loadoutTotal(loadout)`, validation (each ≤3, sum ≤6).
- **`config/constants.ts`** — add `SETUP` (budget, maxLevel) and `STAT_SCALING` blocks.
- **`core/CarSim.ts`** — constructor takes `stats: CarStats`; use `this.stats.*` for
  maxSpeed/accel/brake/maxLatAccel/slideGain/eliminateAfterOffRuns.
- **`core/AIDriver.ts`** — `buildAITrajectory(track, stats, seed)` uses the AI's stats.
- **`core/SpeedProfile.ts`** — `buildHumanTrajectory(raw, spacing, maxSpeed)` clamps to
  the player's top speed.
- **`scenes/SetupScene.ts`** (new) — per-human point allocation UI.
- **`scenes/MenuScene.ts`** — START initializes `raceBuild` and starts `SetupScene`.
- **`scenes/DrawScene.ts`** — handle one human/turn; read `raceBuild`; on finish go to
  next Setup or Race; build the player trajectory with the player's maxSpeed.
- **`scenes/RaceScene.ts`** — build `Car`s with each racer's `CarStats`.
- **`data/SaveManager.ts`** — persist/restore `lastLoadout`.
- **`ui/`** — a small stat-row control (reuse `Button` for `−`/`+`).

## 7. Data Flow

```
Menu (init raceBuild) ─▶ Setup P1 ─(loadout)▶ Draw P1 ─(trajectory)▶
  Setup P2 ─(loadout)▶ Draw P2 ─(trajectory)▶ … ─▶ Race
Race: for each human  → Car(resolveStats(loadout[i]), trajectory[i])
      for each AI      → Car(resolveStats(aiLoadout(diff, seed)), buildAITrajectory(...))
```

`CarSim` runs every car identically from its `CarStats` + `Trajectory` — it never needs
to know the loadout, human vs AI, or how stats were chosen.

## 8. Testing

- `resolveStats` — levels scale the right params; level 0 == base `CAR` values.
- Budget validation — `loadoutTotal ≤ 6`, each stat ≤ 3; `aiLoadout` always valid.
- Physics effect — a high-grip car corners faster / slides less than base; a high-speed
  car reaches a higher top speed; a high-offroad car survives 3+ excursions (reuse the
  existing dev `__elimTest`-style harness).
- Flow — Setup↔Draw ping-pong fills `raceBuild` correctly for 1 and 3 humans; race
  builds the right number of cars with the right stats.

## 9. Scope

**IN:** 5 stats, 6-point budget (0–3 each), per-human Setup→Draw flow, AI auto builds by
difficulty, physics mapping, saved player loadout.

**OUT (later):** unlocks/economy/currency, cosmetic parts/skins, multiple equipment
slots, nitro/boost as a stat, per-track recommended setups.

## 10. Open Items

- Exact scaling constants — to be tuned after play-testing on a real device.
- AI build tables per difficulty — initial heuristic, tuned later.
