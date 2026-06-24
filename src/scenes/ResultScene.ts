/**
 * Result screen: final ranking, total times, best-time save + NEW RECORD flag.
 * Offers replay (same config) or back to the menu.
 */
import Phaser from 'phaser';
import { COLORS, DESIGN } from '../config/constants';
import type { RaceConfig, RacerKind } from '../core/types';
import { makeButton } from '../ui/Button';
import { save } from '../data/SaveManager';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

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
    const { results, humanBest, trackId } = this.payload;

    const newRecord = humanBest > 0 ? save.recordTime(trackId, humanBest) : false;
    const playerWon = results.find((r) => r.kind === 'human')?.position === 1;

    this.add
      .text(cx, 120, playerWon ? 'YOU WIN' : 'FINISH', {
        fontFamily: 'monospace',
        fontSize: '52px',
        color: hex(playerWon ? COLORS.trackBorder : COLORS.textPrimary),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    if (newRecord) {
      this.add
        .text(cx, 175, '★ NEW RECORD ★', {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: hex(COLORS.accent),
        })
        .setOrigin(0.5);
    }

    // Ranking table.
    results.forEach((r, i) => {
      const y = 260 + i * 60;
      this.add
        .text(cx - 200, y, `${r.position}.  ${r.label}`, {
          fontFamily: 'monospace',
          fontSize: '30px',
          color: hex(r.color),
        })
        .setOrigin(0, 0.5);
      this.add
        .text(cx + 200, y, r.eliminated ? 'ELIMINATO' : `${r.finishTime.toFixed(2)}s`, {
          fontFamily: 'monospace',
          fontSize: r.eliminated ? '22px' : '30px',
          color: hex(r.eliminated ? COLORS.accent : COLORS.textPrimary),
        })
        .setOrigin(1, 0.5);
    });

    const best = save.getBestTime(trackId);
    if (best) {
      this.add
        .text(cx, 260 + results.length * 60 + 30, `track best: ${best.toFixed(2)}s`, {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: hex(COLORS.textDim),
        })
        .setOrigin(0.5);
    }

    makeButton(this, cx - 110, DESIGN.height - 120, 200, 90, 'RACE AGAIN', () =>
      this.scene.start('Draw', { config: this.payload.config }),
    );
    makeButton(
      this,
      cx + 110,
      DESIGN.height - 120,
      200,
      90,
      'MENU',
      () => this.scene.start('Menu'),
      COLORS.accent,
    );
  }
}
