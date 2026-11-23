import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'seed-data',
    include: ['test/**/*.test.ts'],
  },
});
