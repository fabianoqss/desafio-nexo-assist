import { describe, expect, it } from 'vitest';

import {
  adjustConfidence,
  CONFIDENCE_PENALTIES,
  RuleCheckId,
  shouldHandoff,
  type RuleCheck,
} from '../../src/index.ts';

function failed(id: RuleCheckId): RuleCheck {
  return { id, passed: false, detail: `${id} failed` };
}

function passed(id: RuleCheckId): RuleCheck {
  return { id, passed: true, detail: `${id} passed` };
}

describe('adjustConfidence', () => {
  it('lowers the LLM confidence by each failed check and explains why', () => {
    const result = adjustConfidence(0.76, [
      failed(RuleCheckId.CATEGORY_UNCLEAR),
      failed(RuleCheckId.NO_HELP_ARTICLE),
      passed(RuleCheckId.MISSING_REQUIRED_FIELDS),
    ]);

    expect(result.confidence).toBeCloseTo(0.41);
    expect(result.reasons).toEqual(['CATEGORY_UNCLEAR failed', 'NO_HELP_ARTICLE failed']);
  });

  it('keeps the LLM confidence when every check passes', () => {
    expect(
      adjustConfidence(0.9, [
        passed(RuleCheckId.POSSIBLE_DUPLICATE),
        passed(RuleCheckId.CATEGORY_UNCLEAR),
      ]),
    ).toEqual({ confidence: 0.9, reasons: [] });
  });

  it.each([
    { llmConfidence: Number.NaN, expected: 0 },
    { llmConfidence: 1.7, expected: 1 },
    { llmConfidence: -0.2, expected: 0 },
  ])('clamps an LLM confidence of $llmConfidence to $expected', ({ llmConfidence, expected }) => {
    expect(adjustConfidence(llmConfidence, []).confidence).toBe(expected);
  });

  it('never goes below zero when every check fails', () => {
    const everyCheckFailed = Object.values(RuleCheckId).map(failed);

    expect(adjustConfidence(1, everyCheckFailed).confidence).toBe(0);
  });

  it('has a penalty for every rule check', () => {
    expect(Object.keys(CONFIDENCE_PENALTIES).sort()).toEqual(Object.values(RuleCheckId).sort());
  });
});

describe('shouldHandoff', () => {
  it.each([
    { confidence: 0.41, threshold: undefined, expected: true },
    { confidence: 0.6, threshold: undefined, expected: false },
    { confidence: 0.7, threshold: 0.8, expected: true },
  ])(
    'confidence $confidence with threshold $threshold -> $expected',
    ({ confidence, threshold, expected }) => {
      expect(shouldHandoff(confidence, threshold)).toBe(expected);
    },
  );
});
