import { type Route, ORPCError } from "@orpc/server";
import { z } from "zod";

import { eq } from "@weldr/db";
import { integrationInstallations } from "@weldr/db/schema";
import { integrationInstallationStatusSchema } from "@weldr/shared/validators/integrations";

import { protectedProcedure } from "../../lib/procedures";
import { useDb } from "../../middlewares/db";

const definition = {
  method: "GET",
  tags: ["Integrations"],
  path: "/integrations/installations/:installationId",
  successStatus: 200,
  description: "Get installation status by installation ID",
  summary: "Get integration installation status",
} satisfies Route;

const inputSchema = z.object({
  installationId: z.string(),
});

const outputSchema = z.object({
  id: z.string(),
  integrationId: z.string(),
  snapshotId: z.string(),
  status: integrationInstallationStatusSchema,
  installedAt: z.date().nullable(),
  installationMetadata: z
    .object({
      filesCreated: z.array(z.string()).optional(),
      packagesInstalled: z.array(z.string()).optional(),
      declarationsAdded: z.array(z.string()).optional(),
      error: z.string().optional(),
    })
    .nullable(),
  integration: z.object({
    id: z.string(),
    key: z.string(),
    name: z.string().nullable(),
  }),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .output(outputSchema)
  .use(useDb)
  .handler(async ({ input, context }) => {
    const userId = context.user.id;

    // Get the installation record with its integration
    const installation = await context.db.query.integrationInstallations.findFirst({
      where: eq(integrationInstallations.id, input.installationId),
      with: {
        integration: {
          columns: {
            id: true,
            key: true,
            name: true,
            userId: true,
          },
        },
      },
    });

    if (!installation) {
      throw new ORPCError("NOT_FOUND", { message: "Installation not found" });
    }

    // Verify the user owns this integration
    if (installation.integration.userId !== userId) {
      throw new ORPCError("NOT_FOUND", { message: "Installation not found" });
    }

    return {
      id: installation.id,
      integrationId: installation.integrationId,
      snapshotId: installation.snapshotId,
      status: installation.status,
      installedAt: installation.installedAt,
      installationMetadata: installation.installationMetadata,
      integration: {
        id: installation.integration.id,
        key: installation.integration.key,
        name: installation.integration.name,
      },
    };
  });
