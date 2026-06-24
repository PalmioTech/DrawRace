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
    // Soften globally for the premium (non-neon) look.
    obj.postFX?.addGlow(color, outer * 0.55, inner);
  } catch {
    /* canvas renderer — skip */
  }
  return obj;
}

/** A display-font text style (headings). */
export function displayStyle(
  size: number,
  color: number = COLORS.textPrimary,
  weight: string = '700',
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
  weight: string = '500',
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

  // Deep vertical gradient.
  const grad = scene.add.graphics().setDepth(-100);
  grad.fillGradientStyle(COLORS.bgTop, COLORS.bgTop, COLORS.bgBottom, COLORS.bgBottom, 1);
  grad.fillRect(0, 0, W, H);

  // Soft blue ambience near the top (premium depth, not a neon blob).
  const halo = scene.add.circle(W * 0.5, -40, 360, COLORS.accent, 0.06).setDepth(-99);
  glow(halo, COLORS.accent, 1.4, 0);

  // Very faint fine grid.
  const grid = scene.add.graphics().setDepth(-98);
  grid.lineStyle(1, COLORS.grid, 0.5);
  const step = 80;
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

  // Thin accent hairlines top + bottom (GT-style separators).
  const lines = scene.add.graphics().setDepth(-97);
  lines.lineStyle(1.5, COLORS.accent, 0.5);
  lines.beginPath();
  lines.moveTo(0, 3);
  lines.lineTo(W, 3);
  lines.moveTo(0, H - 3);
  lines.lineTo(W, H - 3);
  lines.strokePath();

  // Subtle vignette (dark top/bottom edges).
  const vig = scene.add.graphics().setDepth(-96);
  vig.fillStyle(0x000000, 0.3);
  vig.fillRect(0, 0, W, 60);
  vig.fillRect(0, H - 60, W, 60);
}
