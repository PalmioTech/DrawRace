/**
 * Records the raw timestamped finger stroke during the draw phase and counts
 * completed laps by detecting crossings of the start/finish line.
 *
 * Pure logic — the scene feeds it pointer positions + timestamps.
 */
import type { TimedPoint, Vec2 } from './types';
import type { Track } from './Track';
import { segmentsIntersect, dist } from './Geometry';
import { LAPS } from '../config/constants';

export class PathRecorder {
  private points: TimedPoint[] = [];
  private laps = 0;
  private totalLength = 0;
  /** Drawn length at which the last lap was counted (debounce). */
  private lastLapAt = 0;
  /** Set once LAPS laps are drawn — further samples are ignored. */
  private complete = false;
  private readonly track: Track;

  constructor(track: Track) {
    this.track = track;
  }

  reset(): void {
    this.points = [];
    this.laps = 0;
    this.totalLength = 0;
    this.lastLapAt = 0;
    this.complete = false;
  }

  /**
   * Add a sample. Ignores micro-jitter (<2px) and refuses any input once the
   * required laps are drawn (so the player can't keep scribbling past the line).
   * Returns true if the stroke just became complete on this sample.
   */
  add(x: number, y: number, t: number): boolean {
    if (this.complete) return false;
    const last = this.points[this.points.length - 1];
    let justCompleted = false;
    if (last) {
      const d = Math.hypot(x - last.x, y - last.y);
      if (d < 2) return false;
      this.totalLength += d;
      // Lap = a FORWARD crossing of the start line, debounced so the line must
      // travel most of a lap between counts (kills start-adjacent / double counts).
      if (segmentsIntersect(last, { x, y }, this.track.startA, this.track.startB)) {
        const forward =
          (x - last.x) * this.track.startDir.x + (y - last.y) * this.track.startDir.y > 0;
        if (forward && this.totalLength - this.lastLapAt > this.track.length * 0.4) {
          this.laps++;
          this.lastLapAt = this.totalLength;
          if (this.laps >= LAPS) {
            this.complete = true;
            justCompleted = true;
          }
        }
      }
    }
    this.points.push({ x, y, t });
    return justCompleted;
  }

  /** True once the required laps have been drawn (no more input accepted). */
  isComplete(): boolean {
    return this.complete;
  }

  lapsCompleted(): number {
    return this.laps;
  }

  length(): number {
    return this.totalLength;
  }

  getRaw(): TimedPoint[] {
    return this.points;
  }

  positions(): Vec2[] {
    return this.points.map((p) => ({ x: p.x, y: p.y }));
  }

  /** Did the player start close enough to the start line? */
  startedNearStart(): boolean {
    const first = this.points[0];
    if (!first) return false;
    return dist(first, this.track.startPos) < this.track.halfWidth * 2.2;
  }
}
