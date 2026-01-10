import { db, eq } from "@weldr/db";
import { taskDependencies, tasks } from "@weldr/db/schema";
import type { Task } from "@weldr/shared/types";

import type { WorkflowContext } from "@/workflow/context";

export type TaskWithRelations = typeof tasks.$inferSelect & {
  dependencies: {
    dependency: typeof tasks.$inferSelect;
  }[];
};

export async function createTasks({
  context,
  taskList,
}: {
  context: WorkflowContext;
  taskList: Task[];
}) {
  const branch = context.get("branch");

  return await db.transaction(async (tx) => {
    const tasksMap = new Map<
      number,
      {
        numericId: number;
        dbId: string;
        dependencies: number[];
      }
    >();

    // Single pass: Create all tasks
    for (const task of taskList) {
      const [insertedTask] = await tx
        .insert(tasks)
        .values({
          data: task,
          versionId: branch.headVersion.id,
          status: "pending",
        })
        .returning();

      if (!insertedTask) {
        throw new Error("Failed to insert task");
      }

      tasksMap.set(task.id, {
        numericId: task.id,
        dbId: insertedTask.id,
        dependencies: task.dependencies || [],
      });
    }

    // Create task dependencies
    const taskDependenciesInserts: Array<{
      dependentId: string;
      dependencyId: string;
    }> = [];

    for (const insertedTask of tasksMap.values()) {
      for (const depId of insertedTask.dependencies) {
        const dependency = tasksMap.get(depId);

        if (!dependency) {
          throw new Error("Dependency task not found");
        }

        taskDependenciesInserts.push({
          dependentId: insertedTask.dbId,
          dependencyId: dependency.dbId,
        });
      }
    }

    if (taskDependenciesInserts.length > 0) {
      await tx.insert(taskDependencies).values(taskDependenciesInserts);
    }
  });
}

export async function getTasksWithDependencies(
  versionId: string,
): Promise<TaskWithRelations[]> {
  const result = await db.query.tasks.findMany({
    where: (tasks) => eq(tasks.versionId, versionId),
    with: {
      dependencies: {
        with: {
          dependency: true,
        },
      },
    },
  });

  return result;
}

export async function getTaskExecutionPlan({
  versionId,
}: {
  versionId: string;
}): Promise<TaskWithRelations[]> {
  const tasks = await getTasksWithDependencies(versionId);

  // Filter only pending and in_progress tasks (in case of restarts)
  const activeTasks = tasks.filter(
    (task) => task.status === "pending" || task.status === "in_progress",
  );

  if (activeTasks.length === 0) {
    return [];
  }

  const orderedTasks = orderTasks(activeTasks);
  return orderedTasks;
}

function orderTasks(tasks: TaskWithRelations[]): TaskWithRelations[] {
  const taskMap = new Map<string, TaskWithRelations>();
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  // Initialize in-degree and adjacency list
  for (const task of tasks) {
    inDegree.set(task.id, 0);
    adjList.set(task.id, []);
  }

  // Build the dependency graph
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      const dependencyId = dependency.dependency.id;
      const neighbors = adjList.get(dependencyId);
      if (neighbors) {
        neighbors.push(task.id);
        inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
      }
    }
  }

  // Topological sort using Kahn's algorithm
  const queue: string[] = [];
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const sortedTasks: TaskWithRelations[] = [];
  while (queue.length > 0) {
    const taskId = queue.shift();
    if (!taskId) {
      break;
    }

    const task = taskMap.get(taskId);
    if (task) {
      sortedTasks.push(task);
    }

    const neighbors = adjList.get(taskId) ?? [];
    for (const neighborId of neighbors) {
      const currentInDegree = (inDegree.get(neighborId) ?? 0) - 1;
      inDegree.set(neighborId, currentInDegree);
      if (currentInDegree === 0) {
        queue.push(neighborId);
      }
    }
  }

  // Check for circular dependencies
  if (sortedTasks.length !== tasks.length) {
    const unprocessedTasks = tasks.filter(
      (task) => !sortedTasks.find((sortedTask) => sortedTask.id === task.id),
    );
    const unprocessedTaskNames = unprocessedTasks
      .map((task) => task.data.summary ?? task.id)
      .join(", ");
    throw new Error(
      `Circular dependency detected in tasks. Could not resolve order for: ${unprocessedTaskNames}`,
    );
  }

  return sortedTasks;
}
