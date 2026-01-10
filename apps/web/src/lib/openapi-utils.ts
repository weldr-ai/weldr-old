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
}

export function parseOpenApiEndpoint(spec: OpenAPIV3.Document): {
  path: string;
  method: string;
  operation: OpenAPIV3.OperationObject;
} {
  const paths = Object.keys(spec.paths);
  if (paths.length === 0) {
    throw new Error("No paths found in the OpenAPI spec");
  }

  const path = paths[0];

  if (!path) {
    throw new Error("No paths found in OpenAPI spec");
  }

  const pathItem = spec.paths[path] as OpenAPIV3.PathItemObject;
  const method = Object.keys(pathItem).find((key) =>
    ["get", "post", "put", "delete", "patch"].includes(key),
  ) as OpenAPIV3.HttpMethods;

  if (!method) {
    throw new Error("No valid HTTP method found for the path");
  }

  const operation = pathItem[method] as OpenAPIV3.OperationObject;

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

  if (schema.type === "object" && schema.properties) {
    const properties: ParsedSchemaProperties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      properties[key] = parseSchema(value as OpenAPIV3.SchemaObject) as ParsedSchema;
    }
    return {
      type: "object",
      properties,
      required: schema.required || [],
    };
  }

  if (schema.type === "array" && schema.items) {
    return {
      type: "array",
      items: parseSchema(schema.items as OpenAPIV3.SchemaObject),
    };
  }

  return {
    type: schema.type || "unknown",
    format: schema.format,
    description: schema.description,
    enum: schema.enum,
    nullable: schema.nullable,
  };
}

export function parseOpenApiSpec(spec: OpenAPIV3.Document): OpenAPIV3.OperationObject {
  const firstPath = Object.keys(spec.paths)[0];
  if (!firstPath) {
    throw new Error("No paths found in OpenAPI spec");
  }

  const pathItem = spec.paths[firstPath];
  if (!pathItem) {
    throw new Error(`Path ${firstPath} not found in OpenAPI spec`);
  }

  const firstMethod = Object.keys(pathItem)[0] as OpenAPIV3.HttpMethods;
  return pathItem[firstMethod] as OpenAPIV3.OperationObject;
}

export function getParameterFields(operation: OpenAPIV3.OperationObject) {
  return operation.parameters?.filter((param) => "name" in param) || [];
}

export function getRequestBodySchema(
  operation: OpenAPIV3.OperationObject,
): OpenAPIV3.SchemaObject | null {
  const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
  if (requestBody?.content?.["application/json"]) {
    return requestBody.content["application/json"].schema as OpenAPIV3.SchemaObject;
  }
  return null;
}
