/**
 * Menu: pick mode (vs Computer / Hotseat), number of cars (2–4) and — for the
 * vs-Computer mode — AI difficulty. Produces a RaceConfig and starts DrawScene.
 */
import Phaser from 'phaser';
import { COLORS, DESIGN, LAPS } from '../config/constants';
import type { Difficulty, GameMode, RaceConfig, RaceBuild } from '../core/types';
import { makeButton, type Button } from '../ui/Button';
import { addBackground, displayStyle, bodyStyle, glow } from '../ui/theme';
import { save } from '../data/SaveManager';
import { CIRCUITS } from '../data/circuits';

export class MenuScene extends Phaser.Scene {
  private mode: GameMode = 'ai';
  private carCount = 2;
  private difficulty: Difficulty = save.settings.difficulty;
  private trackId = CIRCUITS[0].id;

  private modeButtons: Button[] = [];
  private countButtons: Button[] = [];
  private diffButtons: Button[] = [];
  private trackButtons: Button[] = [];
  private diffLabel?: Phaser.GameObjects.Text;
  private bestText?: Phaser.GameObjects.Text;

  constructor() {
    super('Menu');
  }

  create(): void {
    const cx = DESIGN.width / 2;
    addBackground(this);

    const title = this.add
      .text(cx, 40, 'PROJECT RACING', displayStyle(54, COLORS.trackBorder, '900'))
      .setOrigin(0.5);
    title.setLetterSpacing?.(6);
    glow(title, COLORS.trackBorder, 1.4);

    this.bestText = this.add.text(cx, 92, '', bodyStyle(18, COLORS.accent, '700')).setOrigin(0.5);
    this.bestText.setLetterSpacing?.(2);

    // --- Track ----------------------------------------------------------------
    this.section(cx, 126, 'PISTA');
    this.trackButtons = CIRCUITS.map((c, i) =>
      makeButton(this, cx - 220 + i * 220, 170, 200, 62, c.name, () => this.setTrack(c.id)),
    );

    // --- Mode ---------------------------------------------------------------
    this.section(cx, 238, 'MODE');
    this.modeButtons = [
      makeButton(this, cx - 165, 284, 300, 66, 'vs COMPUTER', () => this.setMode('ai')),
      makeButton(this, cx + 165, 284, 300, 66, 'HOTSEAT', () => this.setMode('hotseat')),
    ];

    // --- Car count ----------------------------------------------------------
    this.section(cx, 350, 'CARS');
    this.countButtons = [2, 3, 4].map((n, i) =>
      makeButton(this, cx - 200 + i * 200, 396, 170, 66, String(n), () => this.setCount(n)),
    );

    // --- Difficulty (AI only) ----------------------------------------------
    this.diffLabel = this.section(cx, 462, 'AI DIFFICULTY');
    const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
    this.diffButtons = diffs.map((d, i) =>
      makeButton(this, cx - 200 + i * 200, 508, 170, 66, d.toUpperCase(), () => this.setDiff(d)),
    );

    // --- Start --------------------------------------------------------------
    makeButton(this, cx, 592, 380, 86, 'START', () => this.start(), COLORS.accent);

    // Settings gear, top-right corner.
    makeButton(this, DESIGN.width - 60, 56, 64, 64, '⚙', () => this.scene.start('Settings'), COLORS.panelBorder);

    this.add
      .text(cx, 668, `DRAW ${LAPS} LAPS WITH YOUR FINGER`, bodyStyle(17, COLORS.textDim, '500'))
      .setOrigin(0.5)
      .setLetterSpacing?.(2);

    this.refresh();
  }

  private section(cx: number, y: number, label: string): Phaser.GameObjects.Text {
    const t = this.add.text(cx, y, label, bodyStyle(18, COLORS.textDim, '700')).setOrigin(0.5);
    t.setLetterSpacing?.(4);
    return t;
  }

  private setTrack(id: string): void {
    this.trackId = id;
    this.refresh();
  }
  private setMode(m: GameMode): void {
    this.mode = m;
    this.refresh();
  }
  private setCount(n: number): void {
    this.carCount = n;
    this.refresh();
  }
  private setDiff(d: Difficulty): void {
    this.difficulty = d;
    save.setDifficulty(d);
    this.refresh();
  }

  /** Sync button highlight + best-time label + show/hide AI difficulty for hotseat. */
  private refresh(): void {
    this.trackButtons.forEach((b, i) => b.setSelected(CIRCUITS[i].id === this.trackId));
    const best = save.getBestTime(this.trackId);
    this.bestText?.setText(best ? `BEST ${best.toFixed(2)}s` : 'NO RECORD YET');
    this.modeButtons[0].setSelected(this.mode === 'ai');
    this.modeButtons[1].setSelected(this.mode === 'hotseat');
    this.countButtons.forEach((b, i) => b.setSelected([2, 3, 4][i] === this.carCount));
    const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
    this.diffButtons.forEach((b, i) => {
      b.setSelected(diffs[i] === this.difficulty);
      b.setVisible(this.mode === 'ai');
    });
    this.diffLabel?.setVisible(this.mode === 'ai');
  }

  private start(): void {
    const config: RaceConfig = {
      mode: this.mode,
      carCount: this.carCount,
      difficulty: this.difficulty,
    };
    const humanCount = config.mode === 'hotseat' ? config.carCount : 1;
    // Seed the shared build; Setup ↔ Draw fill it in, one human at a time.
    const build: RaceBuild = {
      config,
      humanCount,
      humanLoadouts: [],
      humanTrajectories: [],
      currentHuman: 0,
      trackId: this.trackId,
    };
    this.registry.set('raceBuild', build);
    this.scene.start('Setup');
  }
}
