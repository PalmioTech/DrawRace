/**
 * Records the raw timestamped finger stroke during the draw phase and counts
 * completed laps by detecting crossings of the start/finish line.
 *
 * Pure logic — the scene feeds it pointer positions + timestamps.
 */
import type { TimedPoint, Vec2 } from './types';
import type { Track } from './Track';
import { segmentsIntersect, dist } from './Geometry';

export class PathRecorder {
  private points: TimedPoint[] = [];
  private laps = 0;
  private totalLength = 0;
  private readonly track: Track;

  constructor(track: Track) {
    this.track = track;
  }

  reset(): void {
    this.points = [];
    this.laps = 0;
    this.totalLength = 0;
  }

  /** Add a sample. Ignores micro-jitter below 2px to keep the stroke clean. */
  add(x: number, y: number, t: number): void {
    const last = this.points[this.points.length - 1];
    if (last) {
      const d = Math.hypot(x - last.x, y - last.y);
      if (d < 2) return;
      this.totalLength += d;
      // Lap detection: did this segment cross the start/finish line?
      if (segmentsIntersect(last, { x, y }, this.track.startA, this.track.startB)) {
        this.laps++;
      }
    }
    this.points.push({ x, y, t });
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
