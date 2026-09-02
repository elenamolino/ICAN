import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

// Set via `test.env` (applied before any module, including test files and
// app code, is loaded) rather than dotenv.config() inside a test file --
// dotenv.config() never overrides variables already present in
// process.env, so if a plain `.env` (dev config) had already been loaded
// by something else in the process, .env.vitest would silently lose and
// the test suite would run against -- and dropDatabase() -- dev's database.
// .env.vitest (not .env.testing, which is the dev-setup template devs copy
// to api/.env) points at its own isolated database.
const testEnvPath = path.resolve(__dirname, '.env.vitest');
const testEnv = fs.existsSync(testEnvPath) ? dotenv.parse(fs.readFileSync(testEnvPath)) : {};

export default defineConfig({
    test: {
      include: ['**/*.test.ts'], // Solo incluye los tests del directorio API
      globals: true, // Habilita la API global de Vitest
      environment: 'node', // Usa el entorno Node.js
      env: testEnv,
      fileParallelism: false,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        reportsDirectory: './coverage',
        thresholds: {
          lines: 70,
          functions: 70,
          branches: 60,
          statements: 70,
        },
      },
      typecheck: {
        tsconfig: 'tsconfig.json', // Asegura que Vitest utilice el tsconfig específico
      },
    },
  });
