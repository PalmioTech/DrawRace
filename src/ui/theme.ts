/**
 * Shared UI helpers: neon glow (WebGL postFX), animated background, font styles.
 * Keeps the look consistent and removes per-scene boilerplate.
 */
import Phaser from 'phaser';
import { COLORS, DESIGN, FONT } from '../config/constants';

export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

type GlowTarget = Phaser.GameObjects.GameObject & {
  postFX?: Phaser.GameObjects.Components.FX;
};

/**
 * Apply a neon glow to a game object (no-op on Canvas fallback where postFX is
 * unavailable). Returns the object for chaining.
 */
export function glow<T extends GlowTarget>(obj: T, color: number, outer = 1.2, inner = 0): T {
  try {
    obj.postFX?.addGlow(color, outer, inner);
  } catch {
    /* canvas renderer — skip */
  }
  return obj;
}

/** A display-font text style (headings). */
export function displayStyle(
  size: number,
  color: number = COLORS.textPrimary,
  weight: '600' | '700' | '900' = '900',
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT.display,
    fontSize: `${size}px`,
    color: hex(color),
    fontStyle: weight,
  };
}

/** A body-font text style (UI labels). */
export function bodyStyle(
  size: number,
  color: number = COLORS.textPrimary,
  weight: '500' | '600' | '700' = '600',
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT.body,
    fontSize: `${size}px`,
    color: hex(color),
    fontStyle: weight,
  };
}

/**
 * Draw a neon background: vertical gradient, faint grid, and two slow-drifting
 * glow blobs. Call once per scene (in create). Returns the container so callers
 * can ignore it.
 */
export function addBackground(scene: Phaser.Scene): void {
  const { width: W, height: H } = DESIGN;

  // Vertical gradient fill.
  const grad = scene.add.graphics().setDepth(-100);
  grad.fillGradientStyle(COLORS.bgTop, COLORS.bgTop, COLORS.bgBottom, COLORS.bgBottom, 1);
  grad.fillRect(0, 0, W, H);

  // Faint grid.
  const grid = scene.add.graphics().setDepth(-99);
  grid.lineStyle(1, COLORS.grid, 0.35);
  const step = 64;
  for (let x = 0; x <= W; x += step) {
    grid.beginPath();
    grid.moveTo(x, 0);
    grid.lineTo(x, H);
    grid.strokePath();
  }
  for (let y = 0; y <= H; y += step) {
    grid.beginPath();
    grid.moveTo(0, y);
    grid.lineTo(W, y);
    grid.strokePath();
  }

  // Drifting glow blobs for ambient depth.
  const blob = (x: number, y: number, color: number) => {
    const c = scene.add.circle(x, y, 220, color, 0.1).setDepth(-98);
    glow(c, color, 2, 0);
    scene.tweens.add({
      targets: c,
      x: x + (x < W / 2 ? 80 : -80),
      y: y + 60,
      duration: 6000 + Math.abs(x - y) * 4,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  };
  blob(W * 0.2, H * 0.25, COLORS.trackBorder);
  blob(W * 0.82, H * 0.7, COLORS.accent);

  // Subtle vignette (dark edges).
  const vig = scene.add.graphics().setDepth(-97);
  vig.fillStyle(0x000000, 0.35);
  vig.fillRect(0, 0, W, 70);
  vig.fillRect(0, H - 70, W, 70);
}
