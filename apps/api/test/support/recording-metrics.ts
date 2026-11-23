import type { MetricName, Metrics } from '../../src/application/ports/metrics.ts';

interface MetricCallBase {
  name: MetricName;
  labels?: Record<string, string>;
}

type MetricCall = MetricCallBase &
  ({ method: 'increment' } | { method: 'observe' | 'setGauge'; value: number });

export class RecordingMetrics implements Metrics {
  readonly calls: MetricCall[] = [];

  increment(name: MetricName, labels?: Record<string, string>): void {
    this.calls.push({ method: 'increment', name, ...(labels && { labels: { ...labels } }) });
  }

  observe(name: MetricName, value: number, labels?: Record<string, string>): void {
    this.calls.push({ method: 'observe', name, value, ...(labels && { labels: { ...labels } }) });
  }

  setGauge(name: MetricName, value: number, labels?: Record<string, string>): void {
    this.calls.push({ method: 'setGauge', name, value, ...(labels && { labels: { ...labels } }) });
  }
}
