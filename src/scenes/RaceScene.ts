/**
 * Race phase. Runs the fixed-timestep RaceEngine and renders the cars, their
 * neon trails and slide/off-track feedback. No player input during the race —
 * the cars replay their drawn (or AI) trajectories for all LAPS laps.
 */
import Phaser from 'phaser';
import { COLORS, DESIGN, LAPS, CAR } from '../config/constants';
import type { RaceConfig, Vec2 } from '../core/types';
import type { Track } from '../core/Track';
import type { Car } from '../core/CarSim';
import { RaceEngine } from '../core/RaceEngine';
import { drawTrack } from '../ui/TrackView';
import { Hud } from '../ui/Hud';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
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
  private trails = new Map<number, Vec2[]>();
  private started = false;
  private done = false;

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
    this.trails.clear();

    const g = this.add.graphics();
    drawTrack(g, track);

    this.carsG = this.add.graphics().setDepth(20);
    cars.forEach((c) => this.trails.set(c.id, []));

    this.hud = new Hud(this, cars.length);

    // 3-2-1-GO countdown, then release the cars.
    this.countdown();
  }

  private countdown(): void {
    const cx = DESIGN.width / 2;
    const cy = DESIGN.height / 2;
    const label = this.add
      .text(cx, cy, '3', {
        fontFamily: 'monospace',
        fontSize: '120px',
        color: hex(COLORS.textPrimary),
      })
      .setOrigin(0.5)
      .setDepth(200);

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
    for (const car of this.payload.cars) {
      const hist = this.trails.get(car.id)!;
      if (this.started) {
        hist.push({ ...car.pos });
        if (hist.length > TRAIL) hist.shift();
      }

      // Neon trail (fading).
      for (let i = 1; i < hist.length; i++) {
        g.lineStyle(6, car.color, (i / hist.length) * 0.5);
        g.beginPath();
        g.moveTo(hist[i - 1].x, hist[i - 1].y);
        g.lineTo(hist[i].x, hist[i].y);
        g.strokePath();
      }

      // Slide / off-track spark ring.
      if (car.sliding || car.offTrack) {
        g.fillStyle(car.offTrack ? COLORS.accent : 0xffffff, 0.5);
        g.fillCircle(car.pos.x, car.pos.y, CAR.radius + 6);
      }

      // Car body.
      g.fillStyle(car.color, 1);
      g.fillCircle(car.pos.x, car.pos.y, CAR.radius);
      g.lineStyle(2, 0xffffff, 0.8);
      g.strokeCircle(car.pos.x, car.pos.y, CAR.radius);

      // Heading tick.
      g.lineStyle(3, 0xffffff, 0.9);
      g.beginPath();
      g.moveTo(car.pos.x, car.pos.y);
      g.lineTo(car.pos.x + car.dir.x * CAR.radius, car.pos.y + car.dir.y * CAR.radius);
      g.strokePath();
    }
  }

  private finish(): void {
    const ranking = this.engine.ranking();
    const results = ranking.map((e) => ({
      label: e.car.label,
      color: e.car.color,
      position: e.position,
      finishTime: e.car.finishTime,
      kind: e.car.kind,
    }));
    const humanTimes = this.payload.cars.filter((c) => c.kind === 'human').map((c) => c.finishTime);
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
