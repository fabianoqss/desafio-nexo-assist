import { RuleCheckId } from '../enums/rule-check-id.ts';

export interface RuleCheck {
  id: RuleCheckId;
  passed: boolean;
  detail: string;
}

export interface AdjustedConfidence {
  confidence: number;
  reasons: string[];
}

export const CONFIDENCE_PENALTIES = {
  [RuleCheckId.MISSING_REQUIRED_FIELDS]: 0.3,
  [RuleCheckId.POSSIBLE_DUPLICATE]: 0.2,
  [RuleCheckId.CATEGORY_UNCLEAR]: 0.25,
  [RuleCheckId.NO_HELP_ARTICLE]: 0.1,
  [RuleCheckId.TICKET_SERVICE_UNAVAILABLE]: 0.2,
} as const satisfies Record<RuleCheckId, number>;

export const DEFAULT_HANDOFF_THRESHOLD = 0.6;

function clampToUnitInterval(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function adjustConfidence(
  llmConfidence: number,
  checks: readonly RuleCheck[],
): AdjustedConfidence {
  const failedChecks = checks.filter((check) => !check.passed);
  const totalPenalty = failedChecks.reduce((sum, check) => sum + CONFIDENCE_PENALTIES[check.id], 0);
  return {
    confidence: clampToUnitInterval(clampToUnitInterval(llmConfidence) - totalPenalty),
    reasons: failedChecks.map((check) => check.detail),
  };
}

export function shouldHandoff(
  confidence: number,
  threshold: number = DEFAULT_HANDOFF_THRESHOLD,
): boolean {
  return confidence < threshold;
}
