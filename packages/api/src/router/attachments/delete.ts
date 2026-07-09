import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { remove as tigrisRemove } from "@tigrisdata/storage";
import { z } from "zod";

import { protectedProcedure } from "../../lib/procedures";

const BUCKET_NAME = process.env.GENERAL_BUCKET;

const tigrisConfig = {
  // oxlint-disable-next-line no-non-null-assertion
  accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID!,
  // oxlint-disable-next-line no-non-null-assertion
  secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY!,
  bucket: BUCKET_NAME,
};

const definition = {
  method: "DELETE",
  tags: ["Attachments"],
  path: "/attachments",
  description: "Delete a file attachment",
  summary: "Delete attachment",
} satisfies Route;

const inputSchema = z.object({
  filename: z.string().min(1, { message: "Filename is required" }),
});

const outputSchema = z.object({
  message: z.string(),
});

export default protectedProcedure
  .route(definition)
  .input(inputSchema)
  .output(outputSchema)
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);
    const { filename } = input;

    logger?.info({ filename }, "Deleting attachment");

    try {
      const deleteResponse = await tigrisRemove(filename, {
        config: tigrisConfig,
      });

      if (deleteResponse?.error) {
        logger?.error({ error: deleteResponse.error, filename }, "Error deleting file");
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to delete file" });
      }

      return { message: "File deleted successfully" };
    } catch (error) {
      logger?.error({ error, filename }, "Failed to delete attachment");
      if (error instanceof ORPCError) {
        throw error;
      }
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to delete file" });
    }
  });
