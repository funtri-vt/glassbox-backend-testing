import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { fileURLToPath, URL } from 'node:url';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
    clearMocks: true,
  },
  resolve: {
    alias: {
      // 🎯 THE FIX: Intercept the web-push library at the bundler level 
      // before Miniflare attempts to resolve the node:https dependency
      'web-push': fileURLToPath(new URL('./tests/__mocks__/web-push.js', import.meta.url)),
    }
  }
});