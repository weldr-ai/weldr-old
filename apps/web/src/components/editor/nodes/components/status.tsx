import { BrainIcon, CircleIcon, HammerIcon } from "lucide-react";

import type { DeclarationProgress } from "@weldr/shared/types/declarations";
import { Tooltip, TooltipContent, TooltipTrigger } from "@weldr/ui/components/tooltip";

export const Status = ({ progress }: { progress: DeclarationProgress }) => {
  return (
    <Tooltip>
      <TooltipTrigger className="animate-pulse space-y-2">
        {progress === "pending" && (
          <CircleIcon className="size-3 animate-pulse fill-warning text-warning" />
        )}
        {progress === "in_progress" && (
          <HammerIcon className="size-3 animate-pulse fill-warning text-warning" />
        )}
        {progress === "enriching" && (
          <BrainIcon className="size-3 animate-pulse fill-primary text-primary" />
        )}
      </TooltipTrigger>
      <TooltipContent className="border bg-muted">
        {progress === "pending" && "Pending"}
        {progress === "in_progress" && "Building"}
        {progress === "enriching" && "Enriching"}
      </TooltipContent>
    </Tooltip>
  );
};
