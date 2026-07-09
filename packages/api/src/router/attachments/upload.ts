import { getLogger } from "@orpc/experimental-pino";
import { type Route, ORPCError } from "@orpc/server";
import { handleClientUpload, type ClientUploadRequest } from "@tigrisdata/storage";
import { z } from "zod";

import { protectedProcedure } from "../../lib/procedures";

const definition = {
  method: "POST",
  tags: ["Attachments"],
  path: "/attachments/upload",
  description: "Handle client-side upload to Tigris storage",
  summary: "Upload attachment",
} satisfies Route;

export default protectedProcedure
  .route(definition)
  .input(z.custom<ClientUploadRequest>())
  .handler(async ({ input, context }) => {
    const logger = getLogger(context);

    logger?.info({ action: input.action, name: input.name }, "Processing client upload request");

    try {
      const { data, error } = await handleClientUpload(input);

      if (error) {
        logger?.error({ error }, "Upload error");
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: error.message });
      }

      return { data };
    } catch (error) {
      logger?.error({ error }, "Failed to process upload request");
      if (error instanceof ORPCError) {
        throw error;
      }
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to process upload request",
      });
    }
  });
