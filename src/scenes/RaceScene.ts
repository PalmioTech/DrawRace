/**
 * Race phase. Runs the fixed-timestep RaceEngine and renders the cars, their
 * neon trails and slide/off-track feedback. No player input during the race —
 * the cars replay their drawn (or AI) trajectories for all LAPS laps.
 */
import Phaser from 'phaser';
import { COLORS, DESIGN, LAPS, CAR_TEXTURES, CAR_SPRITE_LEN } from '../config/constants';
import type { RaceConfig, Vec2 } from '../core/types';
import type { Track } from '../core/Track';
import type { Car } from '../core/CarSim';
import { RaceEngine } from '../core/RaceEngine';
import { drawTrack } from '../ui/TrackView';
import { Hud } from '../ui/Hud';
import { makeButton } from '../ui/Button';
import { displayStyle, bodyStyle, glow, hex } from '../ui/theme';
const TRAIL = 14;

interface RaceData {
  track: Track;
  cars: Car[];
  config: RaceConfig;
  trackId: string;
}

export class RaceScene extends Phaser.Scene {
  private payload!: RaceData;
  private engine!: RaceEngine;
  private hud!: Hud;
  private carsG!: Phaser.GameObjects.Graphics;
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private trails = new Map<number, Vec2[]>();
  private eliminatedShown = new Set<number>();
  private started = false;
  private done = false;
  private paused = false;
  private pauseUI?: Phaser.GameObjects.Container;

  constructor() {
    super('Race');
  }

  init(data: RaceData): void {
    this.payload = data;
  }

  create(): void {
    const { track, cars } = this.payload;
    this.engine = new RaceEngine(track, cars);

    // Phaser reuses the scene instance across restarts, so reset run state here
    // (field initializers only run once). Without this, a 2nd race sees
    // done=true/started=true and never advances.
    this.started = false;
    this.done = false;
    this.paused = false;
    this.pauseUI = undefined;
    this.time.paused = false;
    this.trails.clear();
    this.eliminatedShown.clear();
    this.sprites.clear();

    drawTrack(this, track);

    this.carsG = this.add.graphics().setDepth(20);
    cars.forEach((c) => {
      this.trails.set(c.id, []);
      // Car sprite, scaled to the on-track length (width from the texture aspect).
      const tex = CAR_TEXTURES[c.id % CAR_TEXTURES.length];
      const img = this.add.image(c.pos.x, c.pos.y, tex).setDepth(25);
      img.setDisplaySize(CAR_SPRITE_LEN * (img.width / img.height), CAR_SPRITE_LEN);
      this.sprites.set(c.id, img);
    });

    this.hud = new Hud(this, cars.length);
    this.hud.update(this.engine); // show the starting grid before the countdown

    // Pause button, top-right (HUD floats top-left).
    makeButton(this, DESIGN.width - 52, 48, 60, 60, 'II', () => this.togglePause(), COLORS.panelBorder).setDepth(210);

    // 3-2-1-GO countdown, then release the cars.
    this.countdown();
  }

  /** Pause overlay: freezes sim + countdown, offers resume / exit to menu. */
  private togglePause(): void {
    if (this.done) return;
    this.paused = !this.paused;
    this.time.paused = this.paused; // also freezes the 3-2-1 countdown timer
    if (this.paused) {
      const cx = DESIGN.width / 2;
      const cy = DESIGN.height / 2;
      const dim = this.add.rectangle(cx, cy, DESIGN.width, DESIGN.height, COLORS.bg, 0.72);
      const title = this.add.text(cx, cy - 120, 'PAUSA', displayStyle(56, COLORS.textPrimary, '900')).setOrigin(0.5);
      glow(title, COLORS.trackBorder, 1.2);
      const resume = makeButton(this, cx, cy + 4, 320, 80, 'RIPRENDI', () => this.togglePause(), COLORS.accent);
      const exit = makeButton(this, cx, cy + 104, 320, 80, 'ESCI AL MENU', () => {
        this.time.paused = false;
        this.scene.start('Menu');
      });
      this.pauseUI = this.add.container(0, 0, [dim, title, resume, exit]).setDepth(220);
    } else {
      this.pauseUI?.destroy();
      this.pauseUI = undefined;
    }
  }

  private countdown(): void {
    const cx = DESIGN.width / 2;
    const cy = DESIGN.height / 2;
    const label = this.add
      .text(cx, cy, '3', displayStyle(140, COLORS.textPrimary, '900'))
      .setOrigin(0.5)
      .setDepth(200);
    glow(label, COLORS.trackBorder, 1.6);

    const seq = ['3', '2', '1', 'GO'];
    let i = 0;
    this.time.addEvent({
      delay: 700,
      repeat: seq.length - 1,
      callback: () => {
        i++;
        if (i < seq.length) {
          label.setText(seq[i]);
          label.setColor(seq[i] === 'GO' ? hex(COLORS.accent) : hex(COLORS.textPrimary));
          if (seq[i] === 'GO') this.started = true;
        } else {
          label.destroy();
        }
      },
    });
  }

  update(_time: number, delta: number): void {
    if (this.paused) return; // frozen frame stays on screen
    this.renderCars();
    if (!this.started || this.done) return;

    const ongoing = this.engine.update(delta / 1000);
    this.hud.update(this.engine);

    if (!ongoing) {
      this.done = true;
      this.finish();
    }
  }

  /** Draw trails + car bodies + slide/off-track sparks. */
  private renderCars(): void {
    const g = this.carsG;
    g.clear();
    // Interpolate prev→current sim state by the accumulator fraction so cars
    // move smoothly at any display Hz (fixed 60Hz sim, variable frame rate).
    const a = this.engine.alpha;
    for (const car of this.payload.cars) {
      const sprite = this.sprites.get(car.id);
      const px = car.prevRenderPos.x + (car.pos.x - car.prevRenderPos.x) * a;
      const py = car.prevRenderPos.y + (car.pos.y - car.prevRenderPos.y) * a;
      const dx = car.prevRenderDir.x + (car.dir.x - car.prevRenderDir.x) * a;
      const dy = car.prevRenderDir.y + (car.dir.y - car.prevRenderDir.y) * a;
      // Eliminated: car is removed from the track. Flash "ELIMINATO" once.
      if (car.eliminated) {
        sprite?.setVisible(false);
        if (!this.eliminatedShown.has(car.id)) {
          this.eliminatedShown.add(car.id);
          this.flashEliminated(px, py, car.color);
        }
        continue;
      }
      const hist = this.trails.get(car.id)!;
      if (this.started) {
        hist.push({ x: px, y: py });
        if (hist.length > TRAIL) hist.shift();
      }

      // Neon trail (fading), in the car's color.
      for (let i = 1; i < hist.length; i++) {
        g.lineStyle(7, car.color, (i / hist.length) * 0.45);
        g.beginPath();
        g.moveTo(hist[i - 1].x, hist[i - 1].y);
        g.lineTo(hist[i].x, hist[i].y);
        g.strokePath();
      }

      // Slide / off-track spark ring under the car.
      if (car.sliding || car.offTrack) {
        g.fillStyle(car.offTrack ? COLORS.accent : 0xffffff, 0.4);
        g.fillCircle(px, py, CAR_SPRITE_LEN * 0.5 + 4);
      }

      // Car sprite: follow position, rotate to heading (sprite art faces up).
      if (sprite) {
        sprite.setVisible(true);
        sprite.setPosition(px, py);
        sprite.setRotation(Math.atan2(dy, dx) + Math.PI / 2);
      }
    }
  }

  /** One-shot "ELIMINATO" burst where a car left the race. */
  private flashEliminated(x: number, y: number, color: number): void {
    const burst = this.add.circle(x, y, CAR_SPRITE_LEN * 0.5, color, 0.9).setDepth(80);
    this.tweens.add({ targets: burst, scale: 2.4, alpha: 0, duration: 450, onComplete: () => burst.destroy() });
    const label = this.add
      .text(x, y - 24, 'ELIMINATO', bodyStyle(22, COLORS.accent, '700'))
      .setOrigin(0.5)
      .setDepth(81);
    glow(label, COLORS.accent, 1);
    this.tweens.add({ targets: label, y: y - 60, alpha: 0, duration: 1100, onComplete: () => label.destroy() });
  }

  private finish(): void {
    const ranking = this.engine.ranking();
    const results = ranking.map((e) => ({
      label: e.car.label,
      color: e.car.color,
      position: e.position,
      finishTime: e.car.finishTime,
      kind: e.car.kind,
      eliminated: e.car.eliminated,
    }));
    // Only real (non-eliminated) human finishes count toward the best time.
    const humanTimes = this.payload.cars
      .filter((c) => c.kind === 'human' && !c.eliminated)
      .map((c) => c.finishTime);
    const humanBest = humanTimes.length ? Math.min(...humanTimes) : 0;

    this.time.delayedCall(600, () => {
      this.scene.start('Result', {
        results,
        trackId: this.payload.trackId,
        humanBest,
        config: this.payload.config,
        totalLaps: LAPS,
      });
    });
  }
}
