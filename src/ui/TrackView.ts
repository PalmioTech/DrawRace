/**
 * Renders the track scene in a top-down RALLY style using the Kenney Racing
 * Pack textures (CC0): tiled grass ground, a dirt road that follows the spline
 * (dirt tile clipped by a geometry mask), scattered trees + rocks, and a
 * checkered start/finish line. All layers are static, drawn once per scene.
 *
 * Layer depths: grass (-50) < road rim (-42) < road (-40) < finish (-39)
 * < scenery (-30) < (drawn line 10, cars 25).
 */
import Phaser from 'phaser';
import type { Track } from '../core/Track';
import { DESIGN } from '../config/constants';

/** Dark worn edge around the dirt road. */
const DIRT_EDGE = 0x53401f;

/** Tiny seeded PRNG (mulberry32) so scenery is varied but stable per build. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stroke the closed track centerline into a graphics object. */
function strokeCenter(g: Phaser.GameObjects.Graphics, track: Track): void {
  const pts = track.center;
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.strokePath();
}

export function drawTrack(scene: Phaser.Scene, track: Track): void {
  const { width: W, height: H } = DESIGN;
  const rand = rng(20260624);
  const hw = track.halfWidth;

  // --- Grass ground: tiled Kenney grass -----------------------------------
  scene.add.tileSprite(0, 0, W, H, 'grass').setOrigin(0, 0).setDepth(-50);

  // --- Dirt road following the spline --------------------------------------
  // Dark rim first (slightly wider stroke), then a full-screen dirt TileSprite
  // clipped to the road ribbon by a geometry mask. The mask graphics is kept
  // alive (not destroyed) — the mask samples it every frame.
  const rim = scene.add.graphics().setDepth(-42);
  rim.lineStyle(hw * 2 + 14, DIRT_EDGE, 1);
  strokeCenter(rim, track);

  const dirt = scene.add.tileSprite(0, 0, W, H, 'dirt').setOrigin(0, 0).setDepth(-40);
  const maskG = scene.make.graphics({ x: 0, y: 0 }, false);
  maskG.lineStyle(hw * 2, 0xffffff, 1);
  strokeCenter(maskG, track);
  dirt.setMask(maskG.createGeometryMask());

  // --- Checkered start/finish line -----------------------------------------
  const fin = scene.add.graphics().setDepth(-39);
  drawCheckered(fin, track);

  // --- Scenery: Kenney trees + rocks (kept off the road) -------------------
  const trees: { x: number; y: number }[] = [];
  let tries = 0;
  while (trees.length < 46 && tries < 4000) {
    tries++;
    const x = 20 + rand() * (W - 40);
    const y = 20 + rand() * (H - 40);
    if (track.project({ x, y }).dist < hw + 42) continue; // off the road
    if (trees.some((t) => Math.hypot(t.x - x, t.y - y) < 58)) continue;
    trees.push({ x, y });
    const key = rand() < 0.6 ? 'tree-large' : 'tree-small';
    const size = 42 + rand() * 26;
    scene.add
      .image(x, y, key)
      .setDisplaySize(size, size)
      .setRotation(rand() * Math.PI * 2)
      .setDepth(-30);
  }
  for (let i = 0; i < 18; i++) {
    const x = 20 + rand() * (W - 40);
    const y = 20 + rand() * (H - 40);
    if (track.project({ x, y }).dist < hw + 20) continue;
    const key = `rock${1 + Math.floor(rand() * 3)}`;
    const size = 14 + rand() * 12;
    scene.add
      .image(x, y, key)
      .setDisplaySize(size, size * 0.8)
      .setRotation(rand() * Math.PI * 2)
      .setDepth(-31);
  }
}

/** Checkered start/finish line across the road. */
function drawCheckered(g: Phaser.GameObjects.Graphics, track: Track): void {
  const a = track.startB; // one edge
  const dir = track.startDir; // forward
  // along-line unit vector (from B to A)
  const ax = track.startA.x - track.startB.x;
  const ay = track.startA.y - track.startB.y;
  const lineLen = Math.hypot(ax, ay);
  const ux = ax / lineLen;
  const uy = ay / lineLen;
  const cell = 13;
  const cols = Math.max(2, Math.round(lineLen / cell));
  const rows = 2;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const black = (c + r) % 2 === 0;
      const bx = a.x + ux * (c * cell) - dir.x * (rows / 2) * cell + dir.x * (r * cell);
      const by = a.y + uy * (c * cell) - dir.y * (rows / 2) * cell + dir.y * (r * cell);
      g.fillStyle(black ? 0x1a1a1a : 0xf4f4f4, 1);
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + ux * cell, by + uy * cell);
      g.lineTo(bx + ux * cell + dir.x * cell, by + uy * cell + dir.y * cell);
      g.lineTo(bx + dir.x * cell, by + dir.y * cell);
      g.closePath();
      g.fillPath();
    }
  }
}
