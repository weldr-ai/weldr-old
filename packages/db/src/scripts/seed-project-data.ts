import type { AssistantContent, ToolContent, UserContent } from "ai";
import { eq } from "drizzle-orm";

import type { EndpointDeclarationSpecs } from "@weldr/shared/types/declarations";

import { db } from "..";
import {
  branches,
  chatMessages,
  chats,
  declarations,
  integrationInstallations,
  integrations,
  nodes,
  projects,
  snapshotDeclarations,
  snapshots,
} from "../schema";

/**
 * Seed project data with branches, versions, chats, messages, integrations, and declarations
 */
export async function seedProjectData(userId: string): Promise<void> {
  console.log("🌱 Seeding project data...");

  try {
    await db.transaction(async (tx) => {
      // 1. Create project
      const [project] = await tx
        .insert(projects)
        .values({
          title: "Task Management App",
          description: "A comprehensive task management application",
          subdomain: `task-app-${Date.now()}`,
          userId,
        })
        .returning();

      if (!project) {
        throw new Error("Failed to create project");
      }

      console.log(`  ✅ Created project: ${project.id}`);

      // 2. Query integration templates for the four categories
      const integrationTemplates = await tx.query.integrationTemplates.findMany({
        where: (templates, { inArray }) =>
          inArray(templates.key, ["orpc", "tanstack-start", "postgresql", "better-auth"]),
        with: {
          category: true,
        },
      });

      const templateMap = new Map(integrationTemplates.map((t) => [t.key, t]));

      if (templateMap.size < 4) {
        console.warn(`  ⚠️  Warning: Expected 4 integration templates, found ${templateMap.size}`);
      }

      // 3. Create integrations
      const createdIntegrations: Array<{ id: string }> = [];
      for (const template of templateMap.values()) {
        const [integration] = await tx
          .insert(integrations)
          .values({
            key: template.key as "orpc" | "tanstack-start" | "postgresql" | "better-auth",
            name: template.name,
            projectId: project.id,
            userId,
            integrationTemplateId: template.id,
            options: template.recommendedOptions || null,
          })
          .returning();
        if (!integration) {
          throw new Error(`Failed to create integration: ${template.key}`);
        }
        createdIntegrations.push(integration);
      }

      console.log(`  ✅ Created ${createdIntegrations.length} integrations`);

      // 4. Create main branch
      const [mainBranch] = await tx
        .insert(branches)
        .values({
          name: "main",
          userId,
          projectId: project.id,
          createdBy: userId,
        })
        .returning();

      if (!mainBranch) {
        throw new Error("Failed to create main branch");
      }

      console.log(`  ✅ Created main branch: ${mainBranch.id}`);

      // 5. Create main v1 chat and version
      const [mainV1Chat] = await tx
        .insert(chats)
        .values({
          projectId: project.id,
          userId,
        })
        .returning();

      if (!mainV1Chat) {
        throw new Error("Failed to create main v1 chat");
      }

      // Create integration config tool call message
      const toolCallId = `tool-call-${Date.now()}`;
      const assistantContent: Exclude<AssistantContent, string> = [
        {
          type: "text",
          text: "I'll help you set up the necessary integrations for your task management app.",
        },
        {
          type: "tool-call",
          toolCallId,
          toolName: "add_integrations",
          input: {
            categories: ["backend", "frontend", "database", "authentication"],
          },
        },
      ];
      await tx.insert(chatMessages).values({
        role: "assistant",
        chatId: mainV1Chat.id,
        content: assistantContent,
      });

      // Create tool result message
      const toolContent: ToolContent = [
        {
          type: "tool-result",
          toolCallId,
          toolName: "add_integrations",
          output: {
            type: "json",
            value: {
              status: "awaiting_config",
              categories: ["backend", "frontend", "database", "authentication"],
            },
          },
        },
      ];
      await tx.insert(chatMessages).values({
        role: "tool",
        chatId: mainV1Chat.id,
        content: toolContent,
      });

      // Create user/assistant messages for main v1
      const userContent1: Exclude<UserContent, string> = [
        {
          type: "text",
          text: "I want to build a task management app. Can you help me set it up?",
        },
      ];
      const assistantContent1: Exclude<AssistantContent, string> = [
        {
          type: "text",
          text: "Absolutely! I'll help you set up a task management app. Let me configure the necessary integrations first.",
        },
      ];
      const userContent2: Exclude<UserContent, string> = [
        {
          type: "text",
          text: "Great! I need features for creating tasks, organizing them by projects, and user authentication.",
        },
      ];
      const assistantContent2: Exclude<AssistantContent, string> = [
        {
          type: "text",
          text: "Perfect! I've set up the integrations. Now I'll create the database models for users, tasks, and projects, along with the API endpoints and pages. This will give you a complete foundation for your task management app.",
        },
      ];
      const mainV1Messages: Array<typeof chatMessages.$inferInsert> = [
        {
          role: "user",
          chatId: mainV1Chat.id,
          userId,
          content: userContent1,
        },
        {
          role: "assistant",
          chatId: mainV1Chat.id,
          content: assistantContent1,
        },
        {
          role: "user",
          chatId: mainV1Chat.id,
          userId,
          content: userContent2,
        },
        {
          role: "assistant",
          chatId: mainV1Chat.id,
          content: assistantContent2,
        },
      ];

      await tx.insert(chatMessages).values(mainV1Messages);

      const [mainV1] = await tx
        .insert(snapshots)
        .values({
          projectId: project.id,
          userId,
          createdBy: userId,
          title: "feat: initialize task management app with core integrations",
          description:
            "Sets up the initial project with database models for users, tasks, and projects, along with API endpoints and pages.",
        })
        .returning();

      if (!mainV1) {
        throw new Error("Failed to create main v1");
      }

      // Update main branch head
      await tx
        .update(branches)
        .set({ snapshotId: mainV1.id })
        .where(eq(branches.id, mainBranch.id));

      console.log(`  ✅ Created main v1: ${mainV1.id}`);

      // 6. Create integration installation for main v1
      for (const integration of createdIntegrations) {
        if (!integration) continue;
        await tx.insert(integrationInstallations).values({
          integrationId: integration.id,
          snapshotId: mainV1.id,
          status: "installed",
          installedAt: new Date(),
          installationMetadata: {
            filesCreated: [],
            packagesInstalled: [],
            declarationsAdded: [],
          },
        });
      }

      console.log(`  ✅ Created integration installations for main v1`);

      // 7. Create all declarations in main v1
      const declarationsData = createDeclarations(project.id, userId);
      const createdDeclarations: Array<{ id: string }> = [];

      // Calculate positions for nodes in a grid layout
      // Organize by type: db models (y=0), endpoints (y=200), pages (y=400)
      let dbModelIndex = 0;
      let endpointIndex = 0;
      let pageIndex = 0;
      const gridSpacing = 150;

      for (const declData of declarationsData) {
        // Determine position based on declaration type
        let position: { x: number; y: number };
        const declType = declData.metadata?.specs?.type;

        if (declType === "db-model") {
          position = { x: dbModelIndex * gridSpacing, y: 0 };
          dbModelIndex++;
        } else if (declType === "endpoint") {
          position = { x: endpointIndex * gridSpacing, y: 200 };
          endpointIndex++;
        } else if (declType === "page") {
          position = { x: pageIndex * gridSpacing, y: 400 };
          pageIndex++;
        } else {
          // Default position for unknown types
          position = { x: 0, y: 600 };
        }

        // Create node for the declaration
        const [node] = await tx
          .insert(nodes)
          .values({
            projectId: project.id,
            userId,
            position,
          })
          .returning();

        if (!node) {
          throw new Error("Failed to create node");
        }

        // Create declaration with nodeId
        const [declaration] = await tx
          .insert(declarations)
          .values({
            ...declData,
            nodeId: node.id,
          })
          .returning();
        if (!declaration) {
          throw new Error("Failed to create declaration");
        }
        createdDeclarations.push(declaration);

        // Link to main v1
        await tx.insert(snapshotDeclarations).values({
          snapshotId: mainV1.id,
          declarationId: declaration.id,
        });
      }

      console.log(`  ✅ Created ${createdDeclarations.length} declarations with nodes in main v1`);

      // 8. Create main v2
      const [mainV2Chat] = await tx
        .insert(chats)
        .values({
          projectId: project.id,
          userId,
        })
        .returning();

      if (!mainV2Chat) {
        throw new Error("Failed to create main v2 chat");
      }

      const mainV2Messages = createRealisticMessages(mainV2Chat.id, userId, [
        "I'd like to add filtering and sorting to the tasks list.",
        "That's a great feature! I'll add query parameters to the GET /api/tasks endpoint to support filtering by status, project, and sorting by date or priority.",
      ]);

      await tx.insert(chatMessages).values(mainV2Messages);

      const [mainV2] = await tx
        .insert(snapshots)
        .values({
          projectId: project.id,
          userId,
          createdBy: userId,
          title: "feat: add filtering and sorting to tasks endpoint",
          description:
            "Adds query parameters to the GET /api/tasks endpoint to filter tasks by status and project, and sort by date or priority.",
        })
        .returning();

      if (!mainV2) {
        throw new Error("Failed to create main v2");
      }

      // Link all declarations to main v2
      for (const decl of createdDeclarations) {
        await tx.insert(snapshotDeclarations).values({
          snapshotId: mainV2.id,
          declarationId: decl.id,
        });
      }

      await tx
        .update(branches)
        .set({ snapshotId: mainV2.id })
        .where(eq(branches.id, mainBranch.id));

      console.log(`  ✅ Created main v2: ${mainV2.id}`);

      // 9. Create main v3 (revert of v2)
      const [mainV3Chat] = await tx
        .insert(chats)
        .values({
          projectId: project.id,
          userId,
        })
        .returning();

      if (!mainV3Chat) {
        throw new Error("Failed to create main v3 chat");
      }

      const mainV3Messages = createRealisticMessages(mainV3Chat.id, userId, [
        "Can we add a search feature to find tasks by title?",
        "Sure! I'll add a search query parameter to filter tasks by title.",
        "Perfect! That will make it easier to find specific tasks.",
        "Done! You can now search tasks by title using the search parameter.",
      ]);

      await tx.insert(chatMessages).values(mainV3Messages);

      const [mainV3] = await tx
        .insert(snapshots)
        .values({
          projectId: project.id,
          userId,
          createdBy: userId,
          title: "feat: add search functionality to tasks endpoint",
          description:
            "Adds a search query parameter to the GET /api/tasks endpoint to filter tasks by title.",
        })
        .returning();

      if (!mainV3) {
        throw new Error("Failed to create main v3");
      }

      // Link all declarations to main v3
      for (const decl of createdDeclarations) {
        await tx.insert(snapshotDeclarations).values({
          snapshotId: mainV3.id,
          declarationId: decl.id,
        });
      }

      await tx
        .update(branches)
        .set({ snapshotId: mainV3.id })
        .where(eq(branches.id, mainBranch.id));

      console.log(`  ✅ Created main v3: ${mainV3.id}`);

      // 10. Create stream branch
      const [streamBranch] = await tx
        .insert(branches)
        .values({
          name: "feature/task-comments",
          projectId: project.id,
          userId,
          createdBy: userId,
        })
        .returning();

      if (!streamBranch) {
        throw new Error("Failed to create stream branch");
      }

      console.log(`  ✅ Created stream branch: ${streamBranch.id}`);

      // 11. Create stream v1
      const [streamV1Chat] = await tx
        .insert(chats)
        .values({
          projectId: project.id,
          userId,
        })
        .returning();

      if (!streamV1Chat) {
        throw new Error("Failed to create stream v1 chat");
      }

      const streamV1Messages = createRealisticMessages(streamV1Chat.id, userId, [
        "I'd like to add comments to tasks so users can discuss them.",
        "Good idea! I'll add a comments field to the tasks model and update the task detail page to show comments.",
      ]);

      await tx.insert(chatMessages).values(streamV1Messages);

      const [streamV1] = await tx
        .insert(snapshots)
        .values({
          projectId: project.id,
          userId,
          createdBy: userId,
          title: "feat: add comments to tasks",
          description:
            "Adds a comments field to the tasks model and updates the task detail page to display and manage comments.",
        })
        .returning();

      if (!streamV1) {
        throw new Error("Failed to create stream v1");
      }

      // Link all declarations to stream v1
      for (const decl of createdDeclarations) {
        await tx.insert(snapshotDeclarations).values({
          snapshotId: streamV1.id,
          declarationId: decl.id,
        });
      }

      await tx
        .update(branches)
        .set({ snapshotId: streamV1.id })
        .where(eq(branches.id, streamBranch.id));

      console.log(`  ✅ Created stream v1: ${streamV1.id}`);

      // 12. Create stream v2
      const [streamV2Chat] = await tx
        .insert(chats)
        .values({
          projectId: project.id,
          userId,
        })
        .returning();

      if (!streamV2Chat) {
        throw new Error("Failed to create stream v2 chat");
      }

      const streamV2Messages = createRealisticMessages(streamV2Chat.id, userId, [
        "The comments feature looks good. Can we add the ability to edit and delete comments?",
        "Sure! I'll add endpoints to update and delete comments.",
      ]);

      await tx.insert(chatMessages).values(streamV2Messages);

      const [streamV2] = await tx
        .insert(snapshots)
        .values({
          projectId: project.id,
          userId,
          createdBy: userId,
          title: "feat: add edit and delete functionality for comments",
          description: "Adds API endpoints to update and delete task comments.",
        })
        .returning();

      if (!streamV2) {
        throw new Error("Failed to create stream v2");
      }

      // Link all declarations to stream v2
      for (const decl of createdDeclarations) {
        await tx.insert(snapshotDeclarations).values({
          snapshotId: streamV2.id,
          declarationId: decl.id,
        });
      }

      await tx
        .update(branches)
        .set({ snapshotId: streamV2.id })
        .where(eq(branches.id, streamBranch.id));

      console.log(`  ✅ Created stream v2: ${streamV2.id}`);

      // 13. Create main v4 (integration from stream)
      // Integration versions don't have chat, but chatId is required, so create empty chat
      const [mainV4Chat] = await tx
        .insert(chats)
        .values({
          projectId: project.id,
          userId,
        })
        .returning();

      if (!mainV4Chat) {
        throw new Error("Failed to create main v4 chat");
      }

      const [mainV4] = await tx
        .insert(snapshots)
        .values({
          projectId: project.id,
          userId,
          createdBy: userId,
          title: "feat: integrate task comments from stream branch",
          description:
            "Merges the task comments feature from the stream branch into main, including the ability to add, edit, and delete comments on tasks.",
        })
        .returning();

      if (!mainV4) {
        throw new Error("Failed to create main v4");
      }

      // Link all declarations to main v4
      for (const decl of createdDeclarations) {
        await tx.insert(snapshotDeclarations).values({
          snapshotId: mainV4.id,
          declarationId: decl.id,
        });
      }

      await tx
        .update(branches)
        .set({ snapshotId: mainV4.id })
        .where(eq(branches.id, mainBranch.id));

      console.log(`  ✅ Created main v4 (integration): ${mainV4.id}`);

      // 14. Create variant branches
      const [variant1Branch] = await tx
        .insert(branches)
        .values({
          name: "variant/alternative-ui",
          projectId: project.id,
          userId,
          createdBy: userId,
        })
        .returning();

      if (!variant1Branch) {
        throw new Error("Failed to create variant1 branch");
      }

      const [variant2Branch] = await tx
        .insert(branches)
        .values({
          name: "variant/card-based-ui",
          projectId: project.id,
          userId,
          createdBy: userId,
        })
        .returning();

      if (!variant2Branch) {
        throw new Error("Failed to create variant2 branch");
      }

      console.log(`  ✅ Created variant branches: ${variant1Branch.id}, ${variant2Branch.id}`);

      // 15. Create variant-1 v1
      const [variant1V1Chat] = await tx
        .insert(chats)
        .values({
          projectId: project.id,
          userId,
        })
        .returning();

      if (!variant1V1Chat) {
        throw new Error("Failed to create variant1 v1 chat");
      }

      const variant1V1Messages = createRealisticMessages(variant1V1Chat.id, userId, [
        "I want to try a different UI approach for the tasks list - maybe a table view.",
        "Good idea! I'll create a table-based UI for tasks with sortable columns.",
        "That sounds more organized for managing many tasks.",
        "Exactly! The table view will make it easier to scan and manage multiple tasks at once.",
      ]);

      await tx.insert(chatMessages).values(variant1V1Messages);

      const [variant1V1] = await tx
        .insert(snapshots)
        .values({
          projectId: project.id,
          userId,
          createdBy: userId,
          title: "feat: implement table-based UI for tasks list",
          description:
            "Creates a table-based layout for displaying tasks with sortable columns for title, status, priority, and due date.",
        })
        .returning();

      if (!variant1V1) {
        throw new Error("Failed to create variant1 v1");
      }

      // Link all declarations to variant-1 v1
      for (const decl of createdDeclarations) {
        await tx.insert(snapshotDeclarations).values({
          snapshotId: variant1V1.id,
          declarationId: decl.id,
        });
      }

      await tx
        .update(branches)
        .set({ snapshotId: variant1V1.id })
        .where(eq(branches.id, variant1Branch.id));

      console.log(`  ✅ Created variant-1 v1: ${variant1V1.id}`);

      // 16. Create variant-1 v2
      const [variant1V2Chat] = await tx
        .insert(chats)
        .values({
          projectId: project.id,
          userId,
        })
        .returning();

      if (!variant1V2Chat) {
        throw new Error("Failed to create variant1 v2 chat");
      }

      const variant1V2Messages = createRealisticMessages(variant1V2Chat.id, userId, [
        "The table view is working well. Can we add bulk actions?",
        "Sure! I'll add checkboxes and bulk action buttons for selecting and managing multiple tasks.",
        "That will make task management much more efficient.",
        "Absolutely! Bulk actions will streamline workflows for power users.",
      ]);

      await tx.insert(chatMessages).values(variant1V2Messages);

      const [variant1V2] = await tx
        .insert(snapshots)
        .values({
          projectId: project.id,
          userId,
          createdBy: userId,
          title: "feat: add bulk actions to table-based tasks view",
          description:
            "Adds checkbox selection and bulk action buttons to update or delete multiple tasks at once.",
        })
        .returning();

      if (!variant1V2) {
        throw new Error("Failed to create variant1 v2");
      }

      // Link all declarations to variant-1 v2
      for (const decl of createdDeclarations) {
        await tx.insert(snapshotDeclarations).values({
          snapshotId: variant1V2.id,
          declarationId: decl.id,
        });
      }

      await tx
        .update(branches)
        .set({ snapshotId: variant1V2.id })
        .where(eq(branches.id, variant1Branch.id));

      console.log(`  ✅ Created variant-1 v2: ${variant1V2.id}`);

      // 17. Create variant-2 v1
      const [variant2V1Chat] = await tx
        .insert(chats)
        .values({
          projectId: project.id,
          userId,
        })
        .returning();

      if (!variant2V1Chat) {
        throw new Error("Failed to create variant2 v1 chat");
      }

      const variant2V1Messages = createRealisticMessages(variant2V1Chat.id, userId, [
        "I'd like to try a card-based UI instead of a list for tasks.",
        "Great choice! I'll create a card-based layout with drag-and-drop support.",
        "That will make it more visual and interactive.",
        "Exactly! The card-based UI will provide a more modern and engaging experience.",
      ]);

      await tx.insert(chatMessages).values(variant2V1Messages);

      const [variant2V1] = await tx
        .insert(snapshots)
        .values({
          projectId: project.id,
          userId,
          createdBy: userId,
          title: "feat: implement card-based UI for tasks",
          description:
            "Creates a card-based layout for displaying tasks with drag-and-drop support to reorder tasks.",
        })
        .returning();

      if (!variant2V1) {
        throw new Error("Failed to create variant2 v1");
      }

      // Link all declarations to variant-2 v1
      for (const decl of createdDeclarations) {
        await tx.insert(snapshotDeclarations).values({
          snapshotId: variant2V1.id,
          declarationId: decl.id,
        });
      }

      await tx
        .update(branches)
        .set({ snapshotId: variant2V1.id })
        .where(eq(branches.id, variant2Branch.id));

      console.log(`  ✅ Created variant-2 v1: ${variant2V1.id}`);

      // 18. Create variant-2 v2
      const [variant2V2Chat] = await tx
        .insert(chats)
        .values({
          projectId: project.id,
          userId,
        })
        .returning();

      if (!variant2V2Chat) {
        throw new Error("Failed to create variant2 v2 chat");
      }

      const variant2V2Messages = createRealisticMessages(variant2V2Chat.id, userId, [
        "The card view looks great! Can we add kanban-style columns?",
        "Absolutely! I'll organize cards into columns like 'To Do', 'In Progress', and 'Done'.",
        "That will make task management more visual and intuitive.",
        "Perfect! The kanban board will provide a clear workflow visualization.",
      ]);

      await tx.insert(chatMessages).values(variant2V2Messages);

      const [variant2V2] = await tx
        .insert(snapshots)
        .values({
          projectId: project.id,
          userId,
          createdBy: userId,
          title: "feat: add kanban board columns to card-based tasks view",
          description:
            "Organizes task cards into kanban columns (To Do, In Progress, Done) with drag-and-drop to move tasks between columns.",
        })
        .returning();

      if (!variant2V2) {
        throw new Error("Failed to create variant2 v2");
      }

      // Link all declarations to variant-2 v2
      for (const decl of createdDeclarations) {
        await tx.insert(snapshotDeclarations).values({
          snapshotId: variant2V2.id,
          declarationId: decl.id,
        });
      }

      await tx
        .update(branches)
        .set({ snapshotId: variant2V2.id })
        .where(eq(branches.id, variant2Branch.id));

      console.log(`  ✅ Created variant-2 v2: ${variant2V2.id}`);

      console.log("🌱 Project data seeding completed successfully!");
    });
  } catch (error) {
    console.error("❌ Error seeding project data:", error);
    throw error;
  }
}

/**
 * Create realistic user/assistant messages
 */
function createRealisticMessages(
  chatId: string,
  userId: string,
  conversation: string[],
): Array<typeof chatMessages.$inferInsert> {
  const messages: Array<typeof chatMessages.$inferInsert> = [];
  for (let i = 0; i < conversation.length; i++) {
    const isUser = i % 2 === 0;
    const text = conversation[i];
    if (!text) continue;
    const textContent = [
      {
        type: "text" as const,
        text,
      },
    ];
    if (isUser) {
      const userContent: Exclude<UserContent, string> = textContent;
      messages.push({
        role: "user",
        chatId,
        userId,
        content: userContent,
      });
    } else {
      const assistantContent: Exclude<AssistantContent, string> = textContent;
      messages.push({
        role: "assistant",
        chatId,
        content: assistantContent,
      });
    }
  }
  return messages;
}

/**
 * Create all declarations for the app
 */
function createDeclarations(
  projectId: string,
  userId: string,
): Array<typeof declarations.$inferInsert> {
  const decls: Array<typeof declarations.$inferInsert> = [];

  // DB Models
  decls.push({
    version: "v1",
    uri: "db://users",
    path: "src/db/schema/users.ts",
    progress: "completed",
    projectId,
    userId,
    metadata: {
      version: "v1",
      codeMetadata: {
        type: "type",
        name: "users",
        isExported: true,
        uri: "db://users",
        position: {
          start: { line: 1, column: 1 },
          end: { line: 20, column: 1 },
        },
        dependencies: [],
      },
      specs: {
        type: "db-model" as const,
        name: "users",
        columns: [
          {
            name: "id",
            type: "text",
            required: true,
            isPrimaryKey: true,
            nullable: false,
          },
          { name: "name", type: "text", required: true, nullable: false },
          {
            name: "email",
            type: "text",
            required: true,
            unique: true,
            nullable: false,
          },
          { name: "password", type: "text", required: true, nullable: false },
          {
            name: "created_at",
            type: "timestamp",
            required: true,
            nullable: false,
          },
          { name: "updated_at", type: "timestamp", nullable: true },
        ],
        relationships: [],
        indexes: [{ name: "users_email_idx", columns: ["email"], unique: true }],
      },
      semanticData: {
        summary: "User database model storing authentication and profile information",
        description:
          "The users table stores all user accounts with email authentication. It includes basic profile information and timestamps for account creation and updates.",
        tags: ["database", "authentication", "user-management"],
        usagePattern: {
          commonUseCases: ["User registration and login", "User profile management"],
        },
      },
    },
  });

  decls.push({
    version: "v1",
    uri: "db://tasks",
    path: "src/db/schema/tasks.ts",
    progress: "completed",
    projectId,
    userId,
    metadata: {
      version: "v1",
      codeMetadata: {
        type: "type",
        name: "tasks",
        isExported: true,
        uri: "db://tasks",
        position: {
          start: { line: 1, column: 1 },
          end: { line: 25, column: 1 },
        },
        dependencies: [
          {
            type: "internal",
            filePath: "src/db/schema/users.ts",
            dependsOn: ["db://users"],
          },
        ],
      },
      specs: {
        type: "db-model" as const,
        name: "tasks",
        columns: [
          {
            name: "id",
            type: "text",
            required: true,
            isPrimaryKey: true,
            nullable: false,
          },
          { name: "title", type: "text", required: true, nullable: false },
          { name: "description", type: "text", nullable: true },
          {
            name: "status",
            type: "text",
            required: true,
            default: "todo",
            nullable: false,
          },
          {
            name: "priority",
            type: "text",
            nullable: true,
            default: "medium",
          },
          { name: "user_id", type: "text", required: true, nullable: false },
          { name: "project_id", type: "text", nullable: true },
          { name: "due_date", type: "timestamp", nullable: true },
          {
            name: "created_at",
            type: "timestamp",
            required: true,
            nullable: false,
          },
          { name: "updated_at", type: "timestamp", nullable: true },
        ],
        relationships: [
          {
            type: "manyToOne",
            referencedModel: "users",
            referencedColumn: "id",
            onDelete: "CASCADE",
          },
          {
            type: "manyToOne",
            referencedModel: "projects",
            referencedColumn: "id",
            onDelete: "SET_NULL",
          },
        ],
        indexes: [
          { name: "tasks_user_id_idx", columns: ["user_id"] },
          { name: "tasks_project_id_idx", columns: ["project_id"] },
          { name: "tasks_status_idx", columns: ["status"] },
        ],
      },
      semanticData: {
        summary:
          "Task database model for storing user tasks with status, priority, and project associations",
        description:
          "The tasks table stores individual tasks that belong to users and optionally to projects. It tracks task status, priority, due dates, and relationships to users and projects.",
        tags: ["database", "task-management", "core-entity"],
        usagePattern: {
          commonUseCases: [
            "Creating and managing tasks",
            "Organizing tasks by project",
            "Tracking task status and priority",
          ],
        },
      },
    },
  });

  decls.push({
    version: "v1",
    uri: "db://projects",
    path: "src/db/schema/projects.ts",
    progress: "completed",
    projectId,
    userId,
    metadata: {
      version: "v1",
      codeMetadata: {
        type: "type",
        name: "projects",
        isExported: true,
        uri: "db://projects",
        position: {
          start: { line: 1, column: 1 },
          end: { line: 18, column: 1 },
        },
        dependencies: [
          {
            type: "internal",
            filePath: "src/db/schema/users.ts",
            dependsOn: ["db://users"],
          },
        ],
      },
      specs: {
        type: "db-model" as const,
        name: "projects",
        columns: [
          {
            name: "id",
            type: "text",
            required: true,
            isPrimaryKey: true,
            nullable: false,
          },
          { name: "name", type: "text", required: true, nullable: false },
          { name: "description", type: "text", nullable: true },
          { name: "user_id", type: "text", required: true, nullable: false },
          {
            name: "created_at",
            type: "timestamp",
            required: true,
            nullable: false,
          },
          { name: "updated_at", type: "timestamp", nullable: true },
        ],
        relationships: [
          {
            type: "manyToOne",
            referencedModel: "users",
            referencedColumn: "id",
            onDelete: "CASCADE",
          },
        ],
        indexes: [{ name: "projects_user_id_idx", columns: ["user_id"] }],
      },
      semanticData: {
        summary: "Project database model for organizing tasks into projects",
        description:
          "The projects table allows users to organize their tasks into different projects. Each project belongs to a user and can contain multiple tasks.",
        tags: ["database", "project-management", "organization"],
        usagePattern: {
          commonUseCases: ["Organizing tasks by project", "Project-based task filtering"],
        },
      },
    },
  });

  decls.push({
    version: "v1",
    uri: "db://comments",
    path: "src/db/schema/comments.ts",
    progress: "completed",
    projectId,
    userId,
    metadata: {
      version: "v1",
      codeMetadata: {
        type: "type",
        name: "comments",
        isExported: true,
        uri: "db://comments",
        position: {
          start: { line: 1, column: 1 },
          end: { line: 20, column: 1 },
        },
        dependencies: [
          {
            type: "internal",
            filePath: "src/db/schema/tasks.ts",
            dependsOn: ["db://tasks"],
          },
          {
            type: "internal",
            filePath: "src/db/schema/users.ts",
            dependsOn: ["db://users"],
          },
        ],
      },
      specs: {
        type: "db-model" as const,
        name: "comments",
        columns: [
          {
            name: "id",
            type: "text",
            required: true,
            isPrimaryKey: true,
            nullable: false,
          },
          { name: "content", type: "text", required: true, nullable: false },
          { name: "task_id", type: "text", required: true, nullable: false },
          { name: "user_id", type: "text", required: true, nullable: false },
          {
            name: "created_at",
            type: "timestamp",
            required: true,
            nullable: false,
          },
          { name: "updated_at", type: "timestamp", nullable: true },
        ],
        relationships: [
          {
            type: "manyToOne",
            referencedModel: "tasks",
            referencedColumn: "id",
            onDelete: "CASCADE",
          },
          {
            type: "manyToOne",
            referencedModel: "users",
            referencedColumn: "id",
            onDelete: "CASCADE",
          },
        ],
        indexes: [
          { name: "comments_task_id_idx", columns: ["task_id"] },
          { name: "comments_user_id_idx", columns: ["user_id"] },
        ],
      },
      semanticData: {
        summary: "Comment database model for task comments",
        description:
          "The comments table stores comments on tasks. Each comment belongs to a task and a user, allowing users to discuss and collaborate on tasks.",
        tags: ["database", "comments", "collaboration"],
        usagePattern: {
          commonUseCases: [
            "Adding comments to tasks",
            "Viewing task discussion history",
            "Collaborating on task details",
          ],
        },
      },
    },
  });

  // API Endpoints
  const endpointDeclarations = [
    {
      uri: "endpoint://GET /api/tasks",
      path: "src/routes/tasks.ts",
      method: "get" as const,
      pathPattern: "/api/tasks",
      summary: "Get all tasks",
      description:
        "Retrieves a list of tasks for the authenticated user. Supports filtering by status, project, and sorting.",
      tags: ["tasks"],
      parameters: [
        {
          name: "status",
          in: "query" as const,
          required: false,
          schema: { type: "string", enum: ["todo", "in_progress", "done"] },
        },
        {
          name: "project_id",
          in: "query" as const,
          required: false,
          schema: { type: "string" },
        },
        {
          name: "sort",
          in: "query" as const,
          required: false,
          schema: {
            type: "string",
            enum: ["created_at", "due_date", "priority"],
          },
        },
      ],
      responses: {
        "200": {
          description: "List of tasks",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/Task" },
              },
            },
          },
        },
      } as EndpointDeclarationSpecs["responses"],
      security: [{ bearerAuth: [] }],
    },
    {
      uri: "endpoint://POST /api/tasks",
      path: "src/routes/tasks.ts",
      method: "post" as const,
      pathPattern: "/api/tasks",
      summary: "Create a new task",
      description: "Creates a new task for the authenticated user.",
      tags: ["tasks"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                status: {
                  type: "string",
                  enum: ["todo", "in_progress", "done"],
                },
                priority: { type: "string", enum: ["low", "medium", "high"] },
                project_id: { type: "string" },
                due_date: { type: "string", format: "date-time" },
              },
              required: ["title"],
            },
          },
        },
      },
      responses: {
        "201": {
          description: "Task created",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Task" },
            },
          },
        },
      } as EndpointDeclarationSpecs["responses"],
      security: [{ bearerAuth: [] }],
    },
    {
      uri: "endpoint://GET /api/tasks/:id",
      path: "src/routes/tasks.ts",
      method: "get" as const,
      pathPattern: "/api/tasks/{id}",
      summary: "Get a task by ID",
      description: "Retrieves a specific task by its ID.",
      tags: ["tasks"],
      parameters: [
        {
          name: "id",
          in: "path" as const,
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "Task details",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Task" },
            },
          },
        },
        "404": {
          description: "Task not found",
        },
      } as EndpointDeclarationSpecs["responses"],
      security: [{ bearerAuth: [] }],
    },
    {
      uri: "endpoint://PUT /api/tasks/:id",
      path: "src/routes/tasks.ts",
      method: "put" as const,
      pathPattern: "/api/tasks/{id}",
      summary: "Update a task",
      description: "Updates an existing task.",
      tags: ["tasks"],
      parameters: [
        {
          name: "id",
          in: "path" as const,
          required: true,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                status: {
                  type: "string",
                  enum: ["todo", "in_progress", "done"],
                },
                priority: { type: "string", enum: ["low", "medium", "high"] },
                project_id: { type: "string" },
                due_date: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Task updated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Task" },
            },
          },
        },
        "404": {
          description: "Task not found",
        },
      } as EndpointDeclarationSpecs["responses"],
      security: [{ bearerAuth: [] }],
    },
    {
      uri: "endpoint://DELETE /api/tasks/:id",
      path: "src/routes/tasks.ts",
      method: "delete" as const,
      pathPattern: "/api/tasks/{id}",
      summary: "Delete a task",
      description: "Deletes a task by its ID.",
      tags: ["tasks"],
      parameters: [
        {
          name: "id",
          in: "path" as const,
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "204": {
          description: "Task deleted",
        },
        "404": {
          description: "Task not found",
        },
      } as EndpointDeclarationSpecs["responses"],
      security: [{ bearerAuth: [] }],
    },
    {
      uri: "endpoint://GET /api/projects",
      path: "src/routes/projects.ts",
      method: "get" as const,
      pathPattern: "/api/projects",
      summary: "Get all projects",
      description: "Retrieves a list of projects for the authenticated user.",
      tags: ["projects"],
      responses: {
        "200": {
          description: "List of projects",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/Project" },
              },
            },
          },
        },
      } as EndpointDeclarationSpecs["responses"],
      security: [{ bearerAuth: [] }],
    },
    {
      uri: "endpoint://POST /api/projects",
      path: "src/routes/projects.ts",
      method: "post" as const,
      pathPattern: "/api/projects",
      summary: "Create a new project",
      description: "Creates a new project for the authenticated user.",
      tags: ["projects"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
              },
              required: ["name"],
            },
          },
        },
      },
      responses: {
        "201": {
          description: "Project created",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Project" },
            },
          },
        },
      } as EndpointDeclarationSpecs["responses"],
      security: [{ bearerAuth: [] }],
    },
    {
      uri: "endpoint://GET /api/projects/:id",
      path: "src/routes/projects.ts",
      method: "get" as const,
      pathPattern: "/api/projects/{id}",
      summary: "Get a project by ID",
      description: "Retrieves a specific project by its ID.",
      tags: ["projects"],
      parameters: [
        {
          name: "id",
          in: "path" as const,
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "Project details",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Project" },
            },
          },
        },
        "404": {
          description: "Project not found",
        },
      } as EndpointDeclarationSpecs["responses"],
      security: [{ bearerAuth: [] }],
    },
    {
      uri: "endpoint://GET /api/tasks/:id/comments",
      path: "src/routes/comments.ts",
      method: "get" as const,
      pathPattern: "/api/tasks/{id}/comments",
      summary: "Get comments for a task",
      description: "Retrieves all comments for a specific task.",
      tags: ["comments"],
      parameters: [
        {
          name: "id",
          in: "path" as const,
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "List of comments",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { $ref: "#/components/schemas/Comment" },
              },
            },
          },
        },
        "404": {
          description: "Task not found",
        },
      } as EndpointDeclarationSpecs["responses"],
      security: [{ bearerAuth: [] }],
    },
    {
      uri: "endpoint://POST /api/tasks/:id/comments",
      path: "src/routes/comments.ts",
      method: "post" as const,
      pathPattern: "/api/tasks/{id}/comments",
      summary: "Create a comment on a task",
      description: "Creates a new comment on a task.",
      tags: ["comments"],
      parameters: [
        {
          name: "id",
          in: "path" as const,
          required: true,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                content: { type: "string" },
              },
              required: ["content"],
            },
          },
        },
      },
      responses: {
        "201": {
          description: "Comment created",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Comment" },
            },
          },
        },
        "404": {
          description: "Task not found",
        },
      } as EndpointDeclarationSpecs["responses"],
      security: [{ bearerAuth: [] }],
    },
    {
      uri: "endpoint://PUT /api/comments/:id",
      path: "src/routes/comments.ts",
      method: "put" as const,
      pathPattern: "/api/comments/{id}",
      summary: "Update a comment",
      description: "Updates an existing comment.",
      tags: ["comments"],
      parameters: [
        {
          name: "id",
          in: "path" as const,
          required: true,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                content: { type: "string" },
              },
              required: ["content"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Comment updated",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Comment" },
            },
          },
        },
        "404": {
          description: "Comment not found",
        },
      } as EndpointDeclarationSpecs["responses"],
      security: [{ bearerAuth: [] }],
    },
    {
      uri: "endpoint://DELETE /api/comments/:id",
      path: "src/routes/comments.ts",
      method: "delete" as const,
      pathPattern: "/api/comments/{id}",
      summary: "Delete a comment",
      description: "Deletes a comment by its ID.",
      tags: ["comments"],
      parameters: [
        {
          name: "id",
          in: "path" as const,
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "204": {
          description: "Comment deleted",
        },
        "404": {
          description: "Comment not found",
        },
      } as EndpointDeclarationSpecs["responses"],
      security: [{ bearerAuth: [] }],
    },
  ];

  for (const endpoint of endpointDeclarations) {
    decls.push({
      version: "v1",
      uri: endpoint.uri,
      path: endpoint.path,
      progress: "completed",
      projectId,
      userId,
      metadata: {
        version: "v1",
        codeMetadata: {
          type: "function",
          name: `${endpoint.method.toUpperCase()} ${endpoint.pathPattern}`,
          isExported: true,
          uri: endpoint.uri,
          position: {
            start: { line: 1, column: 1 },
            end: { line: 50, column: 1 },
          },
          dependencies: [],
        },
        specs: {
          type: "endpoint" as const,
          method: endpoint.method as
            | "get"
            | "post"
            | "put"
            | "delete"
            | "patch"
            | "options"
            | "head",
          path: endpoint.pathPattern,
          summary: endpoint.summary,
          description: endpoint.description,
          tags: endpoint.tags,
          parameters: endpoint.parameters as EndpointDeclarationSpecs["parameters"],
          requestBody: endpoint.requestBody as EndpointDeclarationSpecs["requestBody"],
          responses: endpoint.responses,
          security: endpoint.security as EndpointDeclarationSpecs["security"],
          protected: !!endpoint.security,
        } satisfies EndpointDeclarationSpecs,
        semanticData: {
          summary: endpoint.summary,
          description: endpoint.description,
          tags: endpoint.tags || [],
          usagePattern: {
            commonUseCases: [`${endpoint.summary}`],
          },
        },
      },
    });
  }

  // Pages
  const pageDeclarations = [
    {
      uri: "page:///",
      path: "src/pages/index.tsx",
      name: "Home",
      route: "/",
      description: "Home page displaying dashboard with task overview",
      protected: false,
    },
    {
      uri: "page:///tasks",
      path: "src/pages/tasks/index.tsx",
      name: "Tasks List",
      route: "/tasks",
      description: "Page displaying a list of all tasks",
      protected: true,
    },
    {
      uri: "page:///tasks/:id",
      path: "src/pages/tasks/[id].tsx",
      name: "Task Detail",
      route: "/tasks/{id}",
      description: "Page displaying detailed information about a specific task",
      protected: true,
      parameters: [
        {
          name: "id",
          in: "path" as const,
          required: true,
          schema: { type: "string" },
        },
      ],
    },
    {
      uri: "page:///tasks/new",
      path: "src/pages/tasks/new.tsx",
      name: "Create Task",
      route: "/tasks/new",
      description: "Page for creating a new task",
      protected: true,
    },
    {
      uri: "page:///projects",
      path: "src/pages/projects/index.tsx",
      name: "Projects",
      route: "/projects",
      description: "Page displaying a list of all projects",
      protected: true,
    },
    {
      uri: "page:///projects/:id",
      path: "src/pages/projects/[id].tsx",
      name: "Project Detail",
      route: "/projects/{id}",
      description: "Page displaying detailed information about a specific project",
      protected: true,
      parameters: [
        {
          name: "id",
          in: "path" as const,
          required: true,
          schema: { type: "string" },
        },
      ],
    },
    {
      uri: "page:///login",
      path: "src/pages/login.tsx",
      name: "Login",
      route: "/login",
      description: "User login page",
      protected: false,
    },
    {
      uri: "page:///register",
      path: "src/pages/register.tsx",
      name: "Register",
      route: "/register",
      description: "User registration page",
      protected: false,
    },
  ];

  for (const page of pageDeclarations) {
    decls.push({
      version: "v1",
      uri: page.uri,
      path: page.path,
      progress: "completed",
      projectId,
      userId,
      metadata: {
        version: "v1",
        codeMetadata: {
          type: "function",
          name: page.name,
          isExported: true,
          uri: page.uri,
          position: {
            start: { line: 1, column: 1 },
            end: { line: 30, column: 1 },
          },
          dependencies: [],
        },
        specs: {
          type: "page" as const,
          name: page.name,
          route: page.route,
          description: page.description,
          protected: page.protected,
          parameters: page.parameters,
        },
        semanticData: {
          summary: `${page.name} page`,
          description: page.description,
          tags: ["page", "ui", page.protected ? "protected" : "public"],
          usagePattern: {
            commonUseCases: [`Accessing ${page.name.toLowerCase()}`],
          },
        },
      },
    });
  }

  return decls;
}
