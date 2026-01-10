import { z } from "zod";

import { parameterObjectSchema } from "../openapi";

export const pageDeclarationSpecsSchema = z.object({
  name: z
    .string()
    .describe("This is a human-friendly title for the page like 'User Profile' or 'New Post'"),
  protected: z.boolean().describe("Whether users need to be logged in to see this."),
  type: z.literal("page"),
  description: z.string().describe("The description of the page"),
  parameters: z
    .array(parameterObjectSchema)
    .optional()
    .describe("List of parameters that can be used with this page"),
  route: z
    .string()
    .describe("The route of the page in openapi format. Like /users/{id} or /users/new"),
});
