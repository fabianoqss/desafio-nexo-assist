import type { Clock } from '../../application/ports/clock.ts';

export const systemClock: Clock = {
  now() {
    return new Date();
  },
};
