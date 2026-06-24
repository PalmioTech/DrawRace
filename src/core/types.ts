/** Shared core types. Pure data — no Phaser dependency. */

export interface Vec2 {
  x: number;
  y: number;
}

/** A timestamped raw input sample captured while drawing. */
export interface TimedPoint {
  x: number;
  y: number;
  t: number; // ms
}

/**
 * A drivable trajectory: evenly spaced points along the drawn (or AI) line,
 * each with a target speed and the local path curvature.
 *
 * Both human draws and AI lines produce this same structure, so CarSim never
 * needs to know where a trajectory came from.
 */
export interface Trajectory {
  points: Vec2[];
  /** Target speed (px/s) at each point — the "throttle" the racer asked for. */
  speeds: number[];
  /** Local curvature (1/radius) at each point. */
  curvatures: number[];
  /** Distance (px) between consecutive points. */
  spacing: number;
  /** Total length of the trajectory (px) = (points.length - 1) * spacing. */
  length: number;
}

export type RacerKind = 'human' | 'ai';

export type GameMode = 'ai' | 'hotseat';

/** Difficulty for AI opponents. */
export type Difficulty = 'easy' | 'normal' | 'hard';

/** Configuration produced by the menu and consumed by the draw/race scenes. */
export interface RaceConfig {
  mode: GameMode;
  /** Total cars in the race (2–4). */
  carCount: number;
  difficulty: Difficulty;
}
