/** Track definitions. MVP ships a single neon circuit. */
import type { Vec2 } from '../core/types';

export interface TrackDef {
  id: string;
  name: string;
  /** Control points of the closed centerline loop (design px). */
  controls: Vec2[];
  /** Half-width of the drivable surface (px). */
  halfWidth: number;
}

/**
 * "Neon Loop" — a kidney-shaped circuit that fits the 720×1280 portrait screen
 * with margins. Mix of fast straights and a couple of tight corners so the
 * finger-speed mechanic matters.
 */
export const NEON_LOOP: TrackDef = {
  id: 'neon-loop',
  name: 'Neon Loop',
  halfWidth: 62,
  controls: [
    { x: 360, y: 230 }, // top straight (start area)
    { x: 540, y: 290 },
    { x: 600, y: 470 },
    { x: 520, y: 640 },
    { x: 590, y: 850 },
    { x: 520, y: 1030 },
    { x: 360, y: 1080 },
    { x: 200, y: 1030 },
    { x: 130, y: 850 },
    { x: 200, y: 640 },
    { x: 120, y: 470 },
    { x: 180, y: 290 },
  ],
};

export const TRACKS: TrackDef[] = [NEON_LOOP];
