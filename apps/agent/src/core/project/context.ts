import { db, eq, isNotNull } from "@weldr/db";
import { branches, integrations, type projects } from "@weldr/db/schema";

export async function getProjectContext(project: typeof projects.$inferSelect) {
  const projectIntegrationsList = await db.query.integrations.findMany({
    where: eq(integrations.projectId, project.id),
    with: {
      integrationTemplate: {
        with: {
          category: true,
        },
      },
      environmentVariableMappings: {
        with: {
          environmentVariable: {
            columns: {
              key: true,
            },
          },
        },
      },
    },
  });

  // Check if project has any branches with snapshots
  const branchesWithSnapshots = await db.query.branches.findMany({
    where: isNotNull(branches.snapshotId),
    limit: 1,
  });

  if (branchesWithSnapshots.length === 0) {
    return "This is a new project";
  }

  if (projectIntegrationsList.length === 0) {
    return `You are working on an app called ${project.title} with no integrations installed.`;
  }

  const integrationsText = projectIntegrationsList
    .map((integration) => {
      const integrationName = integration.integrationTemplate.name;
      const category = integration.integrationTemplate.category.key;
      const envVars = integration.environmentVariableMappings
        .map((mapping) => mapping.environmentVariable.key)
        .join(", ");

      if (envVars) {
        return `- ${integrationName} (${category})
  Environment Variables: ${envVars}`;
      }
      return `- ${integrationName} (${category})`;
    })
    .join("\n");

  return `You are working on an app called ${project.title} with the following integrations:
${integrationsText}`;
}
