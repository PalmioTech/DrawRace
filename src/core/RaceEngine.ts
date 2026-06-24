/**
 * Advances all cars with a fixed timestep and computes live ranking.
 * Holds no rendering state — scenes read car positions each frame.
 */
import { Car } from './CarSim';
import type { Track } from './Track';
import { SIM } from '../config/constants';

export interface RankEntry {
  car: Car;
  position: number; // 1-based
}

export class RaceEngine {
  readonly track: Track;
  readonly cars: Car[];
  /** Elapsed race time (s). */
  time = 0;
  private acc = 0;

  constructor(track: Track, cars: Car[]) {
    this.track = track;
    this.cars = cars;
  }

  /**
   * Feed real frame delta (seconds). Runs zero or more fixed physics steps.
   * Returns true while the race is ongoing.
   */
  update(frameDelta: number): boolean {
    this.acc += frameDelta;
    let steps = 0;
    while (this.acc >= SIM.dt && steps < SIM.maxStepsPerFrame) {
      this.step(SIM.dt);
      this.acc -= SIM.dt;
      steps++;
    }
    return !this.allFinished();
  }

  private step(dt: number): void {
    this.time += dt;
    for (const car of this.cars) car.update(dt, this.track, this.time);
  }

  allFinished(): boolean {
    return this.cars.every((c) => c.finished);
  }

  /** Live ranking: finished cars first (by finish time), then by progress. */
  ranking(): RankEntry[] {
    const sorted = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.raceProgress(this.track) - a.raceProgress(this.track);
    });
    return sorted.map((car, i) => ({ car, position: i + 1 }));
  }
}
