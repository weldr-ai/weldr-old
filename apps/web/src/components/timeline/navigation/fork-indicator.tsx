import { GitBranchIcon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@weldr/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@weldr/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@weldr/ui/components/tooltip";
import { cn } from "@weldr/ui/lib/utils";

interface ForkIndicatorProps {
  forkedBranches: { id: string; name: string; type: "variant" | "stream" }[];
  versionNumber: number;
}

export function ForkIndicator({ forkedBranches, versionNumber }: ForkIndicatorProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();

  if (forkedBranches.length === 0) {
    return null;
  }

  return (
    <Popover>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="relative z-20 size-5 rounded-full p-0 text-purple-500 hover:text-purple-500"
              >
                <GitBranchIcon className="size-3" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" className="border bg-muted text-xs">
            <p>
              {forkedBranches.length} branch
              {forkedBranches.length > 1 ? "es" : ""} forked from here
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent side="right" align="start" className="w-[240px] p-0">
        <div className="flex flex-col">
          <div className="border-b px-2.5 py-1.5">
            <p className="font-medium text-xs">Navigate to Branch</p>
            <p className="text-[11px] text-muted-foreground">
              Branches forked from #{versionNumber}
            </p>
          </div>
          <div className="flex flex-col gap-0.5 p-1">
            {forkedBranches.map((branch) => (
              <Button
                key={branch.id}
                variant="ghost"
                onClick={() => {
                  router.push(`/projects/${projectId}/branches/${branch.id}`);
                }}
                className={cn(
                  "h-auto justify-start gap-1.5 rounded-none px-2 py-1 text-left text-xs hover:bg-accent",
                  {
                    "border-purple-500 border-l-2": branch.type === "stream",
                    "border-orange-500 border-l-2": branch.type === "variant",
                  },
                )}
              >
                <div className="flex flex-col gap-0">
                  <span className="font-medium">{branch.name}</span>
                  <span className="text-[11px] text-muted-foreground capitalize">
                    {branch.type}
                  </span>
                </div>
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
