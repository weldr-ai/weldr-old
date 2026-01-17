import { useMemo } from "react";
import type { z } from "zod";

import type { RouterOutputs } from "@weldr/api";
import type { referencePartSchema } from "@weldr/shared/validators/chats";

type SnapshotDeclaration = NonNullable<
  RouterOutputs["branches"]["byIdOrMain"]["snapshot"]
>["declarations"][number];

interface UseEditorReferencesOptions {
  snapshot?: RouterOutputs["branches"]["byIdOrMain"]["snapshot"];
}

export function useEditorReferences({ snapshot }: UseEditorReferencesOptions) {
  const editorReferences = useMemo(() => {
    if (!snapshot?.declarations) {
      return [];
    }

    return snapshot.declarations.reduce(
      (acc: z.infer<typeof referencePartSchema>[], declaration: SnapshotDeclaration) => {
        const specs = declaration.declaration.metadata?.specs;

        switch (specs?.type) {
          case "endpoint": {
            acc.push({
              type: "endpoint",
              id: declaration.declaration.id,
              method: specs.method,
              path: specs.path,
            });
            break;
          }
          case "db-model": {
            acc.push({
              type: "db-model",
              id: declaration.declaration.id,
              name: specs.name,
            });
            break;
          }
          case "page": {
            acc.push({
              type: "page",
              id: declaration.declaration.id,
              name: specs.name,
            });
            break;
          }
          default: {
            break;
          }
        }

        return acc;
      },
      [] as z.infer<typeof referencePartSchema>[],
    );
  }, [snapshot?.declarations]);

  return editorReferences;
}
