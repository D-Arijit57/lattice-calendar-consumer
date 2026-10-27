import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

// In dev the browser talks to Vite, which forwards /api to the Node server that
// holds the API key. In production that same server also serves dist/.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {proxy: {'/api': 'http://localhost:3002'}},
  test: {include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'shared/**/*.test.ts']},
});
