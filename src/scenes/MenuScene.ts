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
import { NEON_LOOP } from '../data/tracks';

export class MenuScene extends Phaser.Scene {
  private mode: GameMode = 'ai';
  private carCount = 2;
  private difficulty: Difficulty = save.settings.difficulty;

  private modeButtons: Button[] = [];
  private countButtons: Button[] = [];
  private diffButtons: Button[] = [];
  private diffLabel?: Phaser.GameObjects.Text;

  constructor() {
    super('Menu');
  }

  create(): void {
    const cx = DESIGN.width / 2;
    addBackground(this);

    const title = this.add
      .text(cx, 58, 'PROJECT RACING', displayStyle(54, COLORS.trackBorder, '900'))
      .setOrigin(0.5);
    title.setLetterSpacing?.(6);
    glow(title, COLORS.trackBorder, 1.4);

    this.add
      .text(cx, 104, 'DRAW YOUR LINE · RACE IT', bodyStyle(20, COLORS.textDim, '600'))
      .setOrigin(0.5)
      .setLetterSpacing?.(4);

    const best = save.getBestTime(NEON_LOOP.id);
    const bestText = this.add
      .text(cx, 138, best ? `BEST ${best.toFixed(2)}s` : 'NO RECORD YET', bodyStyle(18, COLORS.accent, '700'))
      .setOrigin(0.5);
    bestText.setLetterSpacing?.(2);

    // --- Mode ---------------------------------------------------------------
    this.section(cx, 180, 'MODE');
    this.modeButtons = [
      makeButton(this, cx - 165, 228, 300, 66, 'vs COMPUTER', () => this.setMode('ai')),
      makeButton(this, cx + 165, 228, 300, 66, 'HOTSEAT', () => this.setMode('hotseat')),
    ];

    // --- Car count ----------------------------------------------------------
    this.section(cx, 298, 'CARS');
    this.countButtons = [2, 3, 4].map((n, i) =>
      makeButton(this, cx - 200 + i * 200, 344, 170, 66, String(n), () => this.setCount(n)),
    );

    // --- Difficulty (AI only) ----------------------------------------------
    this.diffLabel = this.section(cx, 414, 'AI DIFFICULTY');
    const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
    this.diffButtons = diffs.map((d, i) =>
      makeButton(this, cx - 200 + i * 200, 460, 170, 66, d.toUpperCase(), () => this.setDiff(d)),
    );

    // --- Start --------------------------------------------------------------
    makeButton(this, cx, 580, 380, 86, 'START', () => this.start(), COLORS.accent);

    this.add
      .text(cx, 672, `DRAW ${LAPS} LAPS WITH YOUR FINGER`, bodyStyle(17, COLORS.textDim, '500'))
      .setOrigin(0.5)
      .setLetterSpacing?.(2);

    this.refresh();
  }

  private section(cx: number, y: number, label: string): Phaser.GameObjects.Text {
    const t = this.add.text(cx, y, label, bodyStyle(18, COLORS.textDim, '700')).setOrigin(0.5);
    t.setLetterSpacing?.(4);
    return t;
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

  /** Sync button highlight + show/hide AI difficulty for hotseat. */
  private refresh(): void {
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
    };
    this.registry.set('raceBuild', build);
    this.scene.start('Setup');
  }
}
