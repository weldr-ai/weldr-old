import { ofetch } from "ofetch/node";

import { ofetchConfig } from "../ofetch-config";
import { flyApiHostname, flyApiKey, type FlyAppType } from "./config";
import type { components, paths } from "./types";

export namespace Volume {
  export const get = async ({
    type,
    projectId,
    volumeId,
  }: {
    type: FlyAppType;
    projectId: string;
    volumeId: string;
  }) => {
    try {
      const response = await ofetch<components["schemas"]["Volume"]>(
        `${flyApiHostname}/v1/apps/project-${projectId}-${type}/volumes/${volumeId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${flyApiKey}`,
          },
          ...ofetchConfig({ tag: `fly:volume:get:${projectId}` }),
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

  export const create = async ({
    type,
    projectId,
    config,
  }: {
    type: FlyAppType;
    projectId: string;
    config: paths["/apps/{app_name}/volumes"]["post"]["requestBody"]["content"]["application/json"];
  }) => {
    const response = await ofetch<components["schemas"]["Volume"]>(
      `${flyApiHostname}/v1/apps/project-${projectId}-${type}/volumes`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${flyApiKey}`,
        },
        body: config satisfies components["schemas"]["CreateVolumeRequest"],
        ...ofetchConfig({ tag: `fly:volume:create:${projectId}` }),
      },
    );

    return response;
  };

  export const update = async ({
    type,
    projectId,
    volumeId,
    config,
  }: {
    type: FlyAppType;
    projectId: string;
    volumeId: string;
    config: paths["/apps/{app_name}/volumes/{volume_id}"]["put"]["requestBody"]["content"]["application/json"];
  }) => {
    const response = await ofetch<components["schemas"]["Volume"]>(
      `${flyApiHostname}/v1/apps/project-${projectId}-${type}/volumes/${volumeId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${flyApiKey}`,
        },
        body: config satisfies components["schemas"]["UpdateVolumeRequest"],
        ...ofetchConfig({ tag: `fly:volume:update:${projectId}` }),
      },
    );

    return response;
  };

  export const destroy = async ({
    type,
    projectId,
    volumeId,
  }: {
    type: FlyAppType;
    projectId: string;
    volumeId: string;
  }) => {
    try {
      await ofetch(`${flyApiHostname}/v1/apps/project-${projectId}-${type}/volumes/${volumeId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${flyApiKey}`,
        },
        ...ofetchConfig({ tag: `fly:volume:destroy:${projectId}` }),
      });
    } catch (error) {
      if ((error as { response?: { status?: number } })?.response?.status === 404) {
        return;
      }
      throw error;
    }
  };

  export const extend = async ({
    type,
    projectId,
    volumeId,
    sizeGb,
  }: {
    type: FlyAppType;
    projectId: string;
    volumeId: string;
    sizeGb: number;
  }) => {
    const response = await ofetch<
      paths["/apps/{app_name}/volumes/{volume_id}/extend"]["put"]["responses"][200]["content"]["application/json"]
    >(`${flyApiHostname}/v1/apps/project-${projectId}-${type}/volumes/${volumeId}/extend`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${flyApiKey}`,
      },
      body: {
        size_gb: sizeGb,
      } satisfies components["schemas"]["ExtendVolumeRequest"],
      ...ofetchConfig({ tag: `fly:volume:extend:${projectId}` }),
    });

    return response;
  };
}
