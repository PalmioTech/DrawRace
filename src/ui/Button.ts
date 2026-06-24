/**
 * Large, touch-friendly neon button built from a rounded rect + label.
 * Returns a container with a `setSelected` helper for toggle groups.
 */
import Phaser from 'phaser';
import { COLORS } from '../config/constants';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export interface Button extends Phaser.GameObjects.Container {
  setSelected(on: boolean): void;
}

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  accent: number = COLORS.trackBorder,
): Button {
  const g = scene.add.graphics();
  const text = scene.add
    .text(0, 0, label, {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: hex(COLORS.textPrimary),
    })
    .setOrigin(0.5);

  const container = scene.add.container(x, y, [g, text]) as Button;
  container.setSize(w, h);

  let selected = false;
  const redraw = (pressed: boolean) => {
    g.clear();
    g.fillStyle(selected ? accent : COLORS.trackFill, selected ? 0.9 : 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    g.lineStyle(3, accent, pressed ? 1 : 0.8);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    text.setColor(selected ? hex(COLORS.bg) : hex(COLORS.textPrimary));
  };
  redraw(false);

  container.setInteractive(
    new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
    Phaser.Geom.Rectangle.Contains,
  );
  container.on('pointerdown', () => redraw(true));
  container.on('pointerup', () => {
    redraw(false);
    onClick();
  });
  container.on('pointerout', () => redraw(false));

  container.setSelected = (on: boolean) => {
    selected = on;
    redraw(false);
  };

  return container;
}
