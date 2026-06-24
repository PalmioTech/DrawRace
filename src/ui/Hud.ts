/**
 * Race sidebar (left): big race timer, lap counter and the live standings —
 * position, car color, label and status (current lap / finish time / eliminato),
 * re-sorted every frame.
 */
import Phaser from 'phaser';
import type { RaceEngine } from '../core/RaceEngine';
import { COLORS, DESIGN, LAPS, SIDEBAR_W } from '../config/constants';
import { glow, hex, displayStyle, bodyStyle } from './theme';

interface Row {
  bg: Phaser.GameObjects.Graphics;
  dot: Phaser.GameObjects.Arc;
  pos: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
}

const PAD = 16;
const ROW_TOP = 250;
const ROW_H = 64;

export class Hud {
  private timeText: Phaser.GameObjects.Text;
  private lapText: Phaser.GameObjects.Text;
  private rows: Row[] = [];

  constructor(scene: Phaser.Scene, carCount: number) {
    const w = SIDEBAR_W;

    // Sidebar panel.
    const panel = scene.add.graphics().setDepth(98);
    panel.fillStyle(COLORS.panel, 0.82);
    panel.fillRect(0, 0, w, DESIGN.height);
    panel.lineStyle(2, COLORS.panelBorder, 0.9);
    panel.beginPath();
    panel.moveTo(w, 0);
    panel.lineTo(w, DESIGN.height);
    panel.strokePath();

    const cx = w / 2;
    scene.add
      .text(cx, 28, 'TEMPO', bodyStyle(16, COLORS.textDim, '700'))
      .setOrigin(0.5, 0)
      .setDepth(100)
      .setLetterSpacing?.(4);

    this.timeText = scene.add
      .text(cx, 50, '0.00', displayStyle(52, COLORS.textPrimary, '700'))
      .setOrigin(0.5, 0)
      .setDepth(100);
    glow(this.timeText, COLORS.trackBorder, 0.8);

    this.lapText = scene.add
      .text(cx, 120, `GIRO 1/${LAPS}`, bodyStyle(22, COLORS.trackBorder, '700'))
      .setOrigin(0.5, 0)
      .setDepth(100);
    this.lapText.setLetterSpacing?.(2);

    scene.add
      .text(PAD, ROW_TOP - 38, 'CLASSIFICA', bodyStyle(18, COLORS.textDim, '700'))
      .setOrigin(0, 0.5)
      .setDepth(100)
      .setLetterSpacing?.(3);

    for (let i = 0; i < carCount; i++) {
      const y = ROW_TOP + i * ROW_H;
      const bg = scene.add.graphics().setDepth(99);
      bg.fillStyle(COLORS.bgBottom, 0.5);
      bg.fillRoundedRect(PAD - 6, y - ROW_H / 2 + 6, w - 2 * PAD + 12, ROW_H - 12, 10);
      const dot = scene.add.circle(PAD + 14, y, 9, 0xffffff).setDepth(100);
      const pos = scene.add
        .text(PAD + 34, y, '', displayStyle(24, COLORS.textPrimary, '700'))
        .setOrigin(0, 0.5)
        .setDepth(100);
      const label = scene.add
        .text(PAD + 70, y, '', bodyStyle(24, COLORS.textPrimary, '700'))
        .setOrigin(0, 0.5)
        .setDepth(100);
      const status = scene.add
        .text(w - PAD, y, '', bodyStyle(20, COLORS.textDim, '600'))
        .setOrigin(1, 0.5)
        .setDepth(100);
      this.rows.push({ bg, dot, pos, label, status });
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
        ? 'ELIMINATO'
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
