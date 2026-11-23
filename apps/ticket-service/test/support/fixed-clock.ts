import type { Clock } from '../../src/application/ports/clock.ts';

export class FixedClock implements Clock {
  #date: Date;

  constructor(date = new Date('2026-12-09T12:00:00Z')) {
    this.#date = new Date(date);
  }

  now(): Date {
    return new Date(this.#date);
  }

  set(date: Date): void {
    this.#date = new Date(date);
  }
}
