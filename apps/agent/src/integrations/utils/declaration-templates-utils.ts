import { and, db, eq, sql } from "@weldr/db";
import {
  declarations,
  declarationTemplates,
  integrationTemplates,
  versionDeclarations,
} from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";
import { nanoid } from "@weldr/shared/nanoid";
import type { Integration, IntegrationKey } from "@weldr/shared/types";

import type { WorkflowContext } from "@/workflow/context";

/**
 * Seed declaration templates to a user's project based on their selected integration options
 * This function is called from integration postInstall hooks
 */
export async function seedDeclarationTemplates({
  integration,
  context,
}: {
  integration: Integration;
  context: WorkflowContext;
}) {
  const project = context.get("project");
  const branch = context.get("branch");
  const user = context.get("user");

  if (!project || !branch.headVersion || !user) {
    throw new Error("Project, version, or user not found in context");
  }

  Logger.info(`Seeding declarations for ${integration.key} to project ${project.id}`);

  try {
    // Find the integration template
    const [integrationTemplate] = await db
      .select({ id: integrationTemplates.id })
      .from(integrationTemplates)
      .where(eq(integrationTemplates.id, integration.integrationTemplateId))
      .limit(1);

    if (!integrationTemplate) {
      Logger.warn(`Integration template not found: ${integration.key}`);
      return;
    }

    // Build source path filter based on selected options
    const sourcePath = buildSourcePath(integration.key, integration.options || {});
    Logger.info(`Filtering declarations by source path: ${sourcePath}`);

    // Query declaration templates that match the integration and user's options
    const conditions = [eq(declarationTemplates.integrationTemplateId, integrationTemplate.id)];

    if (sourcePath) {
      // Filter by exact source path match or templates with no source (option-agnostic)
      conditions.push(
        sql`(${declarationTemplates.source} = ${sourcePath} OR ${declarationTemplates.source} IS NULL)`,
      );
    }

    const matchingTemplates = await db
      .select()
      .from(declarationTemplates)
      .where(and(...conditions));

    Logger.info(`Found ${matchingTemplates.length} matching declaration templates`);

    // Insert declarations for this user's project and link them to the version
    let insertedCount = 0;
    for (const template of matchingTemplates) {
      // Check if declaration already exists in the project
      const [existingDeclaration] = await db
        .select({ id: declarations.id })
        .from(declarations)
        .where(
          and(eq(declarations.projectId, project.id), eq(declarations.uri, template.uri || "")),
        )
        .limit(1);

      let declarationId: string;

      if (existingDeclaration) {
        declarationId = existingDeclaration.id;
      } else {
        // Insert new declaration (declarations table has projectId and userId, no versionId)
        const [newDeclaration] = await db
          .insert(declarations)
          .values({
            id: nanoid(),
            projectId: project.id,
            userId: user.id,
            uri: template.uri,
            path: template.path,
            progress: "completed",
            metadata: template.metadata,
            embedding: template.embedding,
          })
          .returning({
            id: declarations.id,
            path: declarations.path,
            uri: declarations.uri,
          });

        if (!newDeclaration) {
          Logger.warn(`⚠️  Failed to insert declaration: ${template.path}`);
          continue;
        }

        declarationId = newDeclaration.id;
        insertedCount++;
      }

      // Link declaration to version via versionDeclarations junction table (avoid duplicates)
      const [existingLink] = await db
        .select()
        .from(versionDeclarations)
        .where(
          and(
            eq(versionDeclarations.versionId, branch.headVersion.id),
            eq(versionDeclarations.declarationId, declarationId),
          ),
        )
        .limit(1);

      if (!existingLink) {
        await db.insert(versionDeclarations).values({
          versionId: branch.headVersion.id,
          declarationId,
        });
      }
    }

    Logger.info(`🎉 Successfully seeded ${insertedCount} new declarations to user project`);
  } catch (error) {
    Logger.error(`Failed to seed declarations for ${integration.key}`, {
      error,
    });
    throw error;
  }
}

/**
 * Build source path filter based on integration key and selected options
 */
function buildSourcePath(
  integrationKey: IntegrationKey,
  selectedOptions: Record<string, unknown>,
): string {
  let sourcePath = integrationKey;

  // Handle ORM option (for database integrations like PostgreSQL)
  if (selectedOptions.orm) {
    sourcePath += `/${selectedOptions.orm}`;
  }

  // Handle other option types as needed
  // if (selectedOptions.framework) {
  //   sourcePath += `/${selectedOptions.framework}`;
  // }

  return sourcePath;
}
