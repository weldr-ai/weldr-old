import * as ts from "typescript";

import type { DeclarationCodeMetadata } from "@weldr/shared/types/declarations";

import { processSourceFile } from "./processor";

export async function extractDeclarations({
  sourceCode,
  filename,
  pathAliases,
  workspaceDir,
}: {
  sourceCode: string;
  filename: string;
  pathAliases?: Record<string, string>;
  workspaceDir: string;
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
      workspaceDir,
      declarations,
      importedIdentifiers,
    });

    return declarations;
  } catch (error) {
    throw new Error("Failed to parse TypeScript code", { cause: error });
  }
}

// async function main() {
//   const workspaceDir = "~/.weldr/o05ymiamk4r50z8j/ug10j6rzb92gh254";
//   const sourceCode = `
// import { type Route } from "@orpc/server";
// import { z } from "zod";

// import { users } from "@repo/server/db/schema";
// import { publicProcedure } from "@repo/server/lib/utils";
// import { selectUserSchema } from "@repo/server/lib/validators/users";
// import { useDb } from "@repo/server/middlewares/db";
// import { retry } from "@repo/server/middlewares/retry";

// const definition = {
//   method: "GET",
//   tags: ["Users"],
//   path: "/users",
//   successStatus: 200,
//   description: "Get list of users",
//   summary: "Get users",
// } satisfies Route;

// const route = publicProcedure
//   .route(definition)
//   .use(useDb)
//   .use(retry({ times: 3 }))
//   .output(z.array(selectUserSchema))
//   .handler(async ({ context }) => {
//     return await context.db.query.users.findMany({
//       orderBy: (users, { desc }) => [desc(users.createdAt)],
//     });
//   });

// export default route;
// `;

//   const declarations = await extractDeclarations({
//     sourceCode,
//     filename: "apps/server/src/routes/users/list.ts",
//     workspaceDir,
//   });

//   console.log(declarations);
// }

// main();
