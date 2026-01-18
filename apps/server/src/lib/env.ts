import { z } from "zod";

const envSchema = z.object({
  // Required
  DATABASE_URL: z.url(),
  AXIOM_TOKEN: z.string().min(1),
  AXIOM_DATASET: z.string().min(1),
  SENTRY_DSN: z.url(),

  // Optional with defaults
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("8080"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  AXIOM_ENDPOINT: z.url().default("https://api.axiom.co"),
  OTEL_SERVICE_NAME: z.string().default("weldr-server"),
  OTEL_SERVICE_VERSION: z.string().default("1.0.0"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  API_URL: z.url().default("http://localhost:8080"),
  WEB_APP_URL: z.url().default("http://localhost:3000"),
});

export const env = envSchema.parse(process.env);
