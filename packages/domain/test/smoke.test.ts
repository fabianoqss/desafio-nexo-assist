import { describe, expect, it } from 'vitest';

import { DOMAIN_TIMEZONE } from '../src/index.ts';

describe('domain package', () => {
  it('uses the São Paulo timezone for every business rule', () => {
    expect(DOMAIN_TIMEZONE).toBe('America/Sao_Paulo');
  });
});
