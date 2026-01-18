"use client";

import { HydrationBoundary, type HydrationBoundaryProps } from "@tanstack/react-query";

export function HydrateClient(props: HydrationBoundaryProps) {
  return <HydrationBoundary {...props} />;
}
