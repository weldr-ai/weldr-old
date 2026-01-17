import type { Dependency } from "@weldr/shared/types/declarations";

import { generateDeclarationUri } from "./path-utils";

function isBuiltinIdentifier(identifier: string): boolean {
  const builtins = new Set([
    // JavaScript built-ins
    "Array",
    "Object",
    "String",
    "Number",
    "Boolean",
    "Date",
    "RegExp",
    "Promise",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Symbol",
    "Error",
    "console",
    "window",
    "document",
    "global",
    "process",
    // TypeScript built-ins
    "any",
    "unknown",
    "never",
    "void",
    "undefined",
    "null",
    // Common keywords
    "function",
    "class",
    "interface",
    "type",
    "enum",
    "namespace",
    "const",
    "let",
    "var",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "default",
    "break",
    "continue",
    "return",
    "throw",
    "try",
    "catch",
    "finally",
    "new",
    "this",
    "super",
    "static",
    "public",
    "private",
    "protected",
    "readonly",
    "abstract",
    "async",
    "await",
    "export",
    "import",
    "from",
    "as",
    "extends",
    "implements",
  ]);

  return builtins.has(identifier);
}

export function findDependencies({
  code,
  importedIdentifiers,
}: {
  code: string;
  importedIdentifiers: Map<string, { source: string; isExternal: boolean }>;
}): Dependency[] {
  const dependencies: Dependency[] = [];
  const usedIdentifiers = new Set<string>();

  // This is a basic implementation - a more robust version would use AST analysis
  const identifierRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  let match: RegExpExecArray | null;

  while ((match = identifierRegex.exec(code)) !== null) {
    const identifier = match[1];
    // Skip common keywords and built-ins
    if (identifier && !isBuiltinIdentifier(identifier)) {
      usedIdentifiers.add(identifier);
    }
  }

  // Map used identifiers to dependencies
  for (const identifier of usedIdentifiers) {
    const importInfo = importedIdentifiers.get(identifier);

    if (importInfo) {
      const existing = dependencies.find(
        (dep) =>
          (dep.type === "external" && dep.importPath === importInfo.source) ||
          (dep.type === "internal" && dep.filePath === importInfo.source),
      );

      if (existing) {
        // For internal dependencies, generate URI; for external, keep identifier name
        if (existing.type === "internal") {
          const uri = generateDeclarationUri({
            filename: importInfo.source,
            name: identifier,
          });
          existing.dependsOn.push(uri);
        } else {
          existing.dependsOn.push(identifier);
        }
      } else {
        if (importInfo.isExternal) {
          dependencies.push({
            type: "external",
            packageName: importInfo.source.split("/")[0] || importInfo.source,
            importPath: importInfo.source,
            dependsOn: [identifier],
          });
        } else {
          // Generate URI for internal dependency
          const uri = generateDeclarationUri({
            filename: importInfo.source,
            name: identifier,
          });
          dependencies.push({
            type: "internal",
            filePath: importInfo.source,
            dependsOn: [uri],
          });
        }
      }
    }
  }

  return dependencies;
}
