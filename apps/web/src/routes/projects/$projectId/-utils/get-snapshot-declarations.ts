import type { RouterOutputs } from "@weldr/api";

type Snapshot = NonNullable<RouterOutputs["branches"]["getByIdOrMain"]>["snapshot"];

type Declaration = NonNullable<Snapshot>["declarations"][number]["declaration"];

type DeclarationEdge = {
  dependencyId: string | undefined;
  dependentId: string | undefined;
};

export const getSnapshotDeclarations = (
  snapshot: Snapshot | null,
): { declaration: Declaration; edges: DeclarationEdge[] }[] => {
  if (!snapshot) {
    return [];
  }

  const declarations = snapshot.declarations
    .filter((declaration) => declaration.declaration.node)
    .map((declaration) => declaration.declaration);

  const declarationToCanvasNodeMap = new Map(
    declarations.map((declaration) => [declaration.id, declaration.node?.id]),
  );

  return declarations.map((declaration) => ({
    declaration,
    edges: declaration.dependencies.map((dependency) => ({
      dependencyId: declarationToCanvasNodeMap.get(dependency.dependencyId),
      dependentId: declarationToCanvasNodeMap.get(dependency.dependentId),
    })),
  }));
};
