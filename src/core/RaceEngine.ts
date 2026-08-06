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

  /** Fraction (0..1) of the way from the last sim step to the next — scenes
   * use it to interpolate car positions for smooth rendering. */
  get alpha(): number {
    return Math.min(1, this.acc / SIM.dt);
  }

  allFinished(): boolean {
    return this.cars.every((c) => c.finished);
  }

  /**
   * Live ranking: eliminated cars always last; among the rest, finishers first
   * (by finish time), then still-racing cars by progress.
   */
  ranking(): RankEntry[] {
    const sorted = [...this.cars].sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.raceProgress(this.track) - a.raceProgress(this.track);
    });
    return sorted.map((car, i) => ({ car, position: i + 1 }));
  }
}
