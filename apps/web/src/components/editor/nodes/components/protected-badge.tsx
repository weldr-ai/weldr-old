import { ShieldCheckIcon, ShieldXIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@weldr/ui/components/tooltip";

interface ProtectedBadgeProps {
  protected: boolean;
}

export const ProtectedBadge = ({ protected: isProtected }: ProtectedBadgeProps) => {
  return (
    <Tooltip>
      <TooltipTrigger>
        {isProtected ? (
          <ShieldCheckIcon className="size-3 text-success" />
        ) : (
          <ShieldXIcon className="size-3 text-destructive" />
        )}
      </TooltipTrigger>
      <TooltipContent className="border bg-muted text-xs">
        {isProtected ? "Protected" : "Unprotected"}
      </TooltipContent>
    </Tooltip>
  );
};
