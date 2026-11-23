import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
      exclude: [
        'apps/ticket-service/src/main.ts',
        'apps/ticket-service/src/migrate.ts',
        'apps/ticket-service/src/seed/run-seed.ts',
      ],
      thresholds: {
        'packages/contracts/src/**/*.ts': {
          lines: 90,
        },
        'packages/domain/src/**/*.ts': {
          lines: 90,
          branches: 90,
        },
        'apps/ticket-service/src/**/*.ts': {
          lines: 85,
          branches: 80,
        },
      },
    },
  },
});
