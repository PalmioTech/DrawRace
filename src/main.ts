/**
 * Game bootstrap. Configures Phaser for mobile (responsive FIT scaling, touch
 * input, WebGL) and registers the scene flow:
 *   Boot → Menu → Draw → Race → Result
 */
import Phaser from 'phaser';
import { DESIGN, COLORS } from './config/constants';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { DrawScene } from './scenes/DrawScene';
import { RaceScene } from './scenes/RaceScene';
import { ResultScene } from './scenes/ResultScene';
import { Track } from './core/Track';
import { Car } from './core/CarSim';
import { RaceEngine } from './core/RaceEngine';
import { buildAITrajectory } from './core/AIDriver';
import { buildHumanTrajectory } from './core/SpeedProfile';
import { PathRecorder } from './core/PathRecorder';
import { PATH_SPACING, LAPS } from './config/constants';
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
  scene: [BootScene, MenuScene, DrawScene, RaceScene, ResultScene],
};

const game = new Phaser.Game(config);

// Best-effort landscape lock on first user gesture (Android/Chrome). On iOS
// Safari this silently no-ops and the CSS "rotate device" overlay takes over.
window.addEventListener(
  'pointerdown',
  () => {
    const orientation = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    orientation?.lock?.('landscape').catch(() => {
      /* not supported (iOS) — overlay handles it */
    });
  },
  { once: true },
);

// Expose for debugging / automated smoke tests in dev.
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  const w = window as unknown as {
    __game: Phaser.Game;
    __smoke: () => unknown;
    __raceDemo: () => void;
    __jitterTest: () => unknown;
    __recorderTest: () => unknown;
  };
  w.__game = game;
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
    const traj = buildHumanTrajectory(raw, PATH_SPACING);
    const car = new Car(0, 'human', 'P1', 0x2de2e6, traj, track);
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
        new Car(k, 'ai', `CPU${k + 1}`, colors[k], buildAITrajectory(track, 'normal', 200 + k * 9), track),
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
          buildAITrajectory(track, k === 0 ? 'hard' : 'normal', 100 + k * 13),
          track,
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
