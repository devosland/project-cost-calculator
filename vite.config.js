import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Allow overriding the backend target via VITE_API_PROXY env var so the
  // screenshot capture script (and any non-default dev setup) can point at
  // a backend on a non-standard port without editing this file. Defaults to
  // :3000 which matches the usual `node server/index.js` flow.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': env.VITE_API_PROXY || 'http://localhost:3000',
      },
    },
  }
})
