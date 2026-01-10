import { BetterAuthIcon, ORPCIcon, PostgresIcon, TanstackIcon } from "@weldr/ui/icons";

export const getIntegrationIcon = (key: string, size: number = 5) => {
  switch (key) {
    case "postgresql":
      return <PostgresIcon className={`size-${size}`} />;
    case "better-auth":
      return <BetterAuthIcon className={`size-${size}`} />;
    case "tanstack-start":
      return <TanstackIcon className={`size-${size}`} />;
    case "orpc":
      return <ORPCIcon className={`size-${size}`} />;
    default:
      return null;
  }
};
