import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'server-kit',
    include: ['test/**/*.test.ts'],
  },
});
