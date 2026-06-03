import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            CF_API_TOKEN: "test-token",
            ANTHROPIC_API_KEY: "test-anthropic",
            APP_PASSWORD: "test-pass",
            SESSION_SECRET: "test-secret-0123456789",
          },
        },
      },
    },
  },
});
