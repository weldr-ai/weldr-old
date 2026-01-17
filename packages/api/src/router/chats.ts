import { type TRPCRouterRecord, TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { chatMessages, chats } from "@weldr/db/schema";
import { Tigris } from "@weldr/shared/tigris";
import type { ChatMessage } from "@weldr/shared/types";
import { addMessageItemSchema, updateMessageItemSchema } from "@weldr/shared/validators/chats";

import { protectedProcedure } from "../init";

export const chatsRouter = {
  messages: protectedProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ ctx, input }) => {
      const messages = await ctx.db.query.chatMessages.findMany({
        where: and(
          eq(chatMessages.chatId, input.chatId),
          eq(chatMessages.userId, ctx.session.user.id),
        ),
        orderBy: (chatMessages, { asc }) => [asc(chatMessages.createdAt)],
        with: {
          attachments: {
            columns: {
              name: true,
              key: true,
            },
          },
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      const messagesWithAttachments = await Promise.all(
        messages.map(async (message) => {
          const attachments = [];

          for (const attachment of message.attachments) {
            const url = await Tigris.object.getSignedUrl(
              // oxlint-disable-next-line no-non-null-assertion
              process.env.GENERAL_BUCKET!,
              attachment.key,
            );

            attachments.push({
              name: attachment.name,
              url,
            });
          }

          return {
            ...message,
            attachments,
          };
        }),
      );

      return messagesWithAttachments as ChatMessage[];
    }),
  addMessage: protectedProcedure
    .input(
      z.object({
        chatId: z.string(),
        message: addMessageItemSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const chat = await ctx.db.query.chats.findFirst({
          where: and(eq(chats.id, input.chatId), eq(chats.userId, ctx.session.user.id)),
        });

        if (!chat) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Chat not found",
          });
        }

        const [message] = await ctx.db
          .insert(chatMessages)
          .values({
            ...input.message,
            chatId: input.chatId,
            userId: ctx.session.user.id,
          })
          .returning();

        if (!message) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to add message",
          });
        }

        return message as ChatMessage;
      } catch (error) {
        console.error(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add message",
        });
      }
    }),
  updateMessage: protectedProcedure
    .input(updateMessageItemSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify chat ownership
        const chat = await ctx.db.query.chats.findFirst({
          where: and(eq(chats.id, input.chatId), eq(chats.userId, ctx.session.user.id)),
        });

        if (!chat) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Chat not found",
          });
        }

        const [message] = await ctx.db
          .update(chatMessages)
          .set({
            content: input.content,
          })
          .where(and(eq(chatMessages.id, input.id), eq(chatMessages.chatId, input.chatId)))
          .returning();

        if (!message) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Message not found",
          });
        }

        return message as ChatMessage;
      } catch (error) {
        console.error(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update message",
        });
      }
    }),
} satisfies TRPCRouterRecord;
