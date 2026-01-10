import { ofetch } from "ofetch/node";

import { ofetchConfig } from "../ofetch-config";
import { type FlyAppType, flyApiHostname, flyApiKey } from "./config";
import { Platform } from "./platform";
import type { components, paths } from "./types";
import { Volume } from "./volume";

export namespace Machine {
  export const get = async ({
    type,
    projectId,
    machineId,
  }: {
    type: FlyAppType;
    projectId: string;
    machineId: string;
  }) => {
    try {
      const response = await ofetch<components["schemas"]["Machine"]>(
        `${flyApiHostname}/v1/apps/project-${projectId}-${type}/machines/${machineId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${flyApiKey}`,
          },
          ...ofetchConfig({ tag: `fly:machine:get:${projectId}` }),
        },
      );

      return response;
    } catch (error: unknown) {
      if ((error as { response?: { status?: number } })?.response?.status === 404) {
        return null;
      }
      throw error;
    }
  };

  export const list = async ({ type, projectId }: { type: FlyAppType; projectId: string }) => {
    const response = await ofetch<components["schemas"]["Machine"][]>(
      `${flyApiHostname}/v1/apps/project-${projectId}-${type}/machines`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${flyApiKey}`,
        },
        ...ofetchConfig({ tag: `fly:machine:list:${projectId}` }),
      },
    );

    return response;
  };

  export const create = async ({
    type,
    projectId,
    config,
    region = "us",
  }: {
    type: FlyAppType;
    projectId: string;
    config: paths["/apps/{app_name}/machines"]["post"]["requestBody"]["content"]["application/json"]["config"];
    region?: "eu" | "us";
  }) => {
    const euRegions = ["ams", "arn", "mad", "lhr", "cdg", "fra"];
    const usRegions = ["iad", "ewr", "yul", "yyz", "sjc", "lax"];
    const allRegions = [
      "iad",
      "ewr",
      "ams",
      "arn",
      "mad",
      "yul",
      "yyz",
      "lhr",
      "cdg",
      "fra",
      "sjc",
      "lax",
    ];

    const availableRegions = region === "eu" ? euRegions : region === "us" ? usRegions : allRegions;

    let lastError: Error | null = null;

    for (const region of availableRegions) {
      try {
        const response = await ofetch<
          paths["/apps/{app_name}/machines"]["post"]["responses"][200]["content"]["application/json"]
        >(`${flyApiHostname}/v1/apps/project-${projectId}-${type}/machines`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${flyApiKey}`,
          },
          body: {
            region,
            config,
          } satisfies components["schemas"]["CreateMachineRequest"],
          ...ofetchConfig({ tag: `fly:machine:create:${projectId}` }),
        });

        if (!response.id) {
          throw new Error("Failed to create machine");
        }

        // await waitUntil({
        //   type,
        //   projectId,
        //   machineId: response.id,
        //   state: "started",
        // });

        return response.id;
      } catch (error) {
        console.error("Error creating machine:", {
          error: error instanceof Error ? error.message : String(error),
          projectId,
          type,
        });
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError || new Error("Failed to create machine: All regions failed");
  };

  /**
   * Create a development machine with a volume attached in a region with available resources.
   * Uses Platform API to check for available regions before creating resources.
   * This function is only for development machines.
   */
  export const createWithVolume = async ({
    projectId,
    config,
    volumeSizeGb = 20,
    volumeMountPath = "/dev/weldr_env_vol",
    preferredRegion = "us",
  }: {
    projectId: string;
    config: paths["/apps/{app_name}/machines"]["post"]["requestBody"]["content"]["application/json"]["config"];
    volumeSizeGb?: number;
    volumeMountPath?: string;
    preferredRegion?: "eu" | "us";
  }) => {
    const type: FlyAppType = "development";
    const compute = config?.guest ?? Machine.presets.development.guest;

    const availableRegions = await Platform.getAvailableRegionsForMachineWithVolume({
      compute,
      volumeSizeGb,
      preferredRegion,
    });

    if (availableRegions.length === 0) {
      throw new Error(`No available regions found for machine with ${volumeSizeGb}GB volume`);
    }

    let lastError: Error | null = null;

    for (const region of availableRegions) {
      try {
        const volume = await Volume.create({
          type,
          projectId,
          config: {
            name: `machine-${Date.now()}`,
            region,
            size_gb: volumeSizeGb,
          },
        });

        if (!volume.id) {
          throw new Error("Failed to create volume: No volume ID returned");
        }

        const baseConfig = config ?? Machine.presets.development;
        const machineConfig = {
          ...baseConfig,
          mounts: [
            {
              volume: volume.id,
              path: volumeMountPath,
            },
          ],
          env: {
            ...(baseConfig.env ?? {}),
            PROJECT_ID: projectId,
          },
        } as paths["/apps/{app_name}/machines"]["post"]["requestBody"]["content"]["application/json"]["config"];

        const response = await ofetch<
          paths["/apps/{app_name}/machines"]["post"]["responses"][200]["content"]["application/json"]
        >(`${flyApiHostname}/v1/apps/project-${projectId}-${type}/machines`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${flyApiKey}`,
          },
          body: {
            region,
            config: machineConfig,
          } satisfies components["schemas"]["CreateMachineRequest"],
          ...ofetchConfig({ tag: `fly:machine:createWithVolume:${projectId}` }),
        });

        if (!response.id) {
          await Volume.destroy({
            type,
            projectId,
            volumeId: volume.id,
          }).catch(() => {
            // Ignore cleanup errors
          });
          throw new Error("Failed to create machine");
        }

        return {
          machineId: response.id,
          volumeId: volume.id,
          region,
        };
      } catch (error) {
        console.error("Error creating machine with volume:", {
          error: error instanceof Error ? error.message : String(error),
          projectId,
          type,
          region,
        });
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw (
      lastError || new Error("Failed to create machine with volume: All available regions failed")
    );
  };

  export const destroy = async ({
    type,
    projectId,
    machineId,
  }: {
    type: FlyAppType;
    projectId: string;
    machineId: string;
  }) => {
    try {
      await ofetch(
        `${flyApiHostname}/v1/apps/project-${projectId}-${type}/machines/${machineId}?force=true`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${flyApiKey}`,
          },
          ...ofetchConfig({ tag: `fly:machine:destroy:${projectId}` }),
        },
      );
    } catch (error) {
      if ((error as { response?: { status?: number } })?.response?.status === 404) {
        return;
      }
      throw error;
    }
  };

  export const waitUntil = async ({
    type,
    projectId,
    machineId,
    state = "started",
  }: {
    type: FlyAppType;
    projectId: string;
    machineId: string;
    state?: "started" | "stopped" | "suspended" | "destroyed";
  }) => {
    await ofetch(
      `${flyApiHostname}/v1/apps/project-${projectId}-${type}/machines/${machineId}/wait?state=${state}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${flyApiKey}`,
        },
        ...ofetchConfig({ tag: `fly:machine:waitUntil:${projectId}` }),
      },
    );
  };

  export const start = async ({
    type,
    projectId,
    machineId,
  }: {
    type: FlyAppType;
    projectId: string;
    machineId: string;
  }) => {
    await ofetch(
      `${flyApiHostname}/v1/apps/project-${projectId}-${type}/machines/${machineId}/start`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${flyApiKey}`,
        },
        ...ofetchConfig({ tag: `fly:machine:start:${projectId}` }),
      },
    );
  };

  export const presets = {
    development: {
      image: "registry.fly.io/weldr-images:weldr-agent",
      guest: {
        cpu_kind: "shared",
        cpus: 1,
        memory_mb: 1024,
      },
      env: {
        S3_ENDPOINT: "https://fly.storage.tigris.dev",
      },
      services: [
        {
          protocol: "tcp",
          internal_port: 80,
          autostop: "stop",
          autostart: true,
          ports: [
            {
              port: 443,
              handlers: ["tls", "http"],
            },
            {
              port: 80,
              handlers: ["http"],
            },
          ],
          checks: [
            {
              type: "http",
              port: 8080,
              method: "GET",
              path: "/health",
              // @ts-expect-error - Fly API types are not fully typed
              grace_period: "15s",
              // @ts-expect-error - Fly API types are not fully typed
              interval: "10s",
              // @ts-expect-error - Fly API types are not fully typed
              timeout: "5s",
            },
          ],
        },
      ],
    } satisfies paths["/apps/{app_name}/machines"]["post"]["requestBody"]["content"]["application/json"]["config"],
    preview: {
      guest: {
        cpu_kind: "shared",
        cpus: 1,
        memory_mb: 1024,
      },
      services: [
        {
          protocol: "tcp",
          internal_port: 3000,
          autostop: "stop",
          autostart: true,
          ports: [
            {
              port: 443,
              handlers: ["tls", "http"],
            },
            {
              port: 80,
              handlers: ["http"],
            },
          ],
        },
      ],
    } satisfies paths["/apps/{app_name}/machines"]["post"]["requestBody"]["content"]["application/json"]["config"],
    production: {
      guest: {
        cpu_kind: "shared",
        cpus: 1,
        memory_mb: 1024,
      },
      services: [
        {
          protocol: "tcp",
          internal_port: 3000,
          autostop: "suspend",
          autostart: true,
          ports: [
            {
              port: 443,
              handlers: ["tls", "http"],
            },
            {
              port: 80,
              handlers: ["http"],
            },
          ],
        },
      ],
    } satisfies paths["/apps/{app_name}/machines"]["post"]["requestBody"]["content"]["application/json"]["config"],
  };
}
