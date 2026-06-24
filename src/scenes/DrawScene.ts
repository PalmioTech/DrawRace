/**
 * Draw phase. Each human racer, in turn, traces LAPS laps with their finger.
 * The stroke is recorded with timestamps (finger speed = throttle), validated
 * (must complete the laps), and turned into a Trajectory. AI opponents get their
 * trajectory generated. When all racers are ready, the race starts.
 */
import Phaser from 'phaser';
import { COLORS, DESIGN, LAPS, PATH_SPACING, DRAW, CAR_LABELS } from '../config/constants';
import type { RaceBuild, Trajectory } from '../core/types';
import { Track } from '../core/Track';
import { NEON_LOOP } from '../data/tracks';
import { PathRecorder } from '../core/PathRecorder';
import { buildHumanTrajectory } from '../core/SpeedProfile';
import { buildAITrajectory } from '../core/AIDriver';
import { resolveStats, aiLoadout } from '../core/CarStats';
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
  /** Shared build state (one human draws per invocation). */
  private build!: RaceBuild;
  private track!: Track;
  private recorder!: PathRecorder;

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

  init(): void {
    this.build = this.registry.get('raceBuild') as RaceBuild;
  }

  create(): void {
    this.track = new Track(NEON_LOOP);
    this.recorder = new PathRecorder(this.track);

    this.trackG = this.add.graphics();
    drawTrack(this.trackG, this.track);
    this.lineG = this.add.graphics().setDepth(10);

    // Start marker: a pulsing dot at the start line so it's clear where the
    // car begins and where to start drawing.
    const sp = this.track.startPos;
    const dot = this.add.circle(sp.x, sp.y, 11, COLORS.accent).setDepth(40);
    const ring = this.add.circle(sp.x, sp.y, 11).setStrokeStyle(3, COLORS.accent, 0.9).setDepth(40);
    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 1100,
      repeat: -1,
      ease: 'Sine.Out',
    });
    void dot;

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
    const label = CAR_LABELS[this.build.currentHuman] ?? `P${this.build.currentHuman + 1}`;
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
    const last = this.build.currentHuman === this.build.humanCount - 1;
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
    const done = this.recorder.add(p.worldX, p.worldY, p.event?.timeStamp ?? performance.now());
    this.redrawPreview();
    this.hint.setText(`lap ${Math.min(LAPS, this.recorder.lapsCompleted())}/${LAPS}`);
    // 3rd lap just closed → stop drawing automatically; no more input accepted.
    if (done) this.onUp();
  }

  private onUp(): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.validateStroke();
  }

  /**
   * Draw the in-progress stroke as a fading "comet": only the most recent
   * segments are visible, older ones fade out. Keeps the 3 overlapping laps
   * from turning into an unreadable tangle. Color encodes finger speed.
   */
  private redrawPreview(): void {
    const raw = this.recorder.getRaw();
    this.lineG.clear();
    const n = raw.length;
    for (let i = 1; i < n; i++) {
      const age = n - 1 - i; // 0 = newest
      const fade = 1 - age / DRAW.fadeSegments;
      if (fade <= 0) continue; // older than the visible window
      const a = raw[i - 1];
      const b = raw[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const dt = Math.max(1, b.t - a.t);
      const speed = (d / dt) * 1000; // px/s
      const t = Phaser.Math.Clamp((speed - 150) / 1100, 0, 1);
      const col = lerpColor(COLORS.drawSlow, COLORS.drawFast, t);
      this.lineG.lineStyle(7, Phaser.Display.Color.GetColor(col.r, col.g, col.b), 0.95 * fade);
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
    // Valid: build the trajectory (clamped to this player's car) and review.
    const stats = resolveStats(this.build.humanLoadouts[this.build.currentHuman]);
    this.pendingTraj = buildHumanTrajectory(this.recorder.getRaw(), PATH_SPACING, stats);
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
    const b = this.build;
    b.humanTrajectories[b.currentHuman] = this.pendingTraj;
    b.currentHuman++;
    this.registry.set('raceBuild', b);
    this.cleanupInput();
    if (b.currentHuman < b.humanCount) {
      this.scene.start('Setup'); // next human sets up, then draws
    } else {
      this.startRace();
    }
  }

  // --- Build race ----------------------------------------------------------

  private startRace(): void {
    const b = this.build;
    const cars: Car[] = [];
    const aiCount = b.config.carCount - b.humanCount;
    let colorIdx = 0;

    // Human cars — each with its own setup-derived stats.
    b.humanTrajectories.forEach((traj, i) => {
      const color = COLORS.cars[colorIdx % COLORS.cars.length];
      const stats = resolveStats(b.humanLoadouts[i]);
      cars.push(new Car(colorIdx, 'human', CAR_LABELS[i] ?? `P${i + 1}`, color, traj, this.track, stats));
      colorIdx++;
    });

    // AI cars — auto loadout by difficulty, trajectory uses those stats.
    for (let k = 0; k < aiCount; k++) {
      const seed = 1000 + k * 7 + colorIdx;
      const stats = resolveStats(aiLoadout(b.config.difficulty, seed));
      const traj = buildAITrajectory(this.track, b.config.difficulty, seed, stats);
      const color = COLORS.cars[colorIdx % COLORS.cars.length];
      cars.push(new Car(colorIdx, 'ai', `CPU${k + 1}`, color, traj, this.track, stats));
      colorIdx++;
    }

    this.scene.start('Race', { track: this.track, cars, config: b.config, trackId: NEON_LOOP.id });
  }

  private cleanupInput(): void {
    this.input.off('pointerdown', this.onDown, this);
    this.input.off('pointermove', this.onMove, this);
    this.input.off('pointerup', this.onUp, this);
  }
}
