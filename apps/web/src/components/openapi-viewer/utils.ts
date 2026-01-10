import type { OpenAPIV3 } from "openapi-types";

interface ParsedSchemaProperties {
  [key: string]: ParsedSchema;
}

export interface ParsedSchema {
  type: string | undefined;
  properties?: ParsedSchemaProperties;
  required?: string[];
  items?: ParsedSchema;
  format?: string;
  description?: string;
  enum?: unknown[];
  nullable?: boolean;
  example?: unknown;
  examples?: Record<string, unknown>;
}

export function parseOpenApiEndpoint(
  spec: OpenAPIV3.Document,
  targetPath?: string,
  targetMethod?: string,
): {
  path: string;
  method: string;
  operation: OpenAPIV3.OperationObject;
} {
  const paths = Object.keys(spec.paths);
  if (paths.length === 0) {
    throw new Error("No paths found in the OpenAPI spec");
  }

  const path = targetPath || paths[0];
  if (!path) {
    throw new Error("No paths found in OpenAPI spec");
  }

  const pathItem = spec.paths[path] as OpenAPIV3.PathItemObject;
  const isHttpMethod = (key: string): key is OpenAPIV3.HttpMethods =>
    ["get", "post", "put", "delete", "patch"].includes(key as OpenAPIV3.HttpMethods);

  const method = targetMethod || Object.keys(pathItem).find(isHttpMethod);

  if (!method || !isHttpMethod(method)) {
    throw new Error("No valid HTTP method found for the path");
  }

  const operation = pathItem[method] as OpenAPIV3.OperationObject;
  if (!operation) {
    throw new Error(`Operation not found for method ${method}`);
  }
  return { path, method, operation };
}

export function getResponseSchema(
  operation: OpenAPIV3.OperationObject,
  statusCode: string,
): OpenAPIV3.SchemaObject | undefined {
  const response = operation.responses[statusCode] as OpenAPIV3.ResponseObject;
  if (response?.content?.["application/json"]) {
    return response.content["application/json"].schema as OpenAPIV3.SchemaObject;
  }
  return undefined;
}

export function parseSchema(schema: OpenAPIV3.SchemaObject | undefined): ParsedSchema | undefined {
  if (!schema) return undefined;

  const baseSchema: ParsedSchema = {
    type: schema.type || "unknown",
    format: schema.format,
    description: schema.description,
    enum: schema.enum,
    nullable: schema.nullable,
    example: schema.example,
  };

  if (schema.type === "object" && schema.properties) {
    const properties: ParsedSchemaProperties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      properties[key] = parseSchema(value as OpenAPIV3.SchemaObject) as ParsedSchema;
    }
    return {
      ...baseSchema,
      properties,
      required: schema.required || [],
    };
  }

  if (schema.type === "array" && schema.items) {
    return {
      ...baseSchema,
      items: parseSchema(schema.items as OpenAPIV3.SchemaObject),
    };
  }

  return baseSchema;
}

export function getRequestBodySchema(operation: OpenAPIV3.OperationObject): {
  schema: OpenAPIV3.SchemaObject | null;
  required: boolean;
  description?: string;
} {
  const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
  return {
    schema: (requestBody?.content?.["application/json"]?.schema as OpenAPIV3.SchemaObject) || null,
    required: requestBody?.required || false,
    description: requestBody?.description,
  };
}

export function getParameterFields(operation: OpenAPIV3.OperationObject) {
  return (operation.parameters?.filter((param) => "name" in param) ||
    []) as OpenAPIV3.ParameterObject[];
}
