// @ts-check

import type { NextConfig } from "next";

const config = {
  /** Enables hot reloading for local packages without a build step */
  transpilePackages: ["@weldr/api", "@weldr/auth", "@weldr/db", "@weldr/ui"],

  images: {
    remotePatterns: [
      {
        hostname: "weldr-general.t3.storage.dev",
      },
    ],
  },

  /** We already do linting and typechecking as separate tasks in CI */
  typescript: { ignoreBuildErrors: true },
} satisfies NextConfig;

export default config;
