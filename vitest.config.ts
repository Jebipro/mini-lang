import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { testTimeout: 5000, hookTimeout: 15000, maxWorkers: 2, globalSetup: './tests/helpers/build.ts' } });
