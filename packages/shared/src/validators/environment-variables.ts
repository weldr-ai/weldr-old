import { z } from "zod";

export const environmentVariableSchema = z.object({
  id: z.string(),
  key: z.string(),
  secretId: z.string(),
  projectId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  userId: z.string().nullable(),
});

export const insertEnvironmentVariableSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "Key must be in SCREAMING_SNAKE_CASE format"),
  value: z.string().min(1, "Value is required"),
  projectId: z.string().min(1, "Project ID is required"),
});
