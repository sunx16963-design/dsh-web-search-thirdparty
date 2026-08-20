import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/platform-mocks.ts'],
    include: ['tests/**/*.test.ts'],
  },
})
