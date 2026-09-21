/**
 * Renders the track scene by baking Kenney Racing Kit top-down PNGs (CC0) into
 * a single static RenderTexture: a flat verge-color ground fill, road tiles
 * (straights, corners, start/grid) from the circuit layout, scattered kit
 * trees, and circuit deco (grandstands, billboards, barriers, ...). Everything
 * is drawn once — no per-frame cost.
 *
 * Depth: baked RenderTexture (-50) < drawn line (10) < cars (25).
 */
import Phaser from 'phaser';
import type { CircuitLayout, PiecePlacement } from '../core/CircuitTrack';
import { KIT } from '../config/kit';
import { DESIGN } from '../config/constants';

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

export function drawTrack(scene: Phaser.Scene, layout: CircuitLayout): void {
  const { width: W, height: H } = DESIGN;
  const rt = scene.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(-50);

  // Ground fill: kit road tiles bake their own opaque grass verge right to the
  // tile edge — sampled at roadStraight.png's edge pixel (row 128, col 0) it's
  // a flat (110,146,130). The pack's tiled grass.png is a much more saturated,
  // bladed (39,175,96), so laying it under the tiles produced a hard seam
  // around every road piece. Flat-filling the tile's own verge color instead
  // reads seamless (screenshot-verified) — see task-4-report.md.
  rt.fill(0x6e9282, 1, 0, 0, W, H);

  const tmp = scene.make.image({ add: false });
  const stamp = (p: PiecePlacement) => {
    tmp.setTexture(p.key);
    // every kit PNG was rendered at KIT.pxPerUnit px per world unit
    const s = layout.cellPx / KIT.pxPerUnit;
    tmp.setScale(s).setRotation(p.rot).setPosition(p.x, p.y);
    rt.draw(tmp);
  };
  // scenery trees: same rejection-sampled scatter as before, but kit sprites
  const rand = rng(20260921);
  const treeScatter: PiecePlacement[] = [];
  let tries = 0;
  while (treeScatter.length < 26 && tries < 3000) {
    tries++;
    const x = 20 + rand() * (W - 40);
    const y = 20 + rand() * (H - 40);
    if (layout.track.project({ x, y }).dist < layout.track.halfWidth + layout.cellPx * 0.55) continue;
    if (treeScatter.some((t) => Math.hypot(t.x - x, t.y - y) < 64)) continue;
    treeScatter.push({ key: rand() < 0.6 ? 'treeLarge' : 'treeSmall', x, y, rot: rand() * Math.PI * 2 });
  }
  for (const p of layout.pieces) stamp(p);
  for (const p of treeScatter) stamp(p);
  for (const p of layout.deco) stamp(p);
  tmp.destroy();
}
