import { ofetch } from "ofetch/node";

import { ofetchConfig } from "../ofetch-config";
import { Tigris } from "../tigris";
import { type FlyAppType, flyApiHostname, flyApiKey, flyOrgSlug } from "./config";
import { Machine } from "./machine";
import { Secret } from "./secret";
import type { paths } from "./types";

export namespace App {
  export const get = async ({ type, projectId }: { type: FlyAppType; projectId: string }) => {
    try {
      const app = await ofetch<{ id: string }>(
        `${flyApiHostname}/v1/apps/project-${projectId}-${type}`,
        {
          headers: {
            Authorization: `Bearer ${flyApiKey}`,
          },
          ...ofetchConfig({ tag: `fly:app:get:${projectId}` }),
        },
      );
      return app;
    } catch (error) {
      if ((error as { response?: { status?: number } })?.response?.status === 404) {
        return null;
      }
      throw error;
    }
  };

  export const create = async (
    options:
      | {
          type: "development";
          projectId: string;
          branchId: string;
        }
      | {
          type: "production";
          projectId: string;
        },
  ) => {
    try {
      const app = await ofetch<{ id: string }>(`${flyApiHostname}/v1/apps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${flyApiKey}`,
        },
        body: {
          app_name: `project-${options.type}-${options.projectId}`,
          network: `net-${options.type}-${options.projectId}`,
          org_slug: flyOrgSlug,
        },
        ...ofetchConfig({ tag: `fly:app:create:${options.projectId}` }),
      });

      if (!app?.id) {
        throw new Error("Failed to create app: No app ID returned");
      }

      await allocateIpAddress({
        type: options.type,
        projectId: options.projectId,
      });

      if (options.type === "development") {
        const projectCredentials = await Tigris.credentials.create(options.projectId);
        await Tigris.bucket.create(`project-${options.projectId}-branch-${options.branchId}`);

        const productionDeployToken = await deployToken({
          type: "production",
          projectId: options.projectId,
        });

        await Promise.all([
          // Create secrets
          Secret.create({
            type: "development",
            projectId: options.projectId,
            secrets: [
              {
                key: "S3_ACCESS_KEY_ID",
                value: projectCredentials.accessKeyId,
              },
              {
                key: "S3_SECRET_ACCESS_KEY",
                value: projectCredentials.secretAccessKey,
              },
              {
                key: "FLY_PRODUCTION_DEPLOY_TOKEN",
                value: productionDeployToken,
              },
            ],
          }),
          // Create development node with volume
          Machine.createWithVolume({
            projectId: options.projectId,
            config: Machine.presets
              .development as paths["/apps/{app_name}/machines"]["post"]["requestBody"]["content"]["application/json"]["config"],
          }),
        ]);
      }

      return app.id;
    } catch (error) {
      console.error("Error creating app:", {
        error: error instanceof Error ? error.message : String(error),
        projectId: options.projectId,
        type: options.type,
      });
      await Promise.all([
        destroy({
          type: options.type,
          projectId: options.projectId,
        }),
        ...(options.type === "development"
          ? [
              Tigris.bucket.delete(`project-${options.projectId}-branch-${options.branchId}`),
              Tigris.credentials.delete(options.projectId),
            ]
          : []),
      ]);
      throw error;
    }
  };

  export const deployToken = async ({
    type,
    projectId,
  }: {
    type: FlyAppType;
    projectId: string;
  }) => {
    const deployToken = await ofetch<{
      token: string;
    }>(`${flyApiHostname}/v1/apps/project-${projectId}-${type}/deploy_token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${flyApiKey}`,
      },
      body: {
        expiry: "175200h0m0s",
      },
      ...ofetchConfig({ tag: `fly:app:create-deploy-token:${projectId}` }),
    });

    return deployToken.token;
  };

  export const allocateIpAddress = async ({
    type,
    projectId,
  }: {
    type: FlyAppType;
    projectId: string;
  }) => {
    // Allocate private IPv6 address for the app
    const ipAddress = await ofetch<{
      data: {
        allocateIpAddress: {
          ipAddress: {
            address: string;
          };
        };
      };
    }>("https://api.fly.io/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${flyApiKey}`,
      },
      body: {
        query: `
          mutation($input: AllocateIPAddressInput!) {
            allocateIpAddress(input: $input) {
              ipAddress {
                address
              }
            }
          }
        `,
        variables: {
          input: {
            appId: `project-${projectId}-${type}`,
            type: "private_v6",
          },
        },
      },
      ...ofetchConfig({ tag: `fly:app:allocate-ip-address:${projectId}` }),
    });

    if (!ipAddress?.data?.allocateIpAddress?.ipAddress?.address) {
      throw new Error("Failed to allocate IP address");
    }
  };

  export const destroy = async ({ type, projectId }: { type: FlyAppType; projectId: string }) => {
    try {
      await ofetch(`${flyApiHostname}/v1/apps/project-${projectId}-${type}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${flyApiKey}`,
        },
        ...ofetchConfig({ tag: `fly:app:destroy:${projectId}` }),
      });
    } catch (error) {
      if ((error as { response?: { status?: number } })?.response?.status === 404) {
        return;
      }
      throw error;
    }
  };
}
