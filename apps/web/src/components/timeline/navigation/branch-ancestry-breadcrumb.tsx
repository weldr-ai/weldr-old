import { useParams, useRouter } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@weldr/ui/components/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@weldr/ui/components/dropdown-menu";
import { cn } from "@weldr/ui/lib/utils";

interface BranchAncestryBreadcrumbProps {
  ancestryChain: { id: string; name: string; isMain: boolean }[];
  currentBranch: { name: string; isMain: boolean };
}

export function BranchAncestryBreadcrumb({
  ancestryChain,
  currentBranch,
}: BranchAncestryBreadcrumbProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();

  if (ancestryChain.length === 0) {
    return null;
  }

  const ITEMS_TO_DISPLAY = 2;
  const visibleItems = ancestryChain.slice(-ITEMS_TO_DISPLAY);
  const hiddenItems = ancestryChain.slice(0, -ITEMS_TO_DISPLAY);

  return (
    <div className="border-b px-3 py-1.5">
      <Breadcrumb>
        <BreadcrumbList className="text-[10px]">
          {hiddenItems.length > 0 && (
            <>
              <BreadcrumbItem>
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1">
                    <BreadcrumbEllipsis className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[200px]">
                    {hiddenItems.map((ancestor) => (
                      <DropdownMenuItem
                        key={ancestor.id}
                        onClick={() => {
                          router.push(`/projects/${projectId}/branches/${ancestor.id}`);
                        }}
                        className={cn("cursor-pointer", {
                          "text-success": ancestor.isMain,
                        })}
                      >
                        {ancestor.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="[&>svg]:size-2.5" />
            </>
          )}

          {visibleItems.map((ancestor, index) => (
            <BreadcrumbItem key={ancestor.id}>
              <BreadcrumbLink
                onClick={() => {
                  router.push(`/projects/${projectId}/branches/${ancestor.id}`);
                }}
                className={cn("cursor-pointer text-[10px] hover:text-foreground", {
                  "text-success hover:text-success": ancestor.isMain,
                  "text-muted-foreground": !ancestor.isMain,
                })}
              >
                {ancestor.name}
              </BreadcrumbLink>
              {index < visibleItems.length - 1 || visibleItems.length > 0 ? (
                <BreadcrumbSeparator className="[&>svg]:size-2.5" />
              ) : null}
            </BreadcrumbItem>
          ))}

          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn("font-medium text-[10px]", {
                "text-success": currentBranch.isMain,
              })}
            >
              {currentBranch.name}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
