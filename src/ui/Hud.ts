/**
 * In-race HUD: elapsed time, leader lap counter and the live ranking list.
 * Kept deliberately minimal (neon text) per the design.
 */
import Phaser from 'phaser';
import type { RaceEngine } from '../core/RaceEngine';
import { COLORS, DESIGN, LAPS } from '../config/constants';
import { glow, hex, displayStyle, bodyStyle } from './theme';

export class Hud {
  private timeText: Phaser.GameObjects.Text;
  private lapText: Phaser.GameObjects.Text;
  private rankTexts: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene, carCount: number) {
    // Ranking panel (top-left).
    const panel = scene.add.graphics().setDepth(99);
    panel.fillStyle(COLORS.panel, 0.6);
    panel.fillRoundedRect(14, 120, 240, 24 + carCount * 30, 12);
    panel.lineStyle(1.5, COLORS.panelBorder, 0.7);
    panel.strokeRoundedRect(14, 120, 240, 24 + carCount * 30, 12);

    this.timeText = scene.add
      .text(DESIGN.width / 2, 24, '0.00', displayStyle(44, COLORS.textPrimary, '700'))
      .setOrigin(0.5, 0)
      .setDepth(100);
    glow(this.timeText, COLORS.trackBorder, 0.8);

    this.lapText = scene.add
      .text(DESIGN.width / 2, 78, `LAP 1/${LAPS}`, bodyStyle(22, COLORS.textDim, '700'))
      .setOrigin(0.5, 0)
      .setDepth(100);
    this.lapText.setLetterSpacing?.(2);

    for (let i = 0; i < carCount; i++) {
      this.rankTexts.push(
        scene.add.text(30, 134 + i * 30, '', bodyStyle(20, COLORS.textPrimary, '600')).setDepth(100),
      );
    }
  }

  update(engine: RaceEngine): void {
    this.timeText.setText(engine.time.toFixed(2));

    const ranking = engine.ranking();
    const leader = ranking[0]?.car;
    if (leader) this.lapText.setText(`LAP ${leader.displayLap(LAPS)}/${LAPS}`);

    ranking.forEach((entry, i) => {
      const t = this.rankTexts[i];
      if (!t) return;
      const c = entry.car;
      const status = c.eliminated
        ? 'eliminato'
        : c.finished
          ? c.finishTime.toFixed(2) + 's'
          : `lap ${c.displayLap(LAPS)}`;
      t.setText(`${entry.position}. ${c.label}  ${status}`);
      t.setColor(c.eliminated ? hex(COLORS.accent) : hex(c.color));
    });
  }
}
