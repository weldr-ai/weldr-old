import { BetterAuthLogo } from "@weldr/ui/logos/better-auth";
import { ORPCLogo } from "@weldr/ui/logos/orpc";
import { PostgresLogo } from "@weldr/ui/logos/postgres";
import { TanstackLogo } from "@weldr/ui/logos/tanstack";

export const getIntegrationIcon = (key: string, size: number = 5) => {
  switch (key) {
    case "postgresql":
      return <PostgresLogo className={`size-${size}`} />;
    case "better-auth":
      return <BetterAuthLogo className={`size-${size}`} />;
    case "tanstack-start":
      return <TanstackLogo className={`size-${size}`} />;
    case "orpc":
      return <ORPCLogo className={`size-${size}`} />;
    default:
      return null;
  }
};
