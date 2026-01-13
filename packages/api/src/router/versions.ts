import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { and, db, desc, eq } from "@weldr/db";
import {
  branches,
  chatMessages,
  chats,
  integrationInstallations,
  projects,
  versionDeclarations,
  versions,
} from "@weldr/db/schema";
import type { ChatMessage } from "@weldr/shared/types";

import { protectedProcedure } from "../init";
import { callAgentProxy } from "../utils";

export const versionRouter = {
  create: protectedProcedure
    .input(z.object({ projectId: z.string(), branchId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [chat] = await ctx.db
        .insert(chats)
        .values({
          userId: ctx.session.user.id,
          projectId: input.projectId,
        })
        .returning();

      if (!chat) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create version",
        });
      }

      let branchId: string | undefined = input.branchId;
      let headVersionNumber: number | undefined;
      let headVersionSequenceNumber: number | undefined;

      if (!branchId) {
        const branch = await ctx.db.query.branches.findFirst({
          where: and(eq(branches.projectId, input.projectId), eq(branches.isMain, true)),
          with: {
            headVersion: {
              columns: {
                number: true,
                sequenceNumber: true,
              },
            },
          },
        });

        if (!branch) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Branch not found",
          });
        }

        branchId = branch.id;
        headVersionNumber = branch.headVersion?.number;
        headVersionSequenceNumber = branch.headVersion?.sequenceNumber;
      } else {
        const branch = await ctx.db.query.branches.findFirst({
          where: eq(branches.id, branchId),
          with: {
            headVersion: {
              columns: {
                number: true,
                sequenceNumber: true,
              },
            },
          },
        });

        if (!branch) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Branch not found",
          });
        }

        headVersionNumber = branch.headVersion?.number;
        headVersionSequenceNumber = branch.headVersion?.sequenceNumber;
      }

      const version = await ctx.db.insert(versions).values({
        projectId: input.projectId,
        userId: ctx.session.user.id,
        number: headVersionNumber ? headVersionNumber + 1 : 1,
        sequenceNumber: headVersionSequenceNumber ? headVersionSequenceNumber + 1 : 1,
        chatId: chat.id,
        branchId,
      });

      return version;
    }),
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const versionResult = await ctx.db.query.versions.findFirst({
      where: eq(versions.id, input.id),
      columns: {
        id: true,
        message: true,
        createdAt: true,
        parentVersionId: true,
        number: true,
        status: true,
        description: true,
        projectId: true,
        publishedAt: true,
      },
      with: {
        chat: {
          with: {
            messages: {
              orderBy: (messages, { asc }) => [asc(messages.createdAt)],
              with: {
                attachments: {
                  columns: {
                    name: true,
                    key: true,
                  },
                },
                user: {
                  columns: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        declarations: {
          with: {
            declaration: {
              columns: {
                id: true,
                metadata: true,
                nodeId: true,
                progress: true,
              },
              with: {
                node: true,
                dependencies: true,
              },
            },
          },
        },
      },
    });

    if (!versionResult) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Version not found",
      });
    }

    const getMessagesWithAttachments = async (version: typeof versionResult) => {
      const results = [];

      for (const message of version.chat.messages) {
        // Filter assistant messages for call_coder tool calls
        let content: unknown[] = message.content as unknown[];

        // Skip tool messages with call_coder results
        if (message.role === "tool" && Array.isArray(message.content)) {
          content = content.filter(
            (item: unknown) =>
              !(
                typeof item === "object" &&
                item !== null &&
                "type" in item &&
                item.type === "tool-result" &&
                "toolName" in item &&
                item.toolName === "call_coder"
              ),
          );
        } else if (message.role === "assistant") {
          content = content.filter(
            (item: unknown) =>
              !(
                typeof item === "object" &&
                item !== null &&
                "type" in item &&
                item.type === "tool-call" &&
                "toolName" in item &&
                item.toolName === "call_coder"
              ),
          );
        }

        if (content.length === 0) continue;

        // For attachments, just return the key - the client can handle URL generation
        const attachmentsWithUrls = message.attachments.map((attachment) => ({
          name: attachment.name,
          url: `/api/attachments/${attachment.key}`,
        }));

        results.push({
          ...message,
          content,
          attachments: attachmentsWithUrls,
        });
      }

      return results;
    };

    const getVersionDeclarations = (version: typeof versionResult) => {
      const declarations = version.declarations
        .filter((declaration) => declaration.declaration.node)
        .map((declaration) => declaration.declaration);

      const declarationToCanvasNodeMap = new Map(
        declarations.map((declaration) => [declaration.id, declaration.node?.id]),
      );

      return declarations.map((declaration) => ({
        declaration,
        edges: declaration.dependencies.map((dependency) => ({
          dependencyId: declarationToCanvasNodeMap.get(dependency.dependencyId),
          dependentId: declarationToCanvasNodeMap.get(dependency.dependentId),
        })),
      }));
    };

    const versionDeclarations = getVersionDeclarations(versionResult);

    const edges = Array.from(
      new Map(
        versionDeclarations
          .flatMap((decl) => decl.edges)
          .map((edge) => [`${edge.dependencyId}-${edge.dependentId}`, edge]),
      ).values(),
    ).filter((edge) => edge.dependencyId !== undefined && edge.dependentId !== undefined) as {
      dependencyId: string;
      dependentId: string;
    }[];

    return {
      ...versionResult,
      edges,
      chat: {
        ...versionResult.chat,
        messages: (await getMessagesWithAttachments(versionResult)) as ChatMessage[],
      },
    };
  }),
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const versionsList = await ctx.db.query.versions.findMany({
        where: eq(versions.projectId, input.projectId),
        orderBy: desc(versions.createdAt),
        columns: {
          id: true,
          message: true,
          createdAt: true,
          parentVersionId: true,
          number: true,
          status: true,
          description: true,
          publishedAt: true,
          projectId: true,
        },
      });

      return versionsList;
    }),
  revert: protectedProcedure
    .input(z.object({ projectId: z.string(), versionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const version = await ctx.db.query.versions.findFirst({
        where: and(
          eq(versions.id, input.versionId),
          eq(projects.id, input.projectId),
          eq(versions.userId, ctx.session.user.id),
        ),
        with: {
          branch: true,
          declarations: true,
          integrationInstallations: true,
        },
      });

      if (!version) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Version not found",
        });
      }

      // Require snapshotPath for revert (same for both local and cloud modes)
      if (!version.snapshotPath) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Version does not have a snapshot. Cannot revert.",
        });
      }

      const revertedVersion = await db.transaction(async (tx) => {
        const [revertedVersionChat] = await tx
          .insert(chats)
          .values({
            userId: ctx.session.user.id,
            projectId: input.projectId,
          })
          .returning();

        if (!revertedVersionChat) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not create version chat",
          });
        }

        await tx.insert(chatMessages).values({
          role: "assistant",
          content: [
            {
              type: "text",
              text: `Reverted from #${version.sequenceNumber} ${version.message}`,
            },
          ],
          chatId: revertedVersionChat.id,
        });

        const [revertedVersion] = await tx
          .insert(versions)
          .values({
            branchId: version.branch.id,
            chatId: revertedVersionChat.id,
            number: version.number + 1,
            sequenceNumber: version.sequenceNumber + 1,
            projectId: input.projectId,
            userId: ctx.session.user.id,
            snapshotPath: version.snapshotPath,
            kind: "revert",
            revertedVersionId: version.id,
            message: `revert: revert to #${version.sequenceNumber} ${version.message}`,
            description: `Reverted from #${version.sequenceNumber} ${version.message}`,
            status: "completed",
            publishedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            parentVersionId: version.branch.headVersionId,
          })
          .returning();

        if (!revertedVersion) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not create version",
          });
        }

        if (version.declarations.length > 0) {
          await tx.insert(versionDeclarations).values(
            version.declarations.map((declaration) => ({
              versionId: revertedVersion.id,
              declarationId: declaration.declarationId,
            })),
          );
        }

        if (version.integrationInstallations.length > 0) {
          await tx.insert(integrationInstallations).values(
            version.integrationInstallations.map((installation) => ({
              versionId: revertedVersion.id,
              integrationId: installation.integrationId,
            })),
          );
        }

        await tx
          .update(branches)
          .set({
            headVersionId: revertedVersion.id,
          })
          .where(eq(branches.id, version.branch.id));

        return revertedVersion;
      });

      // Call agent to perform the actual revert (restore snapshot + git commit)
      let commitHash: string | undefined;
      try {
        const result = await callAgentProxy<{
          commitHash: string;
          snapshotPath: string;
        }>(
          "/revert",
          {
            projectId: input.projectId,
            versionId: input.versionId,
            branchId: version.branch.id,
          },
          ctx.headers,
        );

        commitHash = result.commitHash;

        if (commitHash) {
          await db.update(versions).set({ commitHash }).where(eq(versions.id, revertedVersion.id));

          revertedVersion.commitHash = commitHash;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Cleanup on failure
        try {
          await db
            .update(branches)
            .set({ headVersionId: version.branch.headVersionId })
            .where(eq(branches.id, version.branch.id));

          await db.delete(versions).where(eq(versions.id, revertedVersion.id));

          await db.delete(chats).where(eq(chats.id, revertedVersion.chatId));
        } catch (cleanupError) {
          console.error("Failed to cleanup after revert failure:", cleanupError);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to perform revert: ${errorMessage}`,
        });
      }

      return revertedVersion;
    }),
};
