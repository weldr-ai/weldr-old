import { z } from "zod";

import { openApiEndpointSpecSchema } from "../openapi";

export const endpointDeclarationSpecsSchema = openApiEndpointSpecSchema.extend({
  type: z.literal("endpoint"),
  protected: z.boolean().optional().describe("Whether the endpoint is protected"),
});
