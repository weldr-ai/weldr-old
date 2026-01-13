import type { branches, projects, versions } from "@weldr/db/schema";

import type { User } from "@/core/auth";

export type ProjectWithConfig = typeof projects.$inferSelect & {
  integrationCategories: Set<string>;
};

export type BranchWithVersion = typeof branches.$inferSelect & {
  headVersion: typeof versions.$inferSelect;
};

export type { User };
