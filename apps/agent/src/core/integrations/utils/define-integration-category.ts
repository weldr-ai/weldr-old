import type { IntegrationKey } from "@weldr/shared/types";

import type { IntegrationCategoryDefinition } from "../types";

export function defineIntegrationCategory<K extends IntegrationKey[]>(
  definition: IntegrationCategoryDefinition<K>,
): IntegrationCategoryDefinition<K> {
  return definition;
}
