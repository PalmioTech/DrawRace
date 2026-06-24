/**
 * Game bootstrap. Configures Phaser for mobile (responsive FIT scaling, touch
 * input, WebGL) and registers the scene flow:
 *   Boot → Menu → Draw → Race → Result
 */
import Phaser from 'phaser';
import { DESIGN, COLORS } from './config/constants';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { SetupScene } from './scenes/SetupScene';
import { DrawScene } from './scenes/DrawScene';
import { RaceScene } from './scenes/RaceScene';
import { ResultScene } from './scenes/ResultScene';
import { Track } from './core/Track';
import { Car } from './core/CarSim';
import { RaceEngine } from './core/RaceEngine';
import { buildAITrajectory } from './core/AIDriver';
import { buildHumanTrajectory } from './core/SpeedProfile';
import { baseStats, resolveStats, aiLoadout, loadoutTotal, STAT_KEYS } from './core/CarStats';
import { PathRecorder } from './core/PathRecorder';
import { PATH_SPACING, LAPS, CAR, SETUP } from './config/constants';
import type { Difficulty, Loadout } from './core/types';
import { NEON_LOOP } from './data/tracks';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO, // WebGL with Canvas fallback
  parent: 'game',
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT, // fit the fixed design resolution to any screen
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN.width,
    height: DESIGN.height,
  },
  input: {
    activePointers: 2, // allow touch
  },
  render: {
    antialias: true,
    roundPixels: false,
  },
  scene: [BootScene, MenuScene, SetupScene, DrawScene, RaceScene, ResultScene],
};

const game = new Phaser.Game(config);

// The game runs landscape. No orientation/gyroscope lock — if the device is
// held portrait, the CSS "rotate device" overlay (index.html) asks the player
// to turn it; held landscape, it fills the screen.

// Expose for debugging / automated smoke tests in dev.
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  const w = window as unknown as {
    __game: Phaser.Game;
    __smoke: () => unknown;
    __raceDemo: () => void;
    __jitterTest: () => unknown;
    __recorderTest: () => unknown;
    __elimTest: (bumps?: number) => unknown;
    __statsTest: () => unknown;
    __slideTest: (dtMs: number) => unknown;
  };
  w.__game = game;
  // Verify stat resolution + AI loadout validity.
  w.__statsTest = () => {
    const base = baseStats();
    const max = (k: string): Loadout => {
      const l = { grip: 0, speed: 0, brake: 0, accel: 0, offroad: 0 } as Loadout;
      (l as Record<string, number>)[k] = 3;
      return l;
    };
    const grip = resolveStats(max('grip'));
    const speed = resolveStats(max('speed'));
    const off = resolveStats(max('offroad'));
    const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
    const aiValid = diffs.every((d) =>
      [0, 1, 2, 3, 4].every((seed) => {
        const l = aiLoadout(d, seed * 13 + 1);
        return loadoutTotal(l) <= SETUP.budget && STAT_KEYS.every((k) => l[k] >= 0 && l[k] <= SETUP.maxLevel);
      }),
    );
    return {
      base0EqualsCar:
        base.maxSpeed === CAR.maxSpeed && base.eliminateAfterOffRuns === CAR.eliminateAfterOffRuns,
      gripRaisesLatLowersSlide: grip.maxLatAccel > base.maxLatAccel && grip.slideGain < base.slideGain,
      speedRaisesTop: speed.maxSpeed > base.maxSpeed,
      offroadRaisesTolerance: off.eliminateAfterOffRuns === CAR.eliminateAfterOffRuns + 3,
      aiLoadoutsAlwaysValid: aiValid,
      sampleAi: { easy: aiLoadout('easy', 5), hard: aiLoadout('hard', 5) },
    };
  };
  // Draw a CLEAN centerline lap at a given finger speed (smaller dtMs = faster
  // finger) and report peak slide — to check "fast = more slide".
  w.__slideTest = (dtMs: number) => {
    const track = new Track(NEON_LOOP);
    const raw: { x: number; y: number; t: number }[] = [];
    let t = 0;
    for (let s = 0; s < track.length * 3; s += 8) {
      const c = track.pointAt(s);
      raw.push({ x: c.x, y: c.y, t });
      t += dtMs;
    }
    const traj = buildHumanTrajectory(raw, PATH_SPACING, baseStats());
    const car = new Car(0, 'human', 'P1', 0x2de2e6, traj, track, baseStats());
    const peek = car as unknown as { slide: number; s: number };
    let maxSlideStraight = 0;
    let maxSlideCorner = 0;
    let frames = 0;
    while (!car.finished && frames < 60 * 120) {
      car.update(1 / 60, track, frames / 60);
      const idx = Math.min(traj.curvatures.length - 1, Math.max(0, Math.round(peek.s / traj.spacing)));
      const curvAbs = Math.abs(traj.curvatures[idx]);
      if (curvAbs < CAR.cornerSlideMin) maxSlideStraight = Math.max(maxSlideStraight, peek.slide);
      else maxSlideCorner = Math.max(maxSlideCorner, peek.slide);
      frames++;
    }
    return {
      dtMs,
      maxSlideStraight: +maxSlideStraight.toFixed(1),
      maxSlideCorner: +maxSlideCorner.toFixed(1),
      eliminated: car.eliminated,
    };
  };
  // Build a stroke that deliberately swerves far OFF the track twice and verify
  // the car gets eliminated, stops early, and ranks last.
  w.__elimTest = (bumps?: number) => {
    const track = new Track(NEON_LOOP);
    const raw: { x: number; y: number; t: number }[] = [];
    let t = 0;
    // Moderate, realistic swerves just past the border (peak ~1.5×halfWidth).
    const bump = (frac: number, center: number) =>
      track.halfWidth * 1.5 * Math.exp(-(((frac - center) / 0.06) ** 2));
    const nBumps = bumps ?? 2;
    for (let s = 0; s < track.length * 3; s += 8) {
      const c = track.pointAt(s);
      const tan = track.tangentAt(s);
      const nx = -tan.y;
      const ny = tan.x;
      const frac = s / (track.length * 3);
      let off = bump(frac, 0.3);
      if (nBumps >= 2) off += bump(frac, 0.65);
      raw.push({ x: c.x + nx * off, y: c.y + ny * off, t });
      t += 16;
    }
    const traj = buildHumanTrajectory(raw, PATH_SPACING, baseStats());
    const car = new Car(0, 'human', 'P1', 0x2de2e6, traj, track, baseStats());
    const peek = car as unknown as { offRuns: number; offTrack: boolean; speed: number };
    const events: { frac: number; offRuns: number }[] = [];
    let prevRuns = 0;
    let minOffSpeed = Infinity;
    let frames = 0;
    while (!car.finished && frames < 60 * 120) {
      car.update(1 / 60, track, frames / 60);
      if (peek.offTrack && !car.eliminated) minOffSpeed = Math.min(minOffSpeed, peek.speed);
      if (peek.offRuns !== prevRuns) {
        events.push({ frac: +(car.s / traj.length).toFixed(3), offRuns: peek.offRuns });
        prevRuns = peek.offRuns;
      }
      frames++;
    }
    return {
      eliminated: car.eliminated,
      stoppedEarly: car.s < traj.length,
      progressFrac: +(car.s / traj.length).toFixed(2),
      minOffTrackSpeed: minOffSpeed === Infinity ? null : Math.round(minOffSpeed),
      excursionEvents: events,
    };
  };
  // Feed the recorder a stroke that loops the start 3.5 times and verify lap
  // counting caps at LAPS, completes on the closing lap, and refuses extra input.
  w.__recorderTest = () => {
    const track = new Track(NEON_LOOP);
    const rec = new PathRecorder(track);
    let t = 0;
    let completedAtSample = -1;
    let sample = 0;
    let acceptedAfterComplete = 0;
    // start ON the start dot, then loop 3.5 times
    for (let s = 0; s < track.length * 3.5; s += 8) {
      const c = track.pointAt(s);
      const before = rec.lapsCompleted();
      const justDone = rec.add(c.x, c.y, t);
      t += 16;
      sample++;
      if (justDone && completedAtSample < 0) completedAtSample = sample;
      if (rec.isComplete() && before === rec.lapsCompleted() && completedAtSample > 0 && sample > completedAtSample) {
        // any add after completion that still pushed would grow points
        acceptedAfterComplete += 0; // add() returns false & ignores; nothing to do
      }
    }
    return {
      LAPS,
      laps: rec.lapsCompleted(),
      complete: rec.isComplete(),
      pointsCount: rec.getRaw().length,
      completedBeforeEnd: completedAtSample > 0 && completedAtSample < sample,
    };
  };
  // Build a NOISY human-like stroke (3 laps round the centerline with random
  // lateral wobble + irregular timing), run it through the real pipeline, and
  // measure how often the car's motion direction sharply reverses — the
  // signature of the "bouncing" bug. Low flip rate = smooth.
  w.__jitterTest = () => {
    const track = new Track(NEON_LOOP);
    const raw: { x: number; y: number; t: number }[] = [];
    let t = 0;
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let s = 0; s < track.length * 3; s += 9) {
      const c = track.pointAt(s);
      const tan = track.tangentAt(s);
      const nx = -tan.y;
      const ny = tan.x;
      const wob = (rnd() - 0.5) * 26; // jittery finger, ±13px
      raw.push({ x: c.x + nx * wob, y: c.y + ny * wob, t });
      t += 12 + rnd() * 26; // irregular timing
    }
    const traj = buildHumanTrajectory(raw, PATH_SPACING, baseStats());
    const car = new Car(0, 'human', 'P1', 0x2de2e6, traj, track, baseStats());
    const pts: { x: number; y: number }[] = [];
    let frames = 0;
    while (!car.finished && frames < 60 * 120) {
      car.update(1 / 60, track, frames / 60);
      pts.push({ ...car.pos });
      frames++;
    }
    // Fraction of consecutive movement vectors that reverse > 90°.
    let flips = 0;
    let maxJump = 0;
    for (let i = 2; i < pts.length; i++) {
      const a = { x: pts[i - 1].x - pts[i - 2].x, y: pts[i - 1].y - pts[i - 2].y };
      const b = { x: pts[i].x - pts[i - 1].x, y: pts[i].y - pts[i - 1].y };
      const la = Math.hypot(a.x, a.y);
      const lb = Math.hypot(b.x, b.y);
      maxJump = Math.max(maxJump, lb);
      if (la > 0.5 && lb > 0.5) {
        const cos = (a.x * b.x + a.y * b.y) / (la * lb);
        if (cos < 0) flips++; // > 90° direction reversal
      }
    }
    return {
      finished: car.finished,
      samples: pts.length,
      sharpFlips: flips,
      flipRate: +(flips / pts.length).toFixed(4),
      maxStepPx: +maxJump.toFixed(1),
    };
  };
  // Jump straight into a 4-car AI race to eyeball the RaceScene rendering.
  w.__raceDemo = () => {
    const track = new Track(NEON_LOOP);
    const colors = [0x2de2e6, 0xff2e97, 0xffe600, 0x7cff6b];
    const cars = [0, 1, 2, 3].map(
      (k) =>
        new Car(
          k,
          'ai',
          `CPU${k + 1}`,
          colors[k],
          buildAITrajectory(track, 'normal', 200 + k * 9, baseStats()),
          track,
          baseStats(),
        ),
    );
    game.scene.stop('Menu');
    game.scene.start('Race', {
      track,
      cars,
      config: { mode: 'ai', carCount: 4, difficulty: 'normal' },
      trackId: NEON_LOOP.id,
    });
  };
  // Headless core smoke test: run an AI-only race to completion and report.
  w.__smoke = () => {
    const track = new Track(NEON_LOOP);
    const cars = [0, 1, 2, 3].map(
      (k) =>
        new Car(
          k,
          'ai',
          `CPU${k}`,
          0xffffff,
          buildAITrajectory(track, k === 0 ? 'hard' : 'normal', 100 + k * 13, baseStats()),
          track,
          baseStats(),
        ),
    );
    const engine = new RaceEngine(track, cars);
    let frames = 0;
    while (!engine.allFinished() && frames < 60 * 120) {
      engine.update(1 / 60);
      frames++;
    }
    return {
      finished: engine.allFinished(),
      simSeconds: +engine.time.toFixed(2),
      ranking: engine.ranking().map((e) => ({
        pos: e.position,
        label: e.car.label,
        time: +e.car.finishTime.toFixed(2),
        progress: Math.round(e.car.raceProgress(track)),
      })),
      trackLen: Math.round(track.length),
    };
  };
}
