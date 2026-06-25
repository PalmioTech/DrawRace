/**
 * Renders the track scene in a top-down RALLY style (procedural, no textures):
 * grassy ground, a dirt road with worn edges, scattered pine trees + rocks, and
 * a checkered start/finish line. Drawn once per scene (static layers).
 *
 * Layer depths: grass (-50) < road (-40) < scenery (-30) < (drawn line 10, cars 25).
 */
import Phaser from 'phaser';
import type { Track } from '../core/Track';
import type { Vec2 } from '../core/types';
import { DESIGN } from '../config/constants';

// --- Rally palette ---
const GRASS_BASE = 0x4f7a3a;
const GRASS_DARK = 0x3c6330;
const GRASS_LIGHT = 0x638f44;
const DIRT = 0xb08c5c;
const DIRT_LIGHT = 0xc6a877;
const DIRT_DARK = 0x6f5635;
const DIRT_EDGE = 0x53401f;
const TREE_SHADOW = 0x14240f;
const TREE_DARK = 0x244c1c;
const TREE_MID = 0x356b28;
const TREE_LIGHT = 0x4f8a39;
const ROCK = 0x8d8c84;
const ROCK_DARK = 0x5f5e57;

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

/** Fill the band between two offset polylines. */
function fillBand(g: Phaser.GameObjects.Graphics, left: Vec2[], right: Vec2[], color: number): void {
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) g.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i].x, right[i].y);
  g.closePath();
  g.fillPath();
}

export function drawTrack(scene: Phaser.Scene, track: Track): void {
  const { width: W, height: H } = DESIGN;
  const rand = rng(20260624);

  // Draw everything into one off-screen graphics, then bake to a single
  // RenderTexture — so the (heavy) scenery is one image per frame, not redrawn.
  const grass = scene.make.graphics({ x: 0, y: 0 });
  const road = grass;
  const deco = grass;

  // --- Grass ground ------------------------------------------------------
  grass.fillStyle(GRASS_BASE, 1);
  grass.fillRect(0, 0, W, H);
  for (let i = 0; i < 320; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 10 + rand() * 30;
    grass.fillStyle(rand() < 0.5 ? GRASS_DARK : GRASS_LIGHT, 0.35);
    grass.fillCircle(x, y, r);
  }

  // --- Dirt road ---------------------------------------------------------
  const hw = track.halfWidth;
  const outer = track.borders(hw + 9);
  const mid = track.borders(hw + 3);
  const inner = track.borders(hw);
  fillBand(road, outer.left, outer.right, DIRT_EDGE); // dark rim
  fillBand(road, mid.left, mid.right, DIRT_DARK); // shaded edge
  fillBand(road, inner.left, inner.right, DIRT); // road surface
  // Worn texture: scattered light/dark dirt patches along the road.
  for (let s = 0; s < track.length; s += 14) {
    const c = track.pointAt(s);
    const tan = track.tangentAt(s);
    const nx = -tan.y;
    const ny = tan.x;
    const off = (rand() * 2 - 1) * hw * 0.8;
    const x = c.x + nx * off;
    const y = c.y + ny * off;
    road.fillStyle(rand() < 0.5 ? DIRT_LIGHT : DIRT_DARK, 0.25);
    road.fillCircle(x, y, 3 + rand() * 5);
  }

  drawCheckered(road, track);

  // --- Scenery: pine trees + rocks (kept off the road) -------------------
  const trees: { x: number; y: number; r: number }[] = [];
  const rocks: { x: number; y: number; r: number }[] = [];
  let tries = 0;
  while (trees.length < 60 && tries < 4000) {
    tries++;
    const x = 16 + rand() * (W - 32);
    const y = 16 + rand() * (H - 32);
    if (track.project({ x, y }).dist < hw + 30) continue; // off the road
    if (trees.some((t) => Math.hypot(t.x - x, t.y - y) < 44)) continue;
    trees.push({ x, y, r: 13 + rand() * 12 });
  }
  for (let i = 0; i < 22; i++) {
    const x = 16 + rand() * (W - 32);
    const y = 16 + rand() * (H - 32);
    if (track.project({ x, y }).dist < hw + 16) continue;
    rocks.push({ x, y, r: 4 + rand() * 6 });
  }

  // Shadows first (down-right), then rocks, then tree canopies.
  for (const t of trees) {
    deco.fillStyle(TREE_SHADOW, 0.3);
    deco.fillEllipse(t.x + t.r * 0.5, t.y + t.r * 0.7, t.r * 2.4, t.r * 1.5);
  }
  for (const k of rocks) {
    deco.fillStyle(ROCK_DARK, 0.4);
    deco.fillEllipse(k.x + 2, k.y + 3, k.r * 2.2, k.r * 1.4);
    deco.fillStyle(ROCK, 1);
    deco.fillCircle(k.x, k.y, k.r);
  }
  for (const t of trees) {
    deco.fillStyle(TREE_DARK, 1);
    deco.fillCircle(t.x, t.y, t.r);
    deco.fillStyle(TREE_MID, 1);
    deco.fillCircle(t.x - t.r * 0.18, t.y - t.r * 0.18, t.r * 0.72);
    deco.fillStyle(TREE_LIGHT, 0.9);
    deco.fillCircle(t.x - t.r * 0.32, t.y - t.r * 0.32, t.r * 0.38);
  }

  // Bake to a single static texture; drop the graphics so nothing heavy redraws.
  const rt = scene.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(-50);
  rt.draw(grass);
  grass.destroy();
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
