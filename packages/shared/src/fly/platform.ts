import { ofetch } from "ofetch/node";

import { ofetchConfig } from "../ofetch-config";
import { flyApiHostname, flyApiKey, flyOrgSlug } from "./config";
import type { components, paths } from "./types";

export namespace Platform {
  // Region ordering matches Machine.create
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

  /**
   * Get all regions with their current Machine capacity
   */
  export const getRegions = async ({
    compute,
  }: {
    compute?: components["schemas"]["fly.MachineGuest"];
  } = {}) => {
    const params = new URLSearchParams();

    if (compute) {
      if (compute.cpu_kind) {
        params.append("cpu_kind", compute.cpu_kind);
      }
      if (compute.cpus !== undefined) {
        params.append("cpus", String(compute.cpus));
      }
      if (compute.memory_mb !== undefined) {
        params.append("memory_mb", String(compute.memory_mb));
      }
    }

    const response = await ofetch<
      paths["/platform/regions"]["get"]["responses"][200]["content"]["application/json"]
    >(`${flyApiHostname}/v1/platform/regions${params.toString() ? `?${params.toString()}` : ""}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${flyApiKey}`,
      },
      ...ofetchConfig({ tag: "fly:platform:getRegions" }),
    });

    return response;
  };

  /**
   * Simulate placing machines into regions based on available capacity.
   * Returns regions ordered by preference/availability.
   */
  export const getPlacements = async ({
    compute,
    count = 1,
    region,
    volumeName,
    volumeSizeGb,
    weights,
  }: {
    compute?: components["schemas"]["fly.MachineGuest"];
    count?: number;
    region?: string;
    volumeName?: string;
    volumeSizeGb?: number;
    weights?: components["schemas"]["placement.Weights"];
  }) => {
    if (!flyOrgSlug) {
      throw new Error("FLY_ORG_SLUG environment variable is required");
    }

    const response = await ofetch<
      paths["/platform/placements"]["post"]["responses"][200]["content"]["application/json"]
    >(`${flyApiHostname}/v1/platform/placements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${flyApiKey}`,
      },
      body: {
        org_slug: flyOrgSlug,
        compute,
        count,
        region,
        volume_name: volumeName,
        volume_size_bytes: volumeSizeGb ? volumeSizeGb * 1024 * 1024 * 1024 : undefined,
        weights,
      } satisfies components["schemas"]["main.getPlacementsRequest"],
      ...ofetchConfig({ tag: "fly:platform:getPlacements" }),
    });

    return response;
  };

  /**
   * Get available regions ordered by preference for creating machines with volumes.
   * Checks both machine capacity and volume availability.
   * Uses the same region ordering as Machine.create.
   */
  export const getAvailableRegionsForMachineWithVolume = async ({
    compute,
    volumeSizeGb = 20,
    preferredRegion = "us",
  }: {
    compute?: components["schemas"]["fly.MachineGuest"];
    volumeSizeGb?: number;
    preferredRegion?: "eu" | "us";
  }) => {
    // Determine which regions to check based on preferred region
    const regionsToCheck =
      preferredRegion === "eu" ? euRegions : preferredRegion === "us" ? usRegions : allRegions;

    // Build region expression from the preferred regions
    const regionExpression = regionsToCheck.join(",");

    const placements = await getPlacements({
      compute,
      count: 1,
      region: regionExpression,
      volumeSizeGb,
    });

    // Get available regions from placements (those with count > 0)
    const availableRegions =
      placements.regions
        ?.filter((r) => (r.count ?? 0) > 0)
        .map((r) => r.region)
        .filter((r): r is string => !!r) ?? [];

    // Sort available regions according to the preferred order
    // This maintains the machine creation order preference
    const orderedRegions = regionsToCheck.filter((region) => availableRegions.includes(region));

    // Add any available regions not in our preferred list at the end
    const remainingRegions = availableRegions.filter((region) => !orderedRegions.includes(region));

    return [...orderedRegions, ...remainingRegions];
  };

  /**
   * Get the best available region for creating a machine with volume.
   * Returns the first available region from the placement check.
   * Uses the same region ordering as Machine.create.
   */
  export const getBestRegionForMachineWithVolume = async ({
    compute,
    volumeSizeGb = 20,
    preferredRegion = "us",
  }: {
    compute?: components["schemas"]["fly.MachineGuest"];
    volumeSizeGb?: number;
    preferredRegion?: "eu" | "us";
  }) => {
    const regions = await getAvailableRegionsForMachineWithVolume({
      compute,
      volumeSizeGb,
      preferredRegion,
    });

    return regions[0] ?? null;
  };
}
