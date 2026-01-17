import * as ts from "typescript";

import type { DeclarationCodeMetadata } from "@weldr/shared/types/declarations";

import { processSourceFile } from "./processor";

export async function extractDeclarations({
  sourceCode,
  filename,
  pathAliases,
  branchId,
  projectId,
  snapshotId,
}: {
  sourceCode: string;
  filename: string;
  pathAliases?: Record<string, string>;
  branchId?: string;
  projectId?: string;
  snapshotId?: string;
}): Promise<DeclarationCodeMetadata[]> {
  try {
    // Create a TypeScript source file
    const sourceFile = ts.createSourceFile(
      filename,
      sourceCode,
      ts.ScriptTarget.Latest,
      true, // setParentNodes
      filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const declarations: DeclarationCodeMetadata[] = [];
    const sourceLines = sourceCode.split("\n");

    // Track imported identifiers for dependency analysis
    const importedIdentifiers = new Map<string, { source: string; isExternal: boolean }>();

    await processSourceFile({
      sourceFile,
      sourceCode,
      sourceLines,
      filename,
      pathAliases,
      branchId,
      projectId,
      snapshotId,
      declarations,
      importedIdentifiers,
    });

    return declarations;
  } catch (error) {
    throw new Error("Failed to parse TypeScript code", { cause: error });
  }
}
