import type { branches, chats, projects, snapshots } from "@weldr/db/schema";

import type { User } from "@/core/auth";

export type ProjectWithConfig = typeof projects.$inferSelect & {
  integrationCategories: Set<string>;
};

export type BranchWithSnapshot = typeof branches.$inferSelect & {
  snapshot: typeof snapshots.$inferSelect | null;
};

export type ChatWithBranch = typeof chats.$inferSelect & {
  branch: BranchWithSnapshot | null;
};

export type { User };
