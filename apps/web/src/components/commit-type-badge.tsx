// Component to render styled commit type badge
export function CommitTypeBadge({ type, className }: { type: string | null; className?: string }) {
  if (!type) return null;

  const getTypeStyles = (type: string) => {
    switch (type.toLowerCase()) {
      case "feat":
      case "feature":
        return "bg-emerald-500/10 text-emerald-500";
      case "fix":
        return "bg-red-500/10 text-red-500";
      case "docs":
        return "bg-blue-500/10 text-blue-500";
      case "style":
        return "bg-purple-500/10 text-purple-500";
      case "refactor":
        return "bg-cyan-500/10 text-cyan-500";
      case "test":
        return "bg-yellow-500/10 text-yellow-500";
      case "chore":
        return "bg-gray-500/10 text-gray-500";
      case "perf":
        return "bg-orange-500/10 text-orange-500";
      case "ci":
        return "bg-indigo-500/10 text-indigo-500";
      case "build":
        return "bg-pink-500/10 text-pink-500";
      case "revert":
        return "bg-orange-500/10 text-orange-500";
      case "pending":
        return "bg-yellow-500/10 text-yellow-500";
      default:
        return "bg-gray-500/10 text-gray-500";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type.toLowerCase()) {
      case "feat":
        return "Feature";
      case "fix":
        return "Fix";
      case "docs":
        return "Docs";
      case "style":
        return "Style";
      case "refactor":
        return "Refactor";
      case "test":
        return "Test";
      case "chore":
        return "Chore";
      case "perf":
        return "Perf";
      case "ci":
        return "CI";
      case "build":
        return "Build";
      case "revert":
        return "Revert";
      case "pending":
        return "Pending";
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-medium text-[10px] ${getTypeStyles(type)} ${className}`}
    >
      {getTypeLabel(type)}
    </span>
  );
}
