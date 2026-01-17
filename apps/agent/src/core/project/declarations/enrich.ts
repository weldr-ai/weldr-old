import { generateText, Output } from "ai";

import { Logger } from "@weldr/shared/logger";
import type {
  DeclarationCodeMetadata,
  DeclarationSemanticData,
} from "@weldr/shared/types/declarations";
import { declarationSemanticDataSchema } from "@weldr/shared/validators/declarations/index";

import { registry } from "@/ai/providers";

export async function enrichDeclaration(
  declaration: DeclarationCodeMetadata,
  filePath: string,
  sourceCode: string,
): Promise<DeclarationSemanticData | null> {
  const logger = Logger.get({
    declarationName: declaration.name,
    declarationType: declaration.type,
  });

  try {
    const prompt = `Analyze this ${declaration.type} declaration and generate comprehensive semantic data for it.

Declaration Details:
- Name: ${declaration.name}
- Type: ${declaration.type}
${declaration.typeSignature ? `- Type Signature: ${declaration.typeSignature}` : ""}

Source Code Context:
${filePath}
\`\`\`typescript
${sourceCode}
\`\`\`

Generate semantic data that includes:
1. A concise technical summary (one line)
2. A clear 2-3 sentence description explaining purpose and key features
3. Relevant technical tags (lowercase, hyphenated)
4. Usage patterns including:
   - Common use cases (1-5 specific scenarios)
   - Code examples with descriptions (if applicable)
   - Limitations (if any)
   - Best practices (if applicable)
   - Anti-patterns to avoid (if applicable)

Focus on being practical and helpful for developers who need to understand when and how to use this declaration.`;

    const result = await generateText({
      model: registry.languageModel("google:gemini-2.5-flash"),
      output: Output.object({ schema: declarationSemanticDataSchema }),
      maxOutputTokens: 65536,
      prompt,
    });

    if (!result.output) {
      logger.warn("No output from model during semantic data generation");
      return null;
    }

    logger.info("Generated semantic data successfully", {
      extra: {
        declarationName: declaration.name,
        tagsCount: result.output.tags.length,
        useCasesCount: result.output.usagePattern.commonUseCases.length,
      },
    });

    return result.output as DeclarationSemanticData;
  } catch (error) {
    logger.error("Failed to generate semantic data", {
      extra: {
        error: error instanceof Error ? error.message : String(error),
        declarationName: declaration.name,
      },
    });
    return null;
  }
}
