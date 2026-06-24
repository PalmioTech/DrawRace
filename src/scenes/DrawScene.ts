/**
 * Draw phase. Each human racer, in turn, traces LAPS laps with their finger.
 * The stroke is recorded with timestamps (finger speed = throttle), validated
 * (must complete the laps), and turned into a Trajectory. AI opponents get their
 * trajectory generated. When all racers are ready, the race starts.
 */
import Phaser from 'phaser';
import { COLORS, DESIGN, LAPS, PATH_SPACING, DRAW, CAR_LABELS } from '../config/constants';
import type { RaceConfig, Trajectory } from '../core/types';
import { Track } from '../core/Track';
import { NEON_LOOP } from '../data/tracks';
import { PathRecorder } from '../core/PathRecorder';
import { buildHumanTrajectory } from '../core/SpeedProfile';
import { buildAITrajectory } from '../core/AIDriver';
import { Car } from '../core/CarSim';
import { drawTrack } from '../ui/TrackView';
import { makeButton, type Button } from '../ui/Button';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const lerpColor = (a: number, b: number, t: number) =>
  Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.IntegerToColor(a),
    Phaser.Display.Color.IntegerToColor(b),
    100,
    Math.round(t * 100),
  );

export class DrawScene extends Phaser.Scene {
  private config!: RaceConfig;
  private track!: Track;
  private recorder!: PathRecorder;

  private humanCount = 1;
  private currentHuman = 0;
  private humanTrajectories: Trajectory[] = [];

  private drawing = false;
  private pendingTraj: Trajectory | null = null;

  private trackG!: Phaser.GameObjects.Graphics;
  private lineG!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private redrawBtn!: Button;
  private nextBtn!: Button;

  constructor() {
    super('Draw');
  }

  init(data: { config: RaceConfig }): void {
    this.config = data.config;
    this.humanCount = data.config.mode === 'hotseat' ? data.config.carCount : 1;
    this.currentHuman = 0;
    this.humanTrajectories = [];
  }

  create(): void {
    this.track = new Track(NEON_LOOP);
    this.recorder = new PathRecorder(this.track);

    this.trackG = this.add.graphics();
    drawTrack(this.trackG, this.track);
    this.lineG = this.add.graphics().setDepth(10);

    this.title = this.add
      .text(DESIGN.width / 2, 28, '', {
        fontFamily: 'monospace',
        fontSize: '30px',
        color: hex(COLORS.textPrimary),
      })
      .setOrigin(0.5, 0)
      .setDepth(50);
    this.hint = this.add
      .text(DESIGN.width / 2, 70, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: hex(COLORS.textDim),
      })
      .setOrigin(0.5, 0)
      .setDepth(50);

    this.redrawBtn = makeButton(this, DESIGN.width / 2 - 110, DESIGN.height - 70, 200, 80, 'REDRAW', () =>
      this.resetStroke(),
    );
    this.nextBtn = makeButton(
      this,
      DESIGN.width / 2 + 110,
      DESIGN.height - 70,
      200,
      80,
      'NEXT',
      () => this.acceptStroke(),
      COLORS.accent,
    );

    // Pointer handlers (mouse + touch).
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);

    this.startTurn();
  }

  // --- Turn flow -----------------------------------------------------------

  private startTurn(): void {
    this.resetStroke();
    const label = CAR_LABELS[this.currentHuman] ?? `P${this.currentHuman + 1}`;
    this.title.setText(`${label} — draw your line`);
  }

  private resetStroke(): void {
    this.recorder.reset();
    this.pendingTraj = null;
    this.drawing = false;
    this.lineG.clear();
    this.setReviewUI(false);
    this.hint.setText(`start at the white line · draw ${LAPS} laps`);
  }

  private setReviewUI(review: boolean): void {
    this.redrawBtn.setVisible(review);
    this.nextBtn.setVisible(review);
    const last = this.currentHuman === this.humanCount - 1;
    this.nextBtn.list; // (container)
    (this.nextBtn.list[1] as Phaser.GameObjects.Text)?.setText(last ? 'RACE' : 'NEXT');
  }

  // --- Drawing -------------------------------------------------------------

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.pendingTraj) return; // in review; ignore taps on the canvas
    this.drawing = true;
    this.recorder.reset();
    this.recorder.add(p.worldX, p.worldY, p.event?.timeStamp ?? performance.now());
    this.lineG.clear();
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.drawing) return;
    this.recorder.add(p.worldX, p.worldY, p.event?.timeStamp ?? performance.now());
    this.redrawPreview();
    this.hint.setText(`lap ${Math.min(LAPS, this.recorder.lapsCompleted())}/${LAPS}`);
  }

  private onUp(): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.validateStroke();
  }

  /** Draw the in-progress stroke, colored by finger speed (feedback). */
  private redrawPreview(): void {
    const raw = this.recorder.getRaw();
    this.lineG.clear();
    for (let i = 1; i < raw.length; i++) {
      const a = raw[i - 1];
      const b = raw[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const dt = Math.max(1, b.t - a.t);
      const speed = (d / dt) * 1000; // px/s
      const t = Phaser.Math.Clamp((speed - 150) / 1100, 0, 1);
      const col = lerpColor(COLORS.drawSlow, COLORS.drawFast, t);
      this.lineG.lineStyle(7, Phaser.Display.Color.GetColor(col.r, col.g, col.b), 0.95);
      this.lineG.beginPath();
      this.lineG.moveTo(a.x, a.y);
      this.lineG.lineTo(b.x, b.y);
      this.lineG.strokePath();
    }
  }

  private validateStroke(): void {
    const laps = this.recorder.lapsCompleted();
    const length = this.recorder.length();
    if (laps < LAPS) {
      this.hint.setText(`need ${LAPS} laps — got ${laps}. tap to redraw`).setColor(hex(COLORS.accent));
      this.lineG.setAlpha(0.35);
      this.flashRedrawOnly();
      return;
    }
    if (length < DRAW.minStrokeLength) {
      this.hint.setText('line too short — tap to redraw').setColor(hex(COLORS.accent));
      this.flashRedrawOnly();
      return;
    }
    // Valid: build the trajectory and enter review.
    this.pendingTraj = buildHumanTrajectory(this.recorder.getRaw(), PATH_SPACING);
    this.hint.setText('looks good!').setColor(hex(COLORS.trackBorder));
    this.lineG.setAlpha(1);
    this.setReviewUI(true);
  }

  /** Invalid stroke: offer redraw only (tap canvas or button to retry). */
  private flashRedrawOnly(): void {
    this.pendingTraj = null;
    this.redrawBtn.setVisible(true);
    this.nextBtn.setVisible(false);
  }

  private acceptStroke(): void {
    if (!this.pendingTraj) return;
    this.humanTrajectories.push(this.pendingTraj);
    this.currentHuman++;
    if (this.currentHuman < this.humanCount) {
      this.startTurn();
    } else {
      this.startRace();
    }
  }

  // --- Build race ----------------------------------------------------------

  private startRace(): void {
    const cars: Car[] = [];
    const aiCount = this.config.carCount - this.humanCount;
    let colorIdx = 0;

    // Human cars.
    this.humanTrajectories.forEach((traj, i) => {
      const color = COLORS.cars[colorIdx % COLORS.cars.length];
      cars.push(new Car(colorIdx, 'human', CAR_LABELS[i] ?? `P${i + 1}`, color, traj, this.track));
      colorIdx++;
    });

    // AI cars.
    for (let k = 0; k < aiCount; k++) {
      const traj = buildAITrajectory(this.track, this.config.difficulty, 1000 + k * 7 + colorIdx);
      const color = COLORS.cars[colorIdx % COLORS.cars.length];
      cars.push(new Car(colorIdx, 'ai', `CPU${k + 1}`, color, traj, this.track));
      colorIdx++;
    }

    this.cleanupInput();
    this.scene.start('Race', { track: this.track, cars, config: this.config, trackId: NEON_LOOP.id });
  }

  private cleanupInput(): void {
    this.input.off('pointerdown', this.onDown, this);
    this.input.off('pointermove', this.onMove, this);
    this.input.off('pointerup', this.onUp, this);
  }
}
