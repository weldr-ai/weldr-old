import { z } from "zod";

import { dbModelDeclarationSpecsSchema } from "./db-model";
import { endpointDeclarationSpecsSchema } from "./endpoint";
import { pageDeclarationSpecsSchema } from "./page";

export const declarationSpecsV1Schema = z.object({
  version: z.literal("v1").describe("MUST always be v1"),
  data: z.discriminatedUnion("type", [
    endpointDeclarationSpecsSchema,
    dbModelDeclarationSpecsSchema,
    pageDeclarationSpecsSchema,
  ]),
});
