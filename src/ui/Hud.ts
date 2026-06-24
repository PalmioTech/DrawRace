/**
 * In-race HUD: elapsed time, leader lap counter and the live ranking list.
 * Kept deliberately minimal (neon text) per the design.
 */
import Phaser from 'phaser';
import type { RaceEngine } from '../core/RaceEngine';
import { COLORS, DESIGN, LAPS } from '../config/constants';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class Hud {
  private timeText: Phaser.GameObjects.Text;
  private lapText: Phaser.GameObjects.Text;
  private rankTexts: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene, carCount: number) {
    this.timeText = scene.add
      .text(DESIGN.width / 2, 30, '0.00', {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: hex(COLORS.textPrimary),
      })
      .setOrigin(0.5, 0)
      .setDepth(100);

    this.lapText = scene.add
      .text(DESIGN.width / 2, 80, `LAP 1/${LAPS}`, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: hex(COLORS.textDim),
      })
      .setOrigin(0.5, 0)
      .setDepth(100);

    for (let i = 0; i < carCount; i++) {
      this.rankTexts.push(
        scene.add
          .text(18, 130 + i * 30, '', {
            fontFamily: 'monospace',
            fontSize: '22px',
            color: hex(COLORS.textPrimary),
          })
          .setDepth(100),
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
      const status = c.finished ? c.finishTime.toFixed(2) + 's' : `lap ${c.displayLap(LAPS)}`;
      t.setText(`${entry.position}. ${c.label}  ${status}`);
      t.setColor(hex(c.color));
    });
  }
}
