import type { AssistantContent, ToolContent, UserContent } from "ai";
import { z } from "zod";

// ===========================================================================
// Message Parts
// ===========================================================================

export const dbModelReferencePartSchema = z.object({
  type: z.literal("db-model"),
  id: z.string().describe("The ID of the db model"),
  name: z.string().describe("The name of the db model"),
});

export const pageReferencePartSchema = z.object({
  type: z.literal("page"),
  id: z.string().describe("The ID of the page"),
  name: z.string().describe("The name of the page"),
});

export const endpointReferencePartSchema = z.object({
  type: z.literal("endpoint"),
  id: z.string().describe("The ID of the endpoint"),
  method: z.string().describe("The method of the endpoint"),
  path: z.string().describe("The path of the endpoint"),
});

export const referencePartSchema = z.discriminatedUnion("type", [
  endpointReferencePartSchema,
  dbModelReferencePartSchema,
  pageReferencePartSchema,
]);

// ===========================================================================
// AI Metadata Schemas
// ===========================================================================

export const baseAiMetadataSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  inputCost: z.number().optional(),
  outputCost: z.number().optional(),
  totalCost: z.number().optional(),
  inputTokensPrice: z.number().optional(),
  outputTokensPrice: z.number().optional(),
  inputImagesPrice: z.number().optional(),
  finishReason: z.enum([
    "stop",
    "length",
    "content-filter",
    "tool-calls",
    "error",
    "other",
    "unknown",
  ]),
});

export const aiMetadataSchema = z.discriminatedUnion("provider", [
  baseAiMetadataSchema.extend({
    provider: z.literal("google"),
    model: z.enum(["gemini-2.5-pro", "gemini-2.5-flash"]),
  }),
  baseAiMetadataSchema.extend({
    provider: z.literal("openai"),
    model: z.enum(["gpt-4.1", "gpt-image-1"]),
  }),
  baseAiMetadataSchema.extend({
    provider: z.literal("anthropic"),
    model: z.enum(["claude-sonnet-4", "claude-opus-4"]),
  }),
]);

// ===========================================================================
// Core Message Schemas
// ===========================================================================

export const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
  contentType: z.string(),
  size: z.number(),
  url: z.string().optional(),
});

const baseMessageSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  chatId: z.string(),
});

export const messageRoleSchema = z.enum(["user", "assistant", "tool"]);

export const userMessageSchema = baseMessageSchema.extend({
  role: z.literal("user"),
  content: z.custom<UserContent>(), // Allow both string and array content
  attachments: attachmentSchema.array().optional(),
  userId: z.string().optional(),
  user: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      image: z.string().optional(),
    })
    .optional(),
});

export const assistantMessageSchema = baseMessageSchema.extend({
  role: z.literal("assistant"),
  content: z.custom<AssistantContent>(), // Allow both string and array content
  metadata: aiMetadataSchema.optional(),
});

export const toolMessageSchema = baseMessageSchema.extend({
  role: z.literal("tool"),
  content: z.custom<ToolContent>(),
});

export const chatMessageSchema = z.discriminatedUnion("role", [
  userMessageSchema,
  assistantMessageSchema,
  toolMessageSchema,
]);

export const chatSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  messages: chatMessageSchema.array(),
});

export const addMessageItemSchema = z.discriminatedUnion("role", [
  z.object({
    id: z.string().optional(),
    role: z.literal("assistant"),
    content: z.custom<AssistantContent>(), // Allow both string and array content
    metadata: aiMetadataSchema.optional(),
    createdAt: z.date().optional(),
  }),
  z.object({
    id: z.string().optional(),
    role: z.literal("user"),
    content: z.custom<UserContent>(), // Allow both string and array content
    attachmentIds: z.string().array().optional(),
    createdAt: z.date().optional(),
  }),
  z.object({
    id: z.string().optional(),
    role: z.literal("tool"),
    content: z.custom<ToolContent>(),
    createdAt: z.date().optional(),
  }),
]);

export const updateMessageItemSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  content: z.custom<AssistantContent | UserContent | ToolContent>(), // Allow all content types including string
});

export const addMessagesInputSchema = z.object({
  chatId: z.string(),
  messages: addMessageItemSchema.array(),
});
