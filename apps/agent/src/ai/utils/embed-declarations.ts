import { embedMany } from "ai";

import { Logger } from "@weldr/shared/logger";
import type {
  DeclarationCodeMetadata,
  DeclarationMetadata,
  DeclarationSemanticData,
  DeclarationSpecs,
} from "@weldr/shared/types/declarations";

import { registry } from "./registry";

export async function embedDeclaration(
  declarationMetadata: DeclarationMetadata,
): Promise<number[] | undefined> {
  try {
    // Generate searchable text from semantic data and specs
    const embeddingText = generateEmbeddingText(
      declarationMetadata.codeMetadata,
      declarationMetadata.semanticData,
      declarationMetadata.specs,
    );

    if (!embeddingText) {
      Logger.warn("No embedding text generated");
      return;
    }

    // Generate embedding using OpenAI's text-embedding-ada-002
    const embeddingModel = registry.textEmbeddingModel("openai:text-embedding-ada-002");

    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: [embeddingText],
    });

    if (!embeddings || embeddings.length === 0 || !embeddings[0]) {
      Logger.error("Failed to generate embedding");
      return;
    }

    Logger.info("Successfully generated and stored embedding", {
      extra: {
        embeddingTextLength: embeddingText.length,
      },
    });

    const embedding = embeddings[0];

    if (!embedding) {
      Logger.error("No embedding generated");
      throw new Error("No embedding generated");
    }

    return embedding;
  } catch (error) {
    Logger.error("Failed to generate and store embedding", {
      extra: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return;
  }
}

function generateEmbeddingText(
  codeMetadata?: DeclarationCodeMetadata,
  semanticData?: DeclarationSemanticData,
  specs?: DeclarationSpecs["data"],
): string | null {
  if (!codeMetadata && !semanticData && !specs) {
    return null;
  }

  const textParts: string[] = [];

  // Add basic code metadata
  if (codeMetadata) {
    textParts.push(`${codeMetadata.type}: ${codeMetadata.name}`);
  }

  // Add semantic data - focus on the most searchable information
  if (semanticData) {
    // Add summary and description
    textParts.push(semanticData.summary);
    textParts.push(semanticData.description);

    // Add tags for searchability
    if (semanticData.tags.length > 0) {
      textParts.push(`Tags: ${semanticData.tags.join(", ")}`);
    }

    // Add common use cases
    if (semanticData.usagePattern.commonUseCases.length > 0) {
      textParts.push(`Use cases: ${semanticData.usagePattern.commonUseCases.join(", ")}`);
    }
  }

  // Add specs based on type
  if (specs) {
    switch (specs.type) {
      case "endpoint": {
        textParts.push(`${specs.method} ${specs.path}`);
        textParts.push(`Endpoint: ${specs.summary}`);
        textParts.push(specs.description);

        // Add request body information
        if (specs.requestBody?.description) {
          textParts.push(`Request: ${specs.requestBody.description}`);
        }

        // Add response information
        if (specs.responses) {
          const responseDescriptions = Object.values(specs.responses).map(
            (response) => response.description,
          );
          textParts.push(`Responses: ${responseDescriptions.join(", ")}`);
        }
        break;
      }
      case "db-model": {
        textParts.push(`Database model: ${specs.name}`);

        // Add column information
        if (specs.columns && specs.columns.length > 0) {
          const columnNames = specs.columns.map((col) => `${col.name} (${col.type})`);
          textParts.push(`Columns: ${columnNames.join(", ")}`);
        }

        // Add relationships
        if (specs.relationships && specs.relationships.length > 0) {
          const relationshipInfo = specs.relationships.map(
            (rel) => `${rel.type} with ${rel.referencedModel}`,
          );
          textParts.push(`Relationships: ${relationshipInfo.join(", ")}`);
        }
        break;
      }
      case "page": {
        textParts.push(`Page: ${specs.name}`);
        textParts.push(`Route: ${specs.route}`);
        textParts.push(specs.description);

        // Add parameter information
        if (specs.parameters && specs.parameters.length > 0) {
          const parameterNames = specs.parameters.map((param) => param.name);
          textParts.push(`Parameters: ${parameterNames.join(", ")}`);
        }
        break;
      }
    }
  }

  return textParts.filter(Boolean).join(" ");
}
