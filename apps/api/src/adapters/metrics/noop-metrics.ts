import type { Metrics } from '../../application/ports/metrics.ts';

const noop = () => undefined;

export const noopMetrics: Metrics = {
  increment: noop,
  observe: noop,
  setGauge: noop,
};
