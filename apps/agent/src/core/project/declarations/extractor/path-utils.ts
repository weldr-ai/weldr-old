import { getOrCreateSession } from "@/core/sandbox/just-bash/session";

function resolveRelativePath(currentFilePath: string, importPath: string): string {
  // Pure string-based path resolution without filesystem dependencies
  const currentDir = currentFilePath.includes("/")
    ? currentFilePath.substring(0, currentFilePath.lastIndexOf("/"))
    : "";

  if (importPath === ".") {
    return currentDir || ".";
  }

  if (importPath === "..") {
    if (!currentDir) return "..";
    const parentDir = currentDir.includes("/")
      ? currentDir.substring(0, currentDir.lastIndexOf("/"))
      : "";
    return parentDir || ".";
  }

  if (importPath.startsWith("./")) {
    const relativePart = importPath.substring(2);
    return currentDir ? `${currentDir}/${relativePart}` : relativePart;
  }

  if (importPath.startsWith("../")) {
    const segments = importPath.split("/");
    let targetDir = currentDir;
    let i = 0;

    // Process all '../' segments
    while (i < segments.length && segments[i] === "..") {
      if (targetDir?.includes("/")) {
        targetDir = targetDir.substring(0, targetDir.lastIndexOf("/"));
      } else {
        targetDir = "..";
      }
      i++;
    }

    // Add remaining path segments
    const remainingSegments = segments.slice(i);
    if (remainingSegments.length > 0) {
      const remainingPath = remainingSegments.join("/");
      return targetDir ? `${targetDir}/${remainingPath}` : remainingPath;
    }

    return targetDir || ".";
  }

  // For other cases, return as-is
  return importPath;
}

export async function resolveFilePath(
  projectId: string,
  snapshotId: string,
  basePath: string,
): Promise<string | null> {
  const session = await getOrCreateSession({ projectId, snapshotId });
  const hasExtension = /\.[^/.]+$/.test(basePath);

  // Ensure path starts with / for agentfs
  const normalizedBasePath = basePath.startsWith("/") ? basePath : `/${basePath}`;

  if (hasExtension) {
    try {
      const stat = await session.agent.fs.stat(normalizedBasePath);
      if (stat.isFile()) {
        return basePath;
      }
    } catch {
      // File doesn't exist, continue checking other paths
    }
  }

  const extensions = [".ts", ".tsx", ".js", ".jsx", ".json"];
  const indexFiles = ["/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index.json"];

  const potentialPaths: string[] = [];

  // Direct file matches
  for (const ext of extensions) {
    potentialPaths.push(`${basePath}${ext}`);
  }

  // Index file matches
  for (const indexFile of indexFiles) {
    potentialPaths.push(`${basePath}${indexFile}`);
  }

  for (const potentialPath of potentialPaths) {
    // avoid trying to check root path
    if (potentialPath === "/") continue;

    // Ensure path starts with / for agentfs
    const normalizedPath = potentialPath.startsWith("/") ? potentialPath : `/${potentialPath}`;
    try {
      const stat = await session.agent.fs.stat(normalizedPath);
      if (stat.isFile()) {
        return potentialPath;
      }
    } catch {
      // File doesn't exist, continue checking other paths
    }
  }

  return null;
}

function resolvePathAlias({
  importPath,
  pathAliases,
}: {
  importPath: string;
  pathAliases?: Record<string, string>;
}): string | null {
  if (!pathAliases) return null;

  for (const [alias, target] of Object.entries(pathAliases)) {
    // Handle glob patterns like "@/*" -> "./src/*"
    if (alias.endsWith("/*") && target.endsWith("/*")) {
      const aliasPrefix = alias.slice(0, -2); // Remove "/*"
      const targetPrefix = target.slice(0, -2); // Remove "/*"

      if (importPath.startsWith(`${aliasPrefix}/`)) {
        const remainingPath = importPath.slice(aliasPrefix.length + 1);
        return `${targetPrefix}/${remainingPath}`;
      }
    }
    // Handle exact matches
    else if (importPath === alias) {
      return target;
    }
  }

  return null;
}

export function generateDeclarationUri({
  filename,
  name,
}: {
  filename: string;
  name: string;
}): string {
  const normalizedFile = filename.replace(/\\/g, "/").replace(/^\//, "");
  return `${normalizedFile}#${name}`;
}

export function isExternalPackage({
  importPath,
  pathAliases,
}: {
  importPath: string;
  pathAliases?: Record<string, string>;
}): boolean {
  // If it starts with . or /, it's definitely internal
  if (importPath.startsWith(".") || importPath.startsWith("/")) {
    return false;
  }

  // Check if it matches any path alias - if so, it's internal
  if (pathAliases) {
    for (const alias of Object.keys(pathAliases)) {
      // Handle glob patterns like "@/*"
      if (alias.endsWith("/*")) {
        const aliasPrefix = alias.slice(0, -2); // Remove "/*"
        if (importPath.startsWith(`${aliasPrefix}/`)) {
          return false; // It's internal via alias
        }
      }
      // Handle exact matches
      else if (importPath === alias) {
        return false; // It's internal via alias
      }
    }
  }

  // If none of the above, it's external
  return true;
}

interface ResolveInternalPathOptions {
  projectId?: string;
  snapshotId?: string;
  importPath: string;
  currentFilePath: string;
  pathAliases?: Record<string, string>;
}

export async function resolveInternalPathAsync(
  options: ResolveInternalPathOptions,
): Promise<string> {
  const { projectId, snapshotId, importPath, currentFilePath, pathAliases } = options;

  // First try to resolve using path aliases
  const aliasResolved = resolvePathAlias({ importPath, pathAliases });

  let nonAliasedPath: string;
  // For relative imports, resolve them relative to current file
  if (importPath.startsWith(".")) {
    nonAliasedPath = resolveRelativePath(currentFilePath, importPath);
  } else {
    nonAliasedPath = importPath;
  }

  const pathToCheck = aliasResolved || nonAliasedPath;

  // If no projectId/snapshotId provided, skip agentfs file resolution
  // (used for internal template processing)
  if (!projectId || !snapshotId) {
    return pathToCheck;
  }

  // Now, try to find the actual file with extension via agentfs
  const finalPath = await resolveFilePath(projectId, snapshotId, pathToCheck);

  if (!finalPath) {
    return pathToCheck;
  }

  return finalPath;
}
