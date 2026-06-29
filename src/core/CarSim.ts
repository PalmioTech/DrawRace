/**
 * Single-car arcade physics. The car follows its own Trajectory (which already
 * bakes in all 3 laps) at the requested speed, but is capped by cornering grip:
 * drawing too fast into a tight corner makes the car slide outward and bleed
 * speed (a time penalty, never a hard stop). Off-track surface reduces grip.
 *
 * No car-to-car collisions: each car is independent ("ghost"), ranking is by
 * progress along the track centerline.
 */
import type { Trajectory, Vec2, RacerKind, CarStats } from './types';
import type { Track } from './Track';
import { CAR, LAPS } from '../config/constants';
import { perp, normalize, sub, add, scale, segmentsIntersect } from './Geometry';

export class Car {
  readonly id: number;
  readonly kind: RacerKind;
  readonly label: string;
  readonly color: number;
  readonly traj: Trajectory;
  /** Resolved car stats (from the chosen setup). */
  readonly stats: CarStats;

  /** Arc length travelled along the car's own trajectory. */
  s = 0;
  /** Current forward speed (px/s). */
  speed = 0;
  /** Lateral slide offset magnitude (px). */
  slide = 0;
  /** Stable direction (±1) the slide pushes toward (outside of the corner). */
  private slideSign = 1;

  /** Render position (centerline-of-path + slide). */
  pos: Vec2;
  /** Facing direction. */
  dir: Vec2 = { x: 0, y: 1 };

  finished = false;
  finishTime = 0;
  /** Doing the celebratory finish-line power-slide (still moving). */
  private finishing = false;
  private finishDir: Vec2 = { x: 1, y: 0 };
  private finishStart: Vec2 = { x: 0, y: 0 };
  private finishTarget: Vec2 = { x: 0, y: 0 };
  private finishSign = 1;
  private finishProgress = 0;

  /** Eliminated after too many off-track excursions. */
  eliminated = false;
  /** Count of distinct off-track excursions. */
  private offRuns = 0;
  private wasOff = false;
  /** On-track distance accumulated since the last excursion ended. */
  private onDist = 0;

  // --- centerline progress (for ranking + lap display) ---
  private centerLap = 0;
  private prevCenterFrac = 0;
  // --- finish-line crossing (authoritative finish) ---
  private crossings = 0;
  private lastCrossS = 0;
  private prevPos: Vec2;
  /** True while the car is sliding above grip this tick (for FX). */
  sliding = false;
  /** True while off the drivable surface this tick (for FX). */
  offTrack = false;

  constructor(
    id: number,
    kind: RacerKind,
    label: string,
    color: number,
    traj: Trajectory,
    track: Track,
    stats: CarStats,
  ) {
    this.id = id;
    this.kind = kind;
    this.label = label;
    this.color = color;
    this.traj = traj;
    this.stats = stats;
    this.pos = traj.points.length ? { ...traj.points[0] } : { x: 0, y: 0 };
    // Face the direction the car will set off in (so sprites point forward on
    // the grid, not toward the start line).
    if (traj.points.length >= 2) this.dir = normalize(sub(traj.points[1], traj.points[0]));
    this.speed = stats.minSpeed * 0.5;
    this.prevPos = { ...this.pos };
    this.prevCenterFrac = track.project(this.pos).s / track.length;
  }

  /** Sample trajectory position/target-speed/curvature at arc length `s`. */
  private sampleAt(s: number): { p: Vec2; target: number; curv: number; tangent: Vec2 } {
    const t = this.traj;
    const fIdx = s / t.spacing;
    const i = Math.min(t.points.length - 2, Math.max(0, Math.floor(fIdx)));
    const frac = Math.min(1, Math.max(0, fIdx - i));
    const a = t.points[i];
    const b = t.points[i + 1] ?? a;
    const p = { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
    const target = t.speeds[i] + (t.speeds[i + 1] - t.speeds[i]) * frac;
    const curv = t.curvatures[i] + (t.curvatures[i + 1] - t.curvatures[i]) * frac;
    const tangent = normalize(sub(b, a));
    return { p, target, curv, tangent };
  }

  /** Advance one fixed timestep. */
  update(dt: number, track: Track, time: number): void {
    if (this.finished || this.traj.points.length < 2) return;
    if (this.finishing) {
      this.finishDrift(dt);
      return;
    }

    const st = this.stats;
    const { p, target, curv, tangent } = this.sampleAt(this.s);

    // --- Corner grip limit: vmax = sqrt(latAccel / |curvature|) -----------
    const curvAbs = Math.abs(curv);
    const cornerMax = Math.sqrt(st.maxLatAccel / Math.max(curvAbs, 1e-5));

    // Off-track surface penalty + excursion counting, with HYSTERESIS: the car
    // goes "off" when it crosses the border, but only re-arms (can count a new
    // excursion) after it returns WELL inside the track. This stops a single
    // swerve — which wiggles across the border a few times — from counting as
    // several. A min on-track distance further debounces.
    // Use the clean PATH point (not the slide-distorted render position) so a
    // single smooth swerve is one excursion, not several.
    const dCenter = track.project(p).dist;
    const half = track.halfWidth;
    if (!this.wasOff) {
      this.onDist += this.speed * dt;
      if (dCenter > half) {
        if (this.onDist >= st.minOnGapPx) this.offRuns++;
        this.wasOff = true;
        this.onDist = 0;
      }
    } else if (dCenter < half * 0.6) {
      this.wasOff = false; // back well inside → ready to count the next one
    }
    this.offTrack = this.wasOff;
    if (this.offRuns >= st.eliminateAfterOffRuns) {
      // Too many off-track runs → out of the race.
      this.eliminated = true;
      this.finished = true;
      this.speed = 0;
      return;
    }
    // Effective target this tick. On track: capped by corner grip. Off track:
    // capped to a slow cruise (grass) — slow but never stopped/blocked.
    const effTarget = this.offTrack
      ? Math.min(target, CAR.offTrackMaxSpeed)
      : Math.min(target, cornerMax);

    // Drift only when BOTH the steering is sharp AND the speed is well over the
    // corner limit. Otherwise the race stays linear: straights and gentle/well-
    // judged corners produce no slide, just a smooth slow-down to the limit.
    const cornerFactor = Math.max(
      0,
      Math.min(1, (curvAbs - CAR.cornerSlideMin) / (CAR.cornerSlideFull - CAR.cornerSlideMin)),
    );
    const excess = Math.max(0, target - cornerMax);
    const overMargin = CAR.driftSpeedMargin + cornerMax * 0.06;
    // SMOOTH gates (0..1) instead of on/off, so the drift fades in/out without
    // stuttering near the thresholds.
    const cornerGate = Math.max(0, Math.min(1, (cornerFactor - CAR.driftCornerMin) / (1 - CAR.driftCornerMin)));
    const overGate = Math.max(0, Math.min(1, (excess - overMargin) / overMargin));
    const drift = this.offTrack ? 0 : cornerGate * overGate;
    this.sliding = drift > 0.12;
    const slideTarget = Math.min(st.maxSlide, excess * st.slideGain) * drift;
    // Build up gradually, but recover (return to the line) quickly so the car
    // straightens out as soon as the corner ends.
    const rate = slideTarget >= this.slide ? st.slideEase : CAR.slideRecover;
    this.slide += (slideTarget - this.slide) * Math.min(1, rate * dt);

    // Accelerate / brake toward the effective target.
    if (this.speed < effTarget) {
      this.speed = Math.min(effTarget, this.speed + st.accel * dt);
    } else {
      // Gentle braking onto grass; harder brake when overcooking a corner.
      const brake = this.offTrack ? CAR.offTrackBrake : st.brake * (this.sliding ? 1.9 : 1);
      this.speed = Math.max(effTarget, this.speed - brake * dt);
    }
    this.speed = Math.max(this.offTrack ? CAR.offTrackMinSpeed : st.minSpeed, this.speed);

    // Advance along the trajectory.
    this.s += this.speed * dt;

    // Stable slide direction: outside of the corner = opposite the turn side.
    if (curvAbs > 1e-4) this.slideSign = -Math.sign(curv);
    const outward = scale(perp(tangent), this.slideSign);
    const wanted = add(p, scale(outward, this.slide));

    // Low-pass the rendered position so any residual noise can't snap the car.
    this.pos = add(this.pos, scale(sub(wanted, this.pos), st.renderSmooth));

    // Drift yaw: while sliding, rotate the car's heading off the path tangent so
    // it visibly DRIFTS (nose kicked toward the corner) instead of just being
    // shifted sideways. Angle scales with how much it's sliding.
    const driftAngle = (this.slide / st.maxSlide) * CAR.driftMaxAngle * this.slideSign;
    const ca = Math.cos(driftAngle);
    const sa = Math.sin(driftAngle);
    this.dir = { x: tangent.x * ca - tangent.y * sa, y: tangent.x * sa + tangent.y * ca };

    // Update centerline progress for ranking / lap display.
    this.updateProgress(track);

    // Authoritative finish: the LAPS-th FORWARD crossing of the finish line
    // (debounced by distance). Stops the car AT the line, not at the end of the
    // drawn stroke (which overshoots past the line and would drift on).
    if (segmentsIntersect(this.prevPos, this.pos, track.startA, track.startB)) {
      const fwd =
        (this.pos.x - this.prevPos.x) * track.startDir.x +
        (this.pos.y - this.prevPos.y) * track.startDir.y;
      if (fwd > 0 && this.s - this.lastCrossS > track.length * 0.4) {
        this.crossings++;
        this.lastCrossS = this.s;
      }
    }
    this.prevPos = { ...this.pos };

    // Crossed the finish line for the LAPS-th time (or ran out of line): record
    // the time for ranking and kick off a celebratory power-slide to a stop
    // (the car keeps moving and drifts instead of freezing on the line).
    if (this.crossings >= LAPS || this.s >= this.traj.length) {
      this.finishing = true;
      this.finishTime = time;
      this.finishSign = this.slideSign || 1;
      this.finishProgress = 0;
      this.finishStart = { ...this.pos };
      // Park spot: ON the track at the finish line, staggered per car so they
      // don't pile up — distinct lateral lane + a step back along the straight.
      this.finishDir = track.startDir;
      const fwd = 26 + this.id * 8;
      const lat = (this.id - 1.5) * track.halfWidth * 0.5;
      this.finishTarget = add(
        track.startPos,
        add(scale(track.startDir, fwd), scale(perp(track.startDir), lat)),
      );
    }
  }

  /**
   * Scripted finish: a graceful power-slide. The car eases (decelerating) from
   * where it crossed the line to a staggered park spot, arcing sideways and
   * yawing into a drift that straightens out as it settles. Looks like a stylish
   * hand-brake stop, ~finishDuration seconds.
   */
  private finishDrift(dt: number): void {
    this.offTrack = false;
    this.finishProgress = Math.min(1, this.finishProgress + dt / CAR.finishDuration);
    const t = this.finishProgress;
    const e = 1 - Math.pow(1 - t, 3); // easeOutCubic: enters fast, settles slow
    const arc = Math.sin(t * Math.PI); // 0 → 1 → 0

    // Curved path: lerp start→target plus a lateral bulge that peaks mid-slide.
    const per = perp(this.finishDir);
    const bulge = arc * CAR.finishBulge * this.finishSign;
    this.pos = {
      x: this.finishStart.x + (this.finishTarget.x - this.finishStart.x) * e + per.x * bulge,
      y: this.finishStart.y + (this.finishTarget.y - this.finishStart.y) * e + per.y * bulge,
    };

    // Yaw kicks into a drift then straightens to face forward at the end.
    const yaw = arc * CAR.driftMaxAngle * 1.7 * this.finishSign;
    const ca = Math.cos(yaw);
    const sa = Math.sin(yaw);
    this.dir = {
      x: this.finishDir.x * ca - this.finishDir.y * sa,
      y: this.finishDir.x * sa + this.finishDir.y * ca,
    };

    this.sliding = t < 0.82;
    this.speed = (1 - e) * 280; // decaying (HUD only)

    if (t >= 1) {
      this.finished = true;
      this.speed = 0;
      this.pos = { ...this.finishTarget };
      this.dir = { ...this.finishDir };
    }
  }

  /** Track-centerline progress with lap wrap detection. */
  private updateProgress(track: Track): void {
    const frac = track.project(this.pos).s / track.length;
    if (this.prevCenterFrac > 0.7 && frac < 0.3) this.centerLap++;
    else if (this.prevCenterFrac < 0.3 && frac > 0.7) this.centerLap = Math.max(0, this.centerLap - 1);
    this.prevCenterFrac = frac;
  }

  /** Monotonic race progress used to rank cars (laps * trackLen + position). */
  raceProgress(track: Track): number {
    return this.centerLap * track.length + this.prevCenterFrac * track.length;
  }

  /** 1-based lap for the HUD (capped at total laps). */
  displayLap(totalLaps: number): number {
    return Math.min(totalLaps, this.centerLap + 1);
  }
}
