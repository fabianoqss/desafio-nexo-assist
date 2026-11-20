import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
      thresholds: {
        'packages/domain/src/**/*.ts': {
          lines: 90,
          branches: 90,
        },
      },
    },
  },
});
