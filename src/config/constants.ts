/**
 * Central tuning + theme constants.
 *
 * All gameplay units are in DESIGN PIXELS (the fixed virtual resolution below)
 * and SECONDS. Phaser's Scale.FIT maps design pixels onto the real screen, so
 * physics is resolution-independent.
 *
 * These numbers are intentionally easy to tweak — balancing the feel of the
 * draw-to-race mechanic is mostly about adjusting them.
 */

/** Fixed virtual resolution (LANDSCAPE). The whole track fits inside this. */
export const DESIGN = {
  width: 1280,
  height: 720,
} as const;

/** Number of laps the player must draw (baked into the trajectory). */
export const LAPS = 3;

/** Left sidebar (live times + standings) width. */
export const SIDEBAR_W = 296;

/**
 * Play area the track is fitted into — almost full screen, right of the sidebar.
 * Track geometry is scaled to fill this in Track's constructor, so draw input
 * and race rendering share the same big map.
 */
export const PLAY_AREA = {
  x: SIDEBAR_W + 10,
  y: 12,
  w: 1280 - (SIDEBAR_W + 10) - 14,
  h: 720 - 24,
} as const;

/** Physics simulation step. Fixed timestep → deterministic, stable feel. */
export const SIM = {
  /** seconds per fixed physics tick (60 Hz) */
  dt: 1 / 60,
  /** cap on catch-up steps per frame to avoid spiral-of-death */
  maxStepsPerFrame: 5,
} as const;

/** Spacing (design px) between resampled trajectory nodes. Smaller = smoother. */
export const PATH_SPACING = 7;

/** Car speed limits + acceleration (design px / s, px / s²). */
export const CAR = {
  minSpeed: 110,
  maxSpeed: 620,
  accel: 560,
  brake: 1000,
  /**
   * Lateral grip budget. Max speed through a corner of radius R is
   * sqrt(maxLatAccel * R). Lower = must slow more for corners.
   */
  maxLatAccel: 950,
  /** How much lateral slide (px) per unit of over-speed when cornering above grip. */
  slideGain: 0.05,
  /** How fast the slide offset eases toward its target (per-second rate). */
  slideEase: 6,
  /** Max lateral slide offset (px) — keeps the car from flying off the line. */
  maxSlide: 34,
  /** Low-pass factor for the rendered position (0..1 per tick). Lower = smoother. */
  renderSmooth: 0.3,
  /** Speed multiplier while off the track surface (grass/sand). */
  offTrackGrip: 0.6,
  /** Number of off-track excursions before a car is eliminated. */
  eliminateAfterOffRuns: 2,
  /** Min on-track distance (px) between counted excursions (debounces edge jitter). */
  minOnGapPx: 70,
  /** Visual radius of a car. */
  radius: 13,
} as const;

/** Pre-race car setup: point budget + max level per stat. */
export const SETUP = {
  budget: 6,
  maxLevel: 3,
} as const;

/**
 * How each stat level scales the base CAR values. Each value is the fractional
 * change PER LEVEL (level 0 = base car). Tunable.
 */
export const STAT_SCALING = {
  /** Grip: +lat cornering grip, −lateral slide per level. */
  gripLat: 0.18,
  gripSlide: 0.18,
  /** Speed: +top speed per level. */
  speed: 0.1,
  /** Brake: +braking force per level. */
  brake: 0.2,
  /** Accel: +acceleration per level. */
  accel: 0.18,
  /** Offroad: extra tolerated off-track excursions per level (absolute, +1). */
  offroad: 1,
} as const;

/**
 * Maps finger speed (px/s while drawing) to target car speed.
 * carTarget = clamp(fingerSpeed * gain, minSpeed, maxSpeed)
 */
export const DRAW = {
  speedGain: 0.62,
  /** Moving-average window (samples) to smooth jittery finger speed. */
  smoothWindow: 10,
  /** Min total drawn length (px) for a stroke to be considered valid. */
  minStrokeLength: 400,
  /** Comet fade: how many recent raw segments stay visible while drawing. */
  fadeSegments: 90,
} as const;

/** Extra geometry smoothing passes for the drawn line (kills jitter). */
export const SMOOTH = {
  /** Moving-average window (points) applied to the resampled path positions. */
  pathWindow: 3,
  /** Moving-average window (points) applied to curvature. */
  curvatureWindow: 5,
} as const;

/** Neon theme palette (0xRRGGBB). */
export const COLORS = {
  bg: 0x05060f,
  trackFill: 0x121526,
  trackBorder: 0x2de2e6,
  trackCenterline: 0x2a2f4a,
  startLine: 0xf6f7ff,
  textPrimary: 0xf6f7ff,
  textMid: 0xb4bce0,
  textDim: 0x8a90b8,
  accent: 0xff2e97,
  /** Per-car neon colors (up to 4 cars in the MVP). */
  cars: [0x2de2e6, 0xff2e97, 0xffe600, 0x7cff6b] as number[],
  /** Draw-line speed gradient endpoints (slow → fast). */
  drawSlow: 0xff2e97,
  drawFast: 0x2de2e6,
  // --- UI chrome ---
  /** Background gradient stops (top → bottom). */
  bgTop: 0x0a0e24,
  bgBottom: 0x04050d,
  /** Faint background grid lines. */
  grid: 0x1b2142,
  /** Panel / card fill + border. */
  panel: 0x0e1230,
  panelBorder: 0x2b3566,
  /** Secondary accent (violet) for variety. */
  violet: 0x8b5cf6,
} as const;

/** UI fonts loaded in index.html. */
export const FONT = {
  display: 'Orbitron',
  body: 'Rajdhani',
} as const;

/** Per-stat accent colors (setup UI), keyed in STAT_KEYS order. */
export const STAT_COLORS: Record<string, number> = {
  grip: 0x2de2e6,
  speed: 0xffe600,
  brake: 0xff2e97,
  accel: 0x7cff6b,
  offroad: 0x8b5cf6,
};

export const CAR_LABELS = ['P1', 'P2', 'P3', 'P4'] as const;
