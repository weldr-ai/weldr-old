import { db } from "@weldr/db";

export async function getInstalledCategories(snapshotId: string) {
  const installedIntegrations = await db.query.integrationInstallations.findMany({
    where: (integrationInstallations, { and, eq }) =>
      and(
        eq(integrationInstallations.snapshotId, snapshotId),
        eq(integrationInstallations.status, "installed"),
      ),
    with: {
      integration: {
        with: {
          integrationTemplate: {
            with: {
              category: true,
            },
          },
        },
      },
    },
  });
  return installedIntegrations.map((iv) => iv.integration.integrationTemplate.category.key);
}
