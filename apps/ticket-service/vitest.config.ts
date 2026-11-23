import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'ticket-service',
    include: ['test/**/*.test.ts'],
  },
});
