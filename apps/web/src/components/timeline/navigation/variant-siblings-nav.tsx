import { useParams, useRouter } from "next/navigation";

import { Button } from "@weldr/ui/components/button";

interface VariantSiblingsNavProps {
  siblings: { id: string; name: string; status: "active" | "archived" }[];
}

export function VariantSiblingsNav({ siblings }: VariantSiblingsNavProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();

  if (siblings.length === 0) {
    return null;
  }

  return (
    <div className="scrollbar-thin scrollbar-thumb-rounded-full scrollbar-thumb-muted-foreground scrollbar-track-transparent flex items-center gap-2 overflow-x-auto border-b bg-orange-500/10 px-3 py-1.5">
      <span className="shrink-0 text-[10px] text-muted-foreground">Variants:</span>
      <div className="flex items-center gap-1">
        {siblings.map((sibling) => {
          const isArchived = sibling.status === "archived";
          return (
            <Button
              key={sibling.id}
              variant="ghost"
              size="sm"
              onClick={() => {
                router.push(`/projects/${projectId}/branches/${sibling.id}`);
              }}
              className={`h-auto shrink-0 rounded-md px-1.5 py-0.5 font-medium text-[10px] ${
                isArchived
                  ? "hover:!bg-muted/70 hover:!text-muted-foreground/80 bg-muted/50 text-muted-foreground/60 line-through decoration-1"
                  : "hover:!bg-orange-500/20 hover:!text-orange-500 bg-orange-500/10 text-orange-500"
              }`}
            >
              {sibling.name}
              {isArchived && (
                <span className="ml-1 text-[9px] no-underline opacity-80">(archived)</span>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
