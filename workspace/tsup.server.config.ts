import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/server/index.ts",
    "db/migrate": "src/server/db/migrate.ts",
  },
  outDir: "dist/server",
  format: ["esm"],
  platform: "node",
  target: "node22",
  bundle: true,
  splitting: false,
  minify: true,
  sourcemap: false,
  clean: true,
  skipNodeModulesBundle: true,
  treeshake: true,
  tsconfig: "./tsconfig.json",
});
