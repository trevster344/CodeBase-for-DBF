import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// The tests import the built package at ../../interfaces/Node/dist/index.js, which is outside
// this project root, so allow Vite to serve it.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export default defineConfig({
   test: {
      environment: 'node',
      include: ['**/*.test.ts']
   },
   server: {
      fs: {
         allow: [repoRoot]
      }
   }
});
