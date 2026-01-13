import { generateText, Output, type ModelMessage } from "ai";
import { z } from "zod";

import { and, db, eq } from "@weldr/db";
import { branches, chats, versionDeclarations, versions } from "@weldr/db/schema";
import { Logger } from "@weldr/shared/logger";

import { registry } from "@/ai/providers";

export const initVersion = async ({
  projectId,
  branchId,
  userId,
}: {
  projectId: string;
  branchId: string;
  userId: string;
}): Promise<typeof versions.$inferSelect & { branch: typeof branches.$inferSelect }> => {
  const logger = Logger.get({
    projectId,
  });

  return db.transaction(async (tx) => {
    // Get the branch
    const branch = await tx.query.branches.findFirst({
      where: and(eq(branches.projectId, projectId), eq(branches.id, branchId)),
      with: {
        headVersion: {
          with: {
            declarations: true,
          },
        },
      },
    });

    if (!branch) {
      throw new Error("Branch not found");
    }

    logger.info("Creating version chat...");
    // Create the version chat
    const [versionChat] = await tx
      .insert(chats)
      .values({
        projectId,
        userId,
      })
      .returning();

    if (!versionChat) {
      throw new Error("Version chat not found");
    }

    // Create the new version
    logger.info("Creating new version...");
    const [version] = await tx
      .insert(versions)
      .values({
        projectId,
        userId,
        sequenceNumber: branch.headVersion?.sequenceNumber
          ? branch.headVersion.sequenceNumber + 1
          : 1,
        number: branch.headVersion?.number ? branch.headVersion.number + 1 : 1,
        parentVersionId: branch.headVersion?.id,
        chatId: versionChat.id,
        branchId,
      })
      .returning();

    if (!version) {
      throw new Error("Version not found");
    }

    logger.info(`Copying ${branch.headVersion?.declarations.length} declarations...`);

    // Copy the declarations
    if (branch.headVersion) {
      await tx.insert(versionDeclarations).values(
        branch.headVersion.declarations.map((declaration) => ({
          versionId: version.id,
          declarationId: declaration.declarationId,
        })),
      );
    }

    // Update the branch head version
    await tx
      .update(branches)
      .set({
        headVersionId: version.id,
      })
      .where(eq(branches.id, branchId));

    return { ...version, branch };
  });
};

const versionDetailsSchema = z.object({
  message: z
    .string()
    .describe(
      "Commit message following conventional commit format. Should be a single sentence that captures the essence of the changes.",
    ),
  description: z
    .string()
    .describe(
      "Comprehensive description of the version, including requirements, objectives, and scope. Should start with present tense verbs.",
    ),
});

export async function generateVersionDetails(
  messages: ModelMessage[],
): Promise<{ message: string; description: string }> {
  const result = await generateText({
    system:
      "You are a helpful assistant that generates concise, professional commit messages and comprehensive descriptions.",
    model: registry.languageModel("google:gemini-2.5-flash"),
    messages: [
      ...messages,
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Based on the conversation history, generate a commit message and description that summarize the changes.",
          },
        ],
      },
    ],
    output: Output.object({ schema: versionDetailsSchema }),
    maxOutputTokens: 1024,
  });

  if (!result.output) {
    throw new Error("Failed to generate version details: no output from model");
  }

  Logger.info("Generated version details", {
    message: result.output.message,
    description: result.output.description,
  });

  return result.output;
}
