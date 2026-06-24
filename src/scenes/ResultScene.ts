/**
 * Result screen: final ranking, total times, best-time save + NEW RECORD flag.
 * Offers replay (same config) or back to the menu.
 */
import Phaser from 'phaser';
import { COLORS, DESIGN } from '../config/constants';
import type { RaceConfig, RacerKind, RaceBuild } from '../core/types';
import { makeButton } from '../ui/Button';
import { addBackground, displayStyle, bodyStyle, glow } from '../ui/theme';
import { save } from '../data/SaveManager';

interface ResultRow {
  label: string;
  color: number;
  position: number;
  finishTime: number;
  kind: RacerKind;
  eliminated: boolean;
}

interface ResultData {
  results: ResultRow[];
  trackId: string;
  humanBest: number;
  config: RaceConfig;
}

export class ResultScene extends Phaser.Scene {
  private payload!: ResultData;

  constructor() {
    super('Result');
  }

  init(data: ResultData): void {
    this.payload = data;
  }

  create(): void {
    const cx = DESIGN.width / 2;
    addBackground(this);
    const { results, humanBest, trackId } = this.payload;

    const newRecord = humanBest > 0 ? save.recordTime(trackId, humanBest) : false;
    const playerWon = results.find((r) => r.kind === 'human')?.position === 1;

    const title = this.add
      .text(cx, 70, playerWon ? 'YOU WIN' : 'FINISH', displayStyle(58, playerWon ? COLORS.trackBorder : COLORS.textPrimary, '900'))
      .setOrigin(0.5);
    title.setLetterSpacing?.(4);
    glow(title, playerWon ? COLORS.trackBorder : COLORS.violet, 1.4);

    if (newRecord) {
      const rec = this.add
        .text(cx, 120, '★ NEW RECORD ★', bodyStyle(24, COLORS.accent, '700'))
        .setOrigin(0.5);
      rec.setLetterSpacing?.(3);
      glow(rec, COLORS.accent, 1);
    }

    // Ranking rows in a panel.
    const rowH = 56;
    const top = 168;
    const panelW = 560;
    const panel = this.add.graphics().setDepth(1);
    panel.fillStyle(COLORS.panel, 0.7);
    panel.fillRoundedRect(cx - panelW / 2, top - 14, panelW, results.length * rowH + 20, 16);
    panel.lineStyle(1.5, COLORS.panelBorder, 0.8);
    panel.strokeRoundedRect(cx - panelW / 2, top - 14, panelW, results.length * rowH + 20, 16);

    results.forEach((r, i) => {
      const y = top + 14 + i * rowH;
      if (i > 0) {
        panel.lineStyle(1, COLORS.panelBorder, 0.4);
        panel.beginPath();
        panel.moveTo(cx - panelW / 2 + 20, y - rowH / 2);
        panel.lineTo(cx + panelW / 2 - 20, y - rowH / 2);
        panel.strokePath();
      }
      this.add
        .text(cx - panelW / 2 + 28, y, `${r.position}`, displayStyle(26, r.color, '700'))
        .setOrigin(0, 0.5);
      this.add
        .text(cx - panelW / 2 + 76, y, r.label, bodyStyle(26, COLORS.textPrimary, '700'))
        .setOrigin(0, 0.5);
      this.add
        .text(
          cx + panelW / 2 - 28,
          y,
          r.eliminated ? 'ELIMINATO' : `${r.finishTime.toFixed(2)}s`,
          bodyStyle(r.eliminated ? 22 : 26, r.eliminated ? COLORS.accent : COLORS.textPrimary, '600'),
        )
        .setOrigin(1, 0.5);
    });

    const best = save.getBestTime(trackId);
    if (best) {
      this.add
        .text(cx, top + results.length * rowH + 26, `TRACK BEST  ${best.toFixed(2)}s`, bodyStyle(18, COLORS.textDim, '600'))
        .setOrigin(0.5)
        .setLetterSpacing?.(2);
    }

    makeButton(this, cx - 130, DESIGN.height - 64, 230, 84, 'RACE AGAIN', () => this.raceAgain());
    makeButton(this, cx + 130, DESIGN.height - 64, 230, 84, 'MENU', () => this.scene.start('Menu'), COLORS.accent);
  }

  /** Replay: reset the shared build and run the setup→draw flow again. */
  private raceAgain(): void {
    const config = this.payload.config;
    const humanCount = config.mode === 'hotseat' ? config.carCount : 1;
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
