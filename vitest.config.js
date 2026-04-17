import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,jsx}', 'server/**/*.{test,spec}.{js,jsx}'],
    passWithNoTests: true,
    environmentMatchGlobs: [
      ['server/**/*.{test,spec}.{js,jsx}', 'node'],
    ],
    server: {
      deps: {
        external: ['better-sqlite3', 'jsonwebtoken'],
      },
    },
  },
})
