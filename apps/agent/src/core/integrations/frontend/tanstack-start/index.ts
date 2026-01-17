import type { IntegrationPackageSets } from "../../types";
import { defineIntegration } from "../../utils/define-integration";

export const tanstackStartIntegration = defineIntegration<"tanstack-start">({
  category: "frontend",
  key: "tanstack-start",
  name: "Tanstack Start",
  description:
    "Modern React framework that provides server-side rendering, routing, and data fetching for building high-performance web applications.",
  version: "1.0.0",
  allowMultiple: false,
  options: null,
  recommendedOptions: null,
  variables: null,
  isRecommended: true,
  packages: async (context) => {
    const project = context.project;
    const hasBackend = project.integrationCategories.has("backend");
    const hasAuthentication = project.integrationCategories.has("authentication");

    const packages: IntegrationPackageSets[number] = {
      target: "web",
      runtime: {
        "@tanstack/react-query": "^5.85.5",
        "@tanstack/react-router": "^1.131.27",
        "@tanstack/react-router-ssr-query": "^1.131.27",
        "@tanstack/react-start": "^1.131.27",
        "class-variance-authority": "^0.7.1",
        clsx: "^2.1.1",
        cmdk: "^1.1.1",
        "date-fns": "^4.1.0",
        "embla-carousel-react": "^8.6.0",
        "input-otp": "^1.4.2",
        "lucide-react": "^0.525.0",
        "next-themes": "^0.4.6",
        "radix-ui": "^1.4.2",
        react: "^19.1.0",
        "react-day-picker": "^9.8.0",
        "react-dom": "^19.1.0",
        "react-hook-form": "^7.60.0",
        "react-resizable-panels": "^3.0.3",
        recharts: "^3.1.0",
        sonner: "^2.0.6",
        "tailwind-merge": "^3.3.1",
        tailwindcss: "^4.1.11",
        "tw-animate-css": "^1.3.5",
        vaul: "^1.1.2",
        zod: "^4.0.5",
      },
      development: {
        "@biomejs/biome": "2.1.1",
        "@tailwindcss/vite": "^4.1.11",
        "@types/react": "^19.1.8",
        "@types/react-dom": "^19.1.6",
        "@vitejs/plugin-react": "^4.6.0",
        vite: "^7.0.3",
        "vite-tsconfig-paths": "^5.1.4",
      },
    };

    if (hasBackend) {
      packages.runtime["@orpc/tanstack-query"] = "^1.7.2";
    }

    if (hasAuthentication) {
      packages.runtime["better-auth"] = "^1.3.1";
    }

    return [packages];
  },
});
