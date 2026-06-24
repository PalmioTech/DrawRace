/**
 * Single-car arcade physics. The car follows its own Trajectory (which already
 * bakes in all 3 laps) at the requested speed, but is capped by cornering grip:
 * drawing too fast into a tight corner makes the car slide outward and bleed
 * speed (a time penalty, never a hard stop). Off-track surface reduces grip.
 *
 * No car-to-car collisions: each car is independent ("ghost"), ranking is by
 * progress along the track centerline.
 */
import type { Trajectory, Vec2, RacerKind } from './types';
import type { Track } from './Track';
import { CAR } from '../config/constants';
import { perp, normalize, sub, add, scale } from './Geometry';

export class Car {
  readonly id: number;
  readonly kind: RacerKind;
  readonly label: string;
  readonly color: number;
  readonly traj: Trajectory;

  /** Arc length travelled along the car's own trajectory. */
  s = 0;
  /** Current forward speed (px/s). */
  speed = 0;
  /** Lateral slide offset (px) — positive pushes to the outside of corners. */
  slide = 0;

  /** Render position (centerline-of-path + slide). */
  pos: Vec2;
  /** Facing direction. */
  dir: Vec2 = { x: 0, y: 1 };

  finished = false;
  finishTime = 0;

  // --- centerline progress (for ranking + lap display) ---
  private centerLap = 0;
  private prevCenterFrac = 0;
  /** True while the car is sliding above grip this tick (for FX). */
  sliding = false;
  /** True while off the drivable surface this tick (for FX). */
  offTrack = false;

  constructor(id: number, kind: RacerKind, label: string, color: number, traj: Trajectory, track: Track) {
    this.id = id;
    this.kind = kind;
    this.label = label;
    this.color = color;
    this.traj = traj;
    this.pos = traj.points.length ? { ...traj.points[0] } : { x: 0, y: 0 };
    this.speed = CAR.minSpeed * 0.5;
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

    const { p, target, curv, tangent } = this.sampleAt(this.s);

    // --- Corner grip limit: vmax = sqrt(latAccel / curvature) -------------
    const safeCurv = Math.max(curv, 1e-5);
    const cornerMax = Math.sqrt(CAR.maxLatAccel / safeCurv);

    // Off-track surface penalty.
    this.offTrack = !track.isOnTrack(this.pos);
    const surface = this.offTrack ? CAR.offTrackGrip : 1;

    // Effective target this tick: requested speed, capped by grip + surface.
    const effTarget = Math.min(target, cornerMax) * surface;

    // Excess of requested speed over the corner's grip → the player overcooked
    // this corner: the car slides outward and loses extra speed.
    const excess = Math.max(0, target - cornerMax);
    this.sliding = excess > 1;
    if (this.sliding) {
      this.slide += excess * CAR.slideGain * dt;
    }
    this.slide = Math.max(0, this.slide - this.slide * CAR.slideDecay * dt);

    // Accelerate / brake toward the effective target.
    if (this.speed < effTarget) {
      this.speed = Math.min(effTarget, this.speed + CAR.accel * dt);
    } else {
      // Extra braking force when overcooking a corner (the penalty bites).
      const brake = CAR.brake * (this.sliding ? 1.6 : 1);
      this.speed = Math.max(effTarget, this.speed - brake * dt);
    }
    this.speed = Math.max(CAR.minSpeed * surface, this.speed);

    // Advance along the trajectory.
    this.s += this.speed * dt;

    // Render position = path point pushed outward by the current slide.
    const turnSign = curv > 1e-5 ? this.turnSign(this.s) : 0;
    const outward = scale(perp(tangent), -turnSign); // outside of the corner
    this.pos = add(p, scale(outward, this.slide));
    this.dir = tangent;

    // Update centerline progress for ranking / lap display.
    this.updateProgress(track);

    // Finished when the whole (3-lap) trajectory is consumed.
    if (this.s >= this.traj.length) {
      this.finished = true;
      this.finishTime = time;
      this.s = this.traj.length;
    }
  }

  /** Sign of the local turn (+1 left, -1 right) from neighbouring tangents. */
  private turnSign(s: number): number {
    const a = this.sampleAt(Math.max(0, s - this.traj.spacing)).tangent;
    const b = this.sampleAt(s).tangent;
    const cross = a.x * b.y - a.y * b.x;
    return Math.sign(cross) || 1;
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
