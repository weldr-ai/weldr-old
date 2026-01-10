"use client";

import { createContext, useContext } from "react";

export const IntegrationsContext = createContext<
  {
    id: string;
    name: string;
    integrationType: "postgres";
    metadata?: unknown;
  }[]
>([]);

export function useIntegrations() {
  return useContext(IntegrationsContext);
}

export function IntegrationsProvider({
  children,
  integrations,
}: {
  children: React.ReactNode;
  integrations: {
    id: string;
    name: string;
    integrationType: "postgres";
    metadata?: unknown;
  }[];
}) {
  return (
    <IntegrationsContext.Provider value={integrations}>{children}</IntegrationsContext.Provider>
  );
}
