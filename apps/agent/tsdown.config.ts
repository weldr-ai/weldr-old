import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "tsdown/config";

export default defineConfig({
  entry: ["src/**/*.ts", "!src/core/integrations/**/data/**"],
  platform: "node",
  format: "esm",
  minify: true,
  noExternal: [/^@weldr\/.*/],
  external: ["pg-cloudflare"],
  copy: (options) => {
    const integrationPaths: Array<{ from: string; to: string }> = [];
    const integrationsDir = join(options.cwd || process.cwd(), "src/core/integrations");

    try {
      const findDataDirs = (dir: string, relativePath = ""): void => {
        const items = readdirSync(dir);

        for (const item of items) {
          const itemPath = join(dir, item);
          const itemRelativePath = join(relativePath, item);

          if (statSync(itemPath).isDirectory()) {
            if (item === "data") {
              integrationPaths.push({
                from: join("src/core/integrations", itemRelativePath),
                to: join("dist/core/integrations", itemRelativePath),
              });
            } else {
              findDataDirs(itemPath, itemRelativePath);
            }
          }
        }
      };

      findDataDirs(integrationsDir);
    } catch (_error) {
      console.warn("No integrations directory found, skipping data copy");
    }

    return integrationPaths;
  },
});
