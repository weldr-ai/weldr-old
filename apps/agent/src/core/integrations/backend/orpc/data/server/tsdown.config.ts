import { defineConfig } from "tsdown/config";

export default defineConfig({
  entry: "src/**/*.ts",
  platform: "node",
  format: "esm",
  minify: true,
});
