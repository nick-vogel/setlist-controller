import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: resolve(import.meta.dirname, '../../../..'),
    include: ['docs/reviews/setlist-controller-13/repro/lights-retry-after-failed-edit.test.ts'],
  },
});
