/**
 * Renders a Track to a Phaser Graphics object: surface fill, neon borders,
 * dashed centerline and the start/finish line. Shared by the draw + race scenes.
 */
import Phaser from 'phaser';
import type { Track } from '../core/Track';
import { COLORS } from '../config/constants';

export function drawTrack(g: Phaser.GameObjects.Graphics, track: Track): void {
  g.clear();
  const { left, right } = track.borders();

  // --- Surface fill: a band between the two borders -----------------------
  g.fillStyle(COLORS.trackFill, 1);
  g.beginPath();
  g.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) g.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i].x, right[i].y);
  g.closePath();
  g.fillPath();

  // --- Neon borders -------------------------------------------------------
  const border = (poly: { x: number; y: number }[]) => {
    g.lineStyle(5, COLORS.trackBorder, 0.9);
    g.beginPath();
    g.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) g.lineTo(poly[i].x, poly[i].y);
    g.lineTo(poly[0].x, poly[0].y);
    g.strokePath();
  };
  border(left);
  border(right);

  // --- Dashed centerline ---------------------------------------------------
  g.lineStyle(2, COLORS.trackCenterline, 0.5);
  const c = track.center;
  for (let i = 0; i < c.length - 1; i += 4) {
    g.beginPath();
    g.moveTo(c[i].x, c[i].y);
    g.lineTo(c[i + 1].x, c[i + 1].y);
    g.strokePath();
  }

  // --- Start / finish line -------------------------------------------------
  g.lineStyle(6, COLORS.startLine, 1);
  g.beginPath();
  g.moveTo(track.startA.x, track.startA.y);
  g.lineTo(track.startB.x, track.startB.y);
  g.strokePath();
}
