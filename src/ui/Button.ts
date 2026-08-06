/**
 * Large, touch-friendly neon button: gradient fill, glowing accent border,
 * display-font label, press + selected states. Returns a container with a
 * `setSelected` helper for toggle groups.
 */
import Phaser from 'phaser';
import { COLORS } from '../config/constants';
import { glow, hex, bodyStyle } from './theme';

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
    .text(0, 0, label, bodyStyle(Math.min(30, h * 0.42), COLORS.textPrimary, '700'))
    .setOrigin(0.5);
  text.setLetterSpacing?.(1);

  const container = scene.add.container(x, y, [g, text]) as Button;
  container.setSize(w, h);
  glow(container, accent, 0.7);

  let selected = false;
  const r = Math.min(18, h * 0.3);
  const redraw = (pressed: boolean) => {
    g.clear();
    if (selected) {
      // Filled accent with a subtle vertical gradient.
      g.fillStyle(accent, 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
      g.fillStyle(0xffffff, 0.12);
      g.fillRoundedRect(-w / 2, -h / 2, w, h / 2, r);
    } else {
      g.fillGradientStyle(COLORS.panel, COLORS.panel, COLORS.bgBottom, COLORS.bgBottom, 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    }
    g.lineStyle(pressed ? 4 : 2.5, accent, selected ? 1 : 0.85);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    text.setColor(selected ? hex(COLORS.bg) : hex(COLORS.textPrimary));
  };
  redraw(false);

  // Generous padded hit area (fat fingers), and fire on pointerDOWN: firing on
  // pointerup drops taps on touch — the press tween shrinks the container (hit
  // area shrinks with it) and the finger always shifts a few px, so the up
  // event often lands outside and the click was lost.
  const pad = 14;
  container.setInteractive(
    new Phaser.Geom.Rectangle(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2),
    Phaser.Geom.Rectangle.Contains,
  );

  const press = (down: boolean) => {
    redraw(down);
    scene.tweens.add({ targets: container, scale: down ? 0.95 : 1, duration: 80, ease: 'Quad.Out' });
  };

  container.on('pointerdown', () => {
    press(true);
    onClick();
  });
  container.on('pointerup', () => press(false));
  container.on('pointerout', () => press(false));

  container.setSelected = (on: boolean) => {
    selected = on;
    redraw(false);
  };

  return container;
}
