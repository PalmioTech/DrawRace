/**
 * Race HUD: a compact, semi-transparent overlay (top-left) floating over the
 * full-screen track — race timer, lap counter and live standings (position,
 * car color, label, status), re-sorted every frame.
 */
import Phaser from 'phaser';
import type { RaceEngine } from '../core/RaceEngine';
import { COLORS, LAPS, SIDEBAR_W } from '../config/constants';
import { glow, hex, displayStyle, bodyStyle } from './theme';

interface Row {
  dot: Phaser.GameObjects.Arc;
  pos: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
}

const X = 16;
const Y = 14;
const W = SIDEBAR_W;
const ROW_H = 40;

export class Hud {
  private timeText: Phaser.GameObjects.Text;
  private lapText: Phaser.GameObjects.Text;
  private rows: Row[] = [];

  constructor(scene: Phaser.Scene, carCount: number) {
    const headH = 78;
    const h = headH + 30 + carCount * ROW_H;

    // Semi-transparent floating panel.
    const panel = scene.add.graphics().setDepth(98);
    panel.fillStyle(COLORS.bg, 0.62);
    panel.fillRoundedRect(X, Y, W, h, 16);
    panel.lineStyle(2, COLORS.panelBorder, 0.85);
    panel.strokeRoundedRect(X, Y, W, h, 16);

    scene.add
      .text(X + 18, Y + 14, 'TEMPO', bodyStyle(15, COLORS.textDim, '700'))
      .setDepth(100)
      .setLetterSpacing?.(3);
    this.timeText = scene.add
      .text(X + 16, Y + 26, '0.00', displayStyle(40, COLORS.textPrimary, '700'))
      .setDepth(100);
    glow(this.timeText, COLORS.trackBorder, 0.7);

    this.lapText = scene.add
      .text(X + W - 18, Y + 40, `GIRO 1/${LAPS}`, bodyStyle(20, COLORS.trackBorder, '700'))
      .setOrigin(1, 0.5)
      .setDepth(100);
    this.lapText.setLetterSpacing?.(1);

    const listTop = Y + headH + 8;
    scene.add
      .text(X + 18, listTop, 'CLASSIFICA', bodyStyle(14, COLORS.textDim, '700'))
      .setDepth(100)
      .setLetterSpacing?.(3);

    for (let i = 0; i < carCount; i++) {
      const y = listTop + 28 + i * ROW_H;
      const dot = scene.add.circle(X + 22, y, 8, 0xffffff).setDepth(100);
      const pos = scene.add
        .text(X + 40, y, '', displayStyle(20, COLORS.textPrimary, '700'))
        .setOrigin(0, 0.5)
        .setDepth(100);
      const label = scene.add
        .text(X + 70, y, '', bodyStyle(21, COLORS.textPrimary, '700'))
        .setOrigin(0, 0.5)
        .setDepth(100);
      const status = scene.add
        .text(X + W - 16, y, '', bodyStyle(18, COLORS.textDim, '600'))
        .setOrigin(1, 0.5)
        .setDepth(100);
      this.rows.push({ dot, pos, label, status });
    }
  }

  update(engine: RaceEngine): void {
    this.timeText.setText(engine.time.toFixed(2));

    const ranking = engine.ranking();
    const leader = ranking[0]?.car;
    if (leader) this.lapText.setText(`GIRO ${leader.displayLap(LAPS)}/${LAPS}`);

    ranking.forEach((entry, i) => {
      const row = this.rows[i];
      if (!row) return;
      const c = entry.car;
      const status = c.eliminated
        ? 'OUT'
        : c.finished
          ? c.finishTime.toFixed(2) + 's'
          : `giro ${c.displayLap(LAPS)}`;
      row.pos.setText(`${entry.position}`);
      row.label.setText(c.label);
      row.status.setText(status);
      row.dot.setFillStyle(c.eliminated ? COLORS.textDim : c.color);
      row.pos.setColor(hex(c.eliminated ? COLORS.textDim : c.color));
      row.status.setColor(hex(c.eliminated ? COLORS.accent : COLORS.textDim));
      row.label.setAlpha(c.eliminated ? 0.5 : 1);
    });
  }
}
