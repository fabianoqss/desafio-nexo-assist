export type MetricName =
  | 'nexo_logins_total'
  | 'nexo_messages_total'
  | 'nexo_handoffs_total'
  | 'nexo_handoff_wait_seconds'
  | 'nexo_drafts_total'
  | 'nexo_tickets_created_total'
  | 'nexo_ticket_client_retries_total'
  | 'nexo_ticket_client_circuit_state'
  | 'nexo_rate_limited_total';

export interface Metrics {
  increment(name: MetricName, labels?: Record<string, string>): void;
  observe(name: MetricName, value: number, labels?: Record<string, string>): void;
  setGauge(name: MetricName, value: number, labels?: Record<string, string>): void;
}
