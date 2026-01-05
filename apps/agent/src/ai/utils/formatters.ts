import type { z } from "zod";

import type { declarations } from "@weldr/db/schema";
import type {
  ClassDeclarationCodeMetadata,
  DeclarationCodeMetadata,
  DeclarationMetadata,
  EnumDeclarationCodeMetadata,
  FunctionDeclarationCodeMetadata,
  InterfaceDeclarationCodeMetadata,
  NamespaceDeclarationCodeMetadata,
  VariableDeclarationCodeMetadata,
} from "@weldr/shared/types/declarations";
import type { dbModelDeclarationSpecsSchema } from "@weldr/shared/validators/declarations/db-model";
import type { endpointDeclarationSpecsSchema } from "@weldr/shared/validators/declarations/endpoint";
import type { pageDeclarationSpecsSchema } from "@weldr/shared/validators/declarations/page";

export function formatEndpointToMarkdown(
  endpoint: z.infer<typeof endpointDeclarationSpecsSchema>,
): string {
  let markdown = `\`\`\`http\n${endpoint.method.toUpperCase()} ${
    endpoint.path
  }\n\`\`\`\n\n`;
  markdown += `**Summary:** ${endpoint.summary}\n\n`;
  if (endpoint.description) {
    markdown += `**Description:** ${endpoint.description}\n\n`;
  }
  if (endpoint.protected) {
    markdown += "**Authentication:** Required\n\n";
  }

  if (endpoint.tags && endpoint.tags.length > 0) {
    markdown += `**Tags:** ${endpoint.tags.join(", ")}\n\n`;
  }

  if (endpoint.parameters && endpoint.parameters.length > 0) {
    markdown += "**Parameters:**\n";
    markdown += "| Name | In | Required | Description |\n";
    markdown += "|------|----|----------|-------------|\n";
    for (const param of endpoint.parameters) {
      markdown += `| \`${param.name}\` | ${param.in} | ${
        param.required ?? false
      } | ${param.description ?? ""} |\n`;
    }
    markdown += "\n";
  }

  if (endpoint.requestBody) {
    markdown += "**Request Body:**\n";
    for (const contentType in endpoint.requestBody.content) {
      markdown += `*   **${contentType}**\n`;
      const schema =
        endpoint.requestBody.content[
          contentType as keyof typeof endpoint.requestBody.content
        ]?.schema;
      if (schema) {
        markdown += `    \`\`\`json\n${JSON.stringify(
          schema,
          null,
          2,
        )}\n\`\`\`\n`;
      }
    }
    markdown += "\n";
  }

  markdown += "**Responses:**\n";
  for (const statusCode in endpoint.responses) {
    const response = endpoint.responses[statusCode];
    if (response) {
      markdown += `*   **${statusCode}**: ${response.description}\n`;
      if (response.content) {
        for (const contentType in response.content) {
          markdown += `    *   **${contentType}**\n`;
          const schema =
            response.content[contentType as keyof typeof response.content]
              ?.schema;
          if (schema) {
            markdown += `        \`\`\`json\n${JSON.stringify(
              schema,
              null,
              2,
            )}\n\`\`\`\n`;
          }
        }
      }
    }
  }
  markdown += "\n";
  return markdown;
}

export function formatDbModelToMarkdown(
  model: z.infer<typeof dbModelDeclarationSpecsSchema>,
): string {
  let markdown = `**Table Name:** \`${model.name}\`\n\n`;

  markdown += "**Columns:**\n";
  markdown += "| Name | Type | Nullable | Primary Key | Unique | Default |\n";
  markdown += "|------|------|----------|-------------|--------|---------|\n";
  for (const col of model.columns) {
    markdown += `| \`${col.name}\` | \`${col.type}\` | ${
      col.nullable ?? false
    } | ${col.isPrimaryKey ?? false} | ${col.unique ?? false} | ${
      col.default ?? ""
    } |\n`;
  }
  markdown += "\n";

  if (model.relationships && model.relationships.length > 0) {
    markdown += "**Relationships:**\n";
    for (const rel of model.relationships) {
      markdown += `- **${rel.type}** with \`${rel.referencedModel}\` on column \`${rel.referencedColumn}\`\n`;
    }
    markdown += "\n";
  }

  if (model.indexes && model.indexes.length > 0) {
    markdown += "**Indexes:**\n";
    for (const idx of model.indexes) {
      markdown += `- **${idx.name}**: on columns (${idx.columns.join(
        ", ",
      )}) ${idx.unique ? "(unique)" : ""}\n`;
    }
    markdown += "\n";
  }

  return markdown;
}

export function formatPageToMarkdown(
  page: z.infer<typeof pageDeclarationSpecsSchema>,
): string {
  let markdown = `**Route:** \`${page.route}\`\n\n`;
  markdown += `**Description:** ${page.description}\n\n`;
  if (page.protected) {
    markdown += "**Authentication:** Required\n\n";
  }
  if (page.parameters) {
    markdown += "**Parameters:**\n";
    markdown += "| Name | In | Required | Description |\n";
    markdown += "|------|----|----------|-------------|\n";
    for (const param of page.parameters) {
      markdown += `| \`${param.name}\` | ${param.in} | ${
        param.required ?? false
      } | ${param.description ?? ""} |\n`;
    }
    markdown += "\n";
  }

  return markdown;
}

export function formatDeclarationSpecs(
  declaration: typeof declarations.$inferSelect,
): string {
  const specs = declaration.metadata?.specs;
  const data = declaration.metadata?.codeMetadata;

  if (
    !specs ||
    !(
      specs.type === "endpoint" ||
      specs.type === "db-model" ||
      specs.type === "page"
    )
  ) {
    return "";
  }

  // Extract position information from data (not specs)
  const position = data?.position;

  const name =
    specs.type === "endpoint" ? `${specs.method} ${specs.path}` : specs.name;
  const category = specs.type === "db-model" ? "db_model" : specs.type;

  let result = `## ${category}: ${name}\n\n`;

  result += `**ID:** \`${declaration.id}\`\n\n`;

  if (declaration.path) {
    result += `**Path:** \`${declaration.path}\``;
    if (position) {
      result += ` (Start line ${position.start.line}, End line ${position.end.line})`;
    }
    result += "\n\n";
  }

  // Use the existing formatters for the specific content
  switch (specs.type) {
    case "endpoint":
      result += formatEndpointToMarkdown(specs);
      break;
    case "db-model":
      result += formatDbModelToMarkdown(specs);
      break;
    case "page":
      result += formatPageToMarkdown(specs);
      break;
  }

  return result;
}

// Helper function to format common declaration info
function formatDeclarationHeader(
  declaration: typeof declarations.$inferSelect,
  data: DeclarationMetadata,
): string {
  const name = data.codeMetadata?.name || "Unknown";
  const tags = data.semanticData?.tags || [];
  const position = data.codeMetadata?.position;

  // Include category if it's not unknown
  let result = "";
  if (tags && tags.length > 0) {
    result = `## ${tags.join(", ")}: ${name}\n`;
  } else {
    result = `## ${name}\n`;
  }

  // Add ID for fetching related declarations
  result += `**ID:** \`${declaration.id}\`\n\n`;

  // Add position with tolerance for reading file parts
  if (declaration.path && position) {
    const startLine = Math.max(1, position.start.line - 5);
    const endLine = position.end.line + 5;
    result += `*${declaration.path}:${startLine}-${endLine}*\n\n`;
  }

  // Add purpose - most critical for LLMs
  if (data.semanticData?.description) {
    result += `${data.semanticData.description}\n\n`;
  }

  // Add type signature if available - essential for understanding
  if (data.codeMetadata?.typeSignature) {
    result += `\`\`\`typescript\n${data.codeMetadata.typeSignature}\n\`\`\`\n\n`;
  }

  return result;
}

function formatFunctionDeclaration(
  data: FunctionDeclarationCodeMetadata,
): string {
  let result = "";

  // Function modifiers (only if present)
  const modifiers = [];
  if (data.isAsync) modifiers.push("async");
  if (data.isGenerator) modifiers.push("generator");
  if (modifiers.length > 0) {
    result += `*${modifiers.join(", ")} function*\n\n`;
  }

  // Parameters - critical for usage
  if (data.parameters && data.parameters.length > 0) {
    result += "**Parameters:**\n";
    for (const param of data.parameters) {
      const optional = param.isOptional ? "?" : "";
      const rest = param.isRest ? "..." : "";
      result += `- ${rest}${param.name}${optional}: \`${param.type}\`\n`;
    }
    result += "\n";
  }

  // Return type - essential
  if (data.returnType) {
    result += `**Returns:** \`${data.returnType}\`\n\n`;
  }

  return result;
}

function formatClassDeclaration(
  data: ClassDeclarationCodeMetadata,
  memberDeclarations?: (typeof declarations.$inferSelect)[],
): string {
  let result = "";

  // Show class modifiers
  const modifiers = [];
  if (data.isExported) modifiers.push("exported");
  if (data.isDefault) modifiers.push("default");

  if (modifiers.length > 0) {
    result += `*${modifiers.join(", ")} class*\n\n`;
  }

  if (data.extends) {
    result += `**Extends:** \`${data.extends}\`\n`;
  }

  if (data.implements && data.implements.length > 0) {
    result += `**Implements:** ${data.implements.map((impl) => `\`${impl}\``).join(", ")}\n`;
  }

  if (data.extends || (data.implements && data.implements.length > 0)) {
    result += "\n";
  }

  // Show minimal member information - just names and IDs
  if (memberDeclarations && memberDeclarations.length > 0) {
    result += "**Members:**\n";
    for (const memberDeclaration of memberDeclarations) {
      const memberData = memberDeclaration.metadata;
      if (memberData) {
        result += `- **${memberData.codeMetadata?.name}** (ID: \`${memberDeclaration.id}\`)\n`;
      }
    }
    result += "\n";
  }

  return result;
}

function formatEnumDeclaration(data: EnumDeclarationCodeMetadata): string {
  let result = "";

  if (data.enumMembers && data.enumMembers.length > 0) {
    for (const member of data.enumMembers) {
      const initializer = member.initializer ? ` = ${member.initializer}` : "";
      result += `- ${member.name}${initializer}\n`;
    }
    result += "\n";
  }

  return result;
}

function formatNamespaceDeclaration(
  data: NamespaceDeclarationCodeMetadata,
  memberDeclarations?: (typeof declarations.$inferSelect)[],
): string {
  let result = "";

  // Show namespace modifiers
  const modifiers = [];
  if (data.isExported) modifiers.push("exported");
  if (data.isDefault) modifiers.push("default");

  if (modifiers.length > 0) {
    result += `*${modifiers.join(", ")} namespace*\n\n`;
  }

  // Show type parameters if available
  if (data.typeParameters && data.typeParameters.length > 0) {
    result += `**Type Parameters:** ${data.typeParameters.map((param) => `\`${param}\``).join(", ")}\n\n`;
  }

  // Show minimal member information - just names and IDs
  if (memberDeclarations && memberDeclarations.length > 0) {
    result += "**Members:**\n";
    for (const memberDeclaration of memberDeclarations) {
      const memberData = memberDeclaration.metadata;
      if (memberData) {
        result += `- **${memberData.codeMetadata?.name}** (ID: \`${memberDeclaration.id}\`)\n`;
      }
    }
    result += "\n";
  }

  return result;
}

function formatInterfaceOrTypeDeclaration(
  data: InterfaceDeclarationCodeMetadata,
): string {
  let result = "";

  // For interfaces, show extends information
  if (data.type === "interface" && data.extends) {
    result += `**Extends:** \`${data.extends}\`\n\n`;
  }

  return result;
}

function formatVariableDeclaration(data: DeclarationCodeMetadata): string {
  let result = "";

  // Just show mutability if it's not const (since const is most common)
  if (data.type !== "const") {
    result += `*${data.type} variable*\n\n`;
  }

  return result;
}

function formatUsageInfo(data: DeclarationMetadata): string {
  let result = "";

  if (data.semanticData?.usagePattern) {
    const usage = data.semanticData?.usagePattern;

    // Only show the most practical examples (limit to 1-2)
    if (usage.examples && usage.examples.length > 0) {
      const example = usage.examples[0];
      if (example) {
        result += "**Example:**\n";
        result += `\`\`\`typescript\n${example.code}\n\`\`\`\n\n`;
      }
    }

    // Show only critical limitations
    if (usage.limitations && usage.limitations.length > 0) {
      result += `**Note:** ${usage.limitations[0]}\n\n`;
    }
  }

  // Show external dependencies
  if (
    data.codeMetadata?.dependencies &&
    data.codeMetadata.dependencies.length > 0
  ) {
    const externalDeps = data.codeMetadata.dependencies.filter(
      (dep) => dep.type === "external",
    );
    if (externalDeps.length > 0) {
      result += "**Requires:** ";
      result += externalDeps.map((dep) => `\`${dep.packageName}\``).join(", ");
      result += "\n\n";
    }
  }

  return result;
}

export function formatDeclarationData(
  declaration: typeof declarations.$inferSelect,
): string {
  const data = declaration.metadata;

  if (!data) {
    return "";
  }

  let result = formatDeclarationHeader(declaration, data);

  // Dispatch based on declaration type
  switch (data.codeMetadata?.type) {
    case "function":
      result += formatFunctionDeclaration(
        data.codeMetadata as FunctionDeclarationCodeMetadata,
      );
      break;
    case "class":
      result += formatClassDeclaration(
        data.codeMetadata as ClassDeclarationCodeMetadata,
      );
      break;
    case "enum":
      result += formatEnumDeclaration(
        data.codeMetadata as EnumDeclarationCodeMetadata,
      );
      break;
    case "namespace":
      result += formatNamespaceDeclaration(
        data.codeMetadata as NamespaceDeclarationCodeMetadata,
      );
      break;
    case "interface":
    case "type":
      result += formatInterfaceOrTypeDeclaration(
        data.codeMetadata as InterfaceDeclarationCodeMetadata,
      );
      break;
    case "const":
    case "let":
    case "var":
      result += formatVariableDeclaration(
        data.codeMetadata as VariableDeclarationCodeMetadata,
      );
      break;
    default:
      break;
  }

  result += formatUsageInfo(data);

  return result.trim();
}
