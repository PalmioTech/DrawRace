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

// Expose for debugging / automated smoke tests in dev.
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  const w = window as unknown as {
    __game: Phaser.Game;
    __smoke: () => unknown;
    __raceDemo: () => void;
  };
  w.__game = game;
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
