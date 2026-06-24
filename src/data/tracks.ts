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
  halfWidth: 58,
  // Landscape circuit (fits 1280×720) with a start straight along the top,
  // a couple of tight corners and a bottom-right hairpin bump.
  controls: [
    { x: 640, y: 130 }, // start straight (top center)
    { x: 900, y: 155 },
    { x: 1090, y: 290 },
    { x: 990, y: 430 },
    { x: 1110, y: 580 }, // bottom-right hairpin
    { x: 820, y: 605 },
    { x: 640, y: 555 },
    { x: 460, y: 605 },
    { x: 175, y: 585 },
    { x: 285, y: 430 },
    { x: 185, y: 290 },
    { x: 375, y: 155 },
  ],
};

export const TRACKS: TrackDef[] = [NEON_LOOP];
