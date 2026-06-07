import { defineConfig } from "vitest/config";
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineConfig({
  test: {
    workspace: [
      defineWorkersProject({
        test: {
          name: "workers",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/buildserver.test.ts", "tests/integration/**", "**/node_modules/**"],
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
      }),
      {
        test: {
          name: "node",
          environment: "node",
          include: ["tests/buildserver.test.ts", "tests/integration/**/*.test.ts"],
        },
      },
    ],
  },
});
