import { db, eq, inArray } from "@weldr/db";
import { branches, declarations, projects, users } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { extractAndSaveDeclarations } from "@/ai/utils/declarations";
import { getInstalledCategories } from "@/integrations/utils/get-installed-categories";
import type { SessionContext } from "@/session";
import { fixtures } from "./test-fixtures";

const logger = Logger.get({ module: "test-extraction" });

interface TestContext {
  projectId: string;
}

async function loadRealContext(testContext: TestContext) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, testContext.projectId),
  });

  if (!project) {
    throw new Error(`Project not found: ${testContext.projectId}`);
  }

  const installedCategories = await getInstalledCategories(project.id);

  const projectWithCategories = {
    ...project,
    integrationCategories: new Set(installedCategories),
  };

  const branch = await db.query.branches.findFirst({
    where: eq(branches.projectId, testContext.projectId),
    with: {
      headVersion: true,
    },
    orderBy: (branches, { asc }) => [asc(branches.createdAt)],
  });

  if (!branch) {
    throw new Error(`No branches found for project: ${testContext.projectId}`);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, project.userId),
  });

  if (!user) {
    throw new Error(`User not found: ${project.userId}`);
  }

  return { project: projectWithCategories, branch, user };
}

function createSessionContextForTest(
  project: typeof projects.$inferSelect & {
    integrationCategories: Set<string>;
  },
  branch: typeof branches.$inferSelect & { headVersion: unknown },
  user: typeof users.$inferSelect,
): SessionContext {
  return {
    project,
    branch,
    user,
  } as SessionContext;
}

/**
 * Clean up test data (declarations) created during the test
 */
async function cleanupTestData(projectId: string, declarationIdsBefore: string[]) {
  const currentDeclarations = await db.query.declarations.findMany({
    where: eq(declarations.projectId, projectId),
  });

  const declarationsToDelete = currentDeclarations
    .filter((d) => !declarationIdsBefore.includes(d.id))
    .map((d) => d.id);

  if (declarationsToDelete.length > 0) {
    await db.delete(declarations).where(inArray(declarations.id, declarationsToDelete));
  }
}

async function testExtractionAndDependencies(
  context: SessionContext,
  filePath: string,
  sourceCode: string,
  expectedDeclarations?: string[],
) {
  const { project } = context;

  const declarationsBeforeTest = await db.query.declarations.findMany({
    where: eq(declarations.projectId, project.id),
  });
  const declarationIdsBeforeTest = declarationsBeforeTest.map((d) => d.id);

  try {
    await extractAndSaveDeclarations({
      context,
      filePath,
      sourceCode,
      branchId: "o05ymiamk4r50z8j-ug10j6rzb92gh254",
    });

    const declarationsAfter = await db.query.declarations.findMany({
      where: eq(declarations.projectId, project.id),
      with: {
        dependencies: {
          with: {
            dependency: true,
          },
        },
      },
    });

    const fileDeclarations = declarationsAfter.filter((d) => d.path === filePath);

    if (fileDeclarations.length > 0) {
      logger.info(`\n🔍 Extracted declarations (from code):`);
      for (const decl of fileDeclarations) {
        const metadata = decl.metadata?.codeMetadata;
        logger.info(`  URI: ${decl.uri}`);
        logger.info(`  Name: ${metadata?.name || "N/A"}`);
        logger.info(`  Type: ${metadata?.type || "N/A"}`);
        logger.info(`  Progress: ${decl.progress}`);
        logger.info(`  Declaration ID: ${decl.id}\n`);
      }
    }

    let totalExpected = 0;
    let totalResolved = 0;
    let totalUnresolved = 0;

    for (const declaration of fileDeclarations) {
      const codeMetadata = declaration.metadata?.codeMetadata;
      if (!codeMetadata?.dependencies) continue;

      const internalDeps = codeMetadata.dependencies.filter((d) => d.type === "internal");

      for (const dep of internalDeps) {
        for (const expectedIdentifier of dep.dependsOn) {
          totalExpected++;
          const fullUri = `${dep.filePath}#${expectedIdentifier}`;
          const found = declarationsAfter.find((d) => d.uri === fullUri);

          if (found) {
            totalResolved++;
          } else {
            totalUnresolved++;
          }
        }
      }
    }

    return {
      totalExpected,
      totalResolved,
      totalUnresolved,
      fileDeclarations,
      expectedDeclarations: expectedDeclarations?.length || 0,
    };
  } finally {
    await cleanupTestData(project.id, declarationIdsBeforeTest);
  }
}

async function main() {
  const projectId = process.env.TEST_PROJECT_ID || process.argv[2];
  const fixtureFilter = process.env.TEST_FIXTURE || process.argv[3];

  if (!projectId) {
    console.error("Missing required argument: projectId");
    console.log("Usage: tsx test-extraction.ts <projectId> [fixtureName]");
    console.log("Or set environment variables: TEST_PROJECT_ID, TEST_FIXTURE");
    console.log("\nAvailable fixtures:");
    for (const fixture of fixtures) {
      console.log(`  - ${fixture.name}: ${fixture.description}`);
    }
    process.exit(1);
  }

  try {
    const { project, branch, user } = await loadRealContext({
      projectId,
    });

    const context = createSessionContextForTest(project, branch, user);

    const fixturesToTest = fixtureFilter
      ? fixtures.filter((f) => f.name === fixtureFilter)
      : fixtures;

    if (fixturesToTest.length === 0) {
      console.error(`No fixtures found matching: ${fixtureFilter}`);
      console.log("\nAvailable fixtures:");
      for (const fixture of fixtures) {
        console.log(`  - ${fixture.name}: ${fixture.description}`);
      }
      process.exit(1);
    }

    logger.info(`Testing ${fixturesToTest.length} fixture(s) on project ${project.subdomain}`);

    const results = [];

    for (const fixture of fixturesToTest) {
      logger.info(`\nTesting: ${fixture.name}`);

      const result = await testExtractionAndDependencies(
        context,
        fixture.filePath,
        fixture.sourceCode,
        fixture.expectedDeclarations,
      );

      results.push({
        fixture: fixture.name,
        ...result,
      });

      if (fixturesToTest.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    const totalExpected = results.reduce((sum, r) => sum + r.totalExpected, 0);
    const totalResolved = results.reduce((sum, r) => sum + r.totalResolved, 0);
    const totalUnresolved = results.reduce((sum, r) => sum + r.totalUnresolved, 0);

    logger.info("\n=== SUMMARY ===");
    logger.info(
      `Dependency Resolution: ${totalResolved}/${totalExpected} (${totalExpected > 0 ? ((totalResolved / totalExpected) * 100).toFixed(1) : 0}%)`,
    );

    if (totalUnresolved > 0) {
      logger.warn(`${totalUnresolved} dependencies unresolved`);
    }
  } catch (error) {
    logger.error("Test failed", {
      extra: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

export { testExtractionAndDependencies, loadRealContext, createSessionContextForTest };
