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
  private finishTarget: Vec2 = { x: 0, y: 0 };
  private finishSign = 1;

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
    const drifting =
      !this.offTrack && cornerFactor >= CAR.driftCornerMin && excess > overMargin;
    this.sliding = drifting;
    // Slide scales with how far past the margin you are, and corner sharpness.
    const slideTarget = drifting
      ? Math.min(st.maxSlide, (excess - overMargin) * st.slideGain) * cornerFactor
      : 0;
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
      // Park spot: ON the track at the finish line, staggered per car so they
      // don't pile up — distinct lateral lane + a step back along the straight.
      this.finishDir = track.startDir;
      // A few px PAST the line, lightly staggered forward; lanes spread laterally.
      const fwd = 26 + this.id * 8;
      const lat = (this.id - 1.5) * track.halfWidth * 0.5;
      this.finishTarget = add(
        track.startPos,
        add(scale(track.startDir, fwd), scale(perp(track.startDir), lat)),
      );
    }
  }

  /** Scripted finish: drift to a staggered park spot on the track, then stop. */
  private finishDrift(dt: number): void {
    this.offTrack = false;
    const toT = sub(this.finishTarget, this.pos);
    const d = Math.hypot(toT.x, toT.y);

    // Ease toward the park spot (quick), report a speed for the HUD.
    this.pos = add(this.pos, scale(toT, Math.min(1, 9 * dt)));
    this.speed = d * 6;

    // Drift yaw while still moving in, straighten as it parks.
    const phase = Math.min(1, d / 45);
    this.sliding = phase > 0.25;
    const ang = this.finishSign * 0.9 * phase;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    this.dir = {
      x: this.finishDir.x * ca - this.finishDir.y * sa,
      y: this.finishDir.x * sa + this.finishDir.y * ca,
    };

    if (d < 1.5) {
      this.finished = true;
      this.speed = 0;
      this.pos = { ...this.finishTarget };
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
