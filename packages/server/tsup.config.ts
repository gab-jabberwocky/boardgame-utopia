import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  // Workspace packages ship TypeScript source, so bundle them into dist/index.js.
  noExternal: [/^@utopia\//],
});
