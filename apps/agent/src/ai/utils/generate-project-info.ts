import { generateObject, type ModelMessage } from "ai";
import { z } from "zod";

import { Logger } from "@weldr/shared/logger";

import { registry } from "./registry";

const projectSchema = z.object({
  title: z.string().describe("A concise, professional project title (3-4 words max, Title Case)"),
  description: z.string().describe("A brief, clear description of the project (1-2 sentences)"),
});

export async function generateProjectInfo(messages: ModelMessage[]) {
  const { object } = await generateObject({
    system: `You are a helpful assistant that generates concise, professional project titles and descriptions.

TITLE RULES:
- Maximum 3-4 words
- Use Title Case (capitalize each major word)
- Be specific and descriptive
- No articles (a, an, the) unless absolutely necessary
- No punctuation at the end

DESCRIPTION RULES:
- 2-3 sentences maximum
- Clear and concise
- Explain what the project does
- Professional tone

EXAMPLES:
{ title: "Todo App", description: "A task management application with user authentication and personal task organization." }
{ title: "Customer Dashboard", description: "A management interface for tracking customers and processing their orders efficiently." }
{ title: "Book Store", description: "An online marketplace for purchasing and selling books with secure payment processing." }`,
    model: registry.languageModel("google:gemini-2.5-flash"),
    messages,
    schema: projectSchema,
    maxOutputTokens: 1024,
  });

  Logger.info("Generated project title and description", {
    title: object.title,
    description: object.description,
  });

  return object;
}
