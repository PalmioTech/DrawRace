/**
 * Race HUD overlay (top-left): a prominent circular LAP badge, the race timer,
 * and live standings (position, car color, label, status), re-sorted each frame.
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

const X = 14;
const Y = 12;
const W = SIDEBAR_W;
const ROW_H = 40;

export class Hud {
  private lapNum: Phaser.GameObjects.Text;
  private timeText: Phaser.GameObjects.Text;
  private rows: Row[] = [];

  constructor(scene: Phaser.Scene, carCount: number) {
    const headH = 104;
    const h = headH + 26 + carCount * ROW_H;

    // Panel.
    const panel = scene.add.graphics().setDepth(98);
    panel.fillStyle(COLORS.bg, 0.66);
    panel.fillRoundedRect(X, Y, W, h, 16);
    panel.lineStyle(2, COLORS.panelBorder, 0.85);
    panel.strokeRoundedRect(X, Y, W, h, 16);

    // --- Prominent circular LAP badge (top-left) ---
    const bx = X + 50;
    const by = Y + 52;
    const badge = scene.add.graphics().setDepth(99);
    badge.fillStyle(0x10182c, 1);
    badge.fillCircle(bx, by, 38);
    badge.lineStyle(4, COLORS.accent, 1);
    badge.strokeCircle(bx, by, 38);
    glow(badge, COLORS.accent, 0.6);
    scene.add
      .text(bx, by - 18, 'GIRO', bodyStyle(13, COLORS.textMid, '700'))
      .setOrigin(0.5)
      .setDepth(100)
      .setLetterSpacing?.(2);
    this.lapNum = scene.add
      .text(bx, by + 7, `1/${LAPS}`, displayStyle(30, COLORS.textPrimary, '800'))
      .setOrigin(0.5)
      .setDepth(100);

    // --- Timer (right of the badge) ---
    scene.add
      .text(X + 104, Y + 22, 'TEMPO', bodyStyle(14, COLORS.textMid, '700'))
      .setDepth(100)
      .setLetterSpacing?.(3);
    this.timeText = scene.add
      .text(X + 102, Y + 36, '0.00', displayStyle(40, COLORS.textPrimary, '700'))
      .setDepth(100);
    glow(this.timeText, COLORS.trackBorder, 0.6);

    // --- Standings ---
    const listTop = Y + headH + 6;
    scene.add
      .text(X + 16, listTop, 'CLASSIFICA', bodyStyle(14, COLORS.textMid, '700'))
      .setOrigin(0, 0.5)
      .setDepth(100)
      .setLetterSpacing?.(3);

    for (let i = 0; i < carCount; i++) {
      const y = listTop + 26 + i * ROW_H;
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
    if (leader) this.lapNum.setText(`${leader.displayLap(LAPS)}/${LAPS}`);

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
