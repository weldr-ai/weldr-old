import { MinusIcon, PlusIcon } from "lucide-react";
import type { OpenAPIV3 } from "openapi-types";
import { useState } from "react";

import { nanoid } from "@weldr/shared/nanoid";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@weldr/ui/components/accordion";
import { Badge } from "@weldr/ui/components/badge";
import { Button } from "@weldr/ui/components/button";
import { cn } from "@weldr/ui/lib/utils";

import { getResponseSchema, type ParsedSchema, parseOpenApiEndpoint, parseSchema } from "./utils";

interface OpenApiViewerProps {
  spec: OpenAPIV3.Document | null;
}

function SchemaField({
  name,
  schema,
  required,
  level = 0,
}: {
  name: string;
  schema: ParsedSchema;
  required: boolean;
  level?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const renderType = () => {
    if (schema.type === "array") {
      return `array ${schema.items?.type}[]`;
    }
    return schema.format ? `${schema.type} · ${schema.format}` : schema.type;
  };

  const hasChildren =
    (schema.type === "object" && schema.properties && Object.keys(schema.properties).length > 0) ||
    (schema.type === "array" && schema.items);

  return (
    <div className="flex items-baseline border-b py-1 last:border-0">
      <div className="flex-1">
        <div className="flex flex-col gap-1">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-medium">{name}</span>
              <span className="text-xs text-muted-foreground">{renderType()}</span>
              {required && <span className="text-xs text-destructive">required</span>}
            </div>
            {schema.description && (
              <p className="text-xs text-muted-foreground">{schema.description}</p>
            )}
          </div>
          {hasChildren && (
            <div className="flex items-center justify-start gap-1 text-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-6 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? (
                  <MinusIcon className="mr-1 size-3" />
                ) : (
                  <PlusIcon className="mr-1 size-3" />
                )}
                {isExpanded ? "Hide" : "Show"}
              </Button>
            </div>
          )}
        </div>

        {(schema.type === "object" || schema.type === "array") && (
          <div className="mt-1 space-y-1">
            {isExpanded &&
              schema.type === "object" &&
              schema.properties &&
              Object.entries(schema.properties).map(([key, value]) => (
                <SchemaField
                  key={key}
                  name={key}
                  schema={value as ParsedSchema}
                  required={schema.required?.includes(key) || false}
                  level={level + 1}
                />
              ))}

            {isExpanded && schema.type === "array" && schema.items && (
              <SchemaField
                name={`${name}[]`}
                schema={schema.items}
                required={false}
                level={level + 1}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function OpenApiViewer({ spec }: OpenApiViewerProps) {
  if (!spec) {
    return (
      <div className="flex h-32 items-center justify-center text-center text-xs text-muted-foreground">
        Chat with Weldr to generate the endpoint
      </div>
    );
  }

  const { path, method, operation } = parseOpenApiEndpoint(spec);

  const requestBodySchema = operation.requestBody
    ? (operation.requestBody as OpenAPIV3.RequestBodyObject).content["application/json"]?.schema
    : undefined;

  const requestBodyExample = operation.requestBody
    ? (operation.requestBody as OpenAPIV3.RequestBodyObject).content["application/json"]?.example
    : undefined;

  const parsedRequestBody = requestBodySchema
    ? parseSchema(requestBodySchema as OpenAPIV3.SchemaObject)
    : undefined;

  const hasResponses = operation.responses ? Object.keys(operation.responses).length > 0 : false;

  const hasParameters = operation.parameters && operation.parameters.length > 0;
  const hasSecurity = operation.security && operation.security.length > 0;
  const hasContent = parsedRequestBody || hasResponses || hasParameters;

  // Group parameters by their location (in)
  const groupedParameters = operation.parameters?.reduce(
    (acc, param) => {
      const parameter = param as OpenAPIV3.ParameterObject;
      const location = parameter.in;
      if (!acc[location]) {
        acc[location] = [];
      }
      acc[location].push(parameter);
      return acc;
    },
    {} as Record<string, OpenAPIV3.ParameterObject[]>,
  );

  return (
    <div className="w-full space-y-2">
      {/* Header */}
      <div className="flex flex-col items-start gap-1">
        {/* Method and Path */}
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center space-x-2">
            <Badge
              className={cn("font-bold uppercase", {
                "bg-primary/30 text-primary hover:bg-primary/30": method === "get",
                "bg-success/30 text-success hover:bg-success/30": method === "post",
                "bg-warning/30 text-warning hover:bg-warning/30":
                  method === "put" || method === "patch",
                "bg-destructive/30 text-destructive hover:bg-destructive/30": method === "delete",
              })}
            >
              {method}
            </Badge>
            <span className="font-mono text-xs">{path}</span>
          </div>
        </div>
        {operation.description && (
          <p className="text-xs whitespace-pre-wrap text-muted-foreground">
            {operation.description}
          </p>
        )}
        {operation.tags && operation.tags.length > 0 && (
          <div className="flex gap-1">
            {operation.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {hasContent ? (
        <div className="space-y-2">
          {/* Parameters */}
          {hasParameters && (
            <div>
              <span className="text-xs font-semibold">Parameters</span>
              <Accordion multiple className="w-full">
                {Object.entries(groupedParameters || {}).map(([location, params]) => (
                  <AccordionItem key={location} value={location} className="border-b-0">
                    <AccordionTrigger className="py-1 text-xs hover:no-underline">
                      {location.charAt(0).toUpperCase() + location.slice(1)} Parameters
                    </AccordionTrigger>
                    <AccordionContent className="p-0 pb-1">
                      <div className="space-y-1">
                        {params.map((parameter) => (
                          <div
                            key={parameter.name}
                            className="flex items-baseline border-b py-1 last:border-0"
                          >
                            <div className="flex-1">
                              <div className="flex items-baseline gap-1">
                                <span className="text-xs font-medium">{parameter.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {(parameter.schema as OpenAPIV3.SchemaObject)?.type}
                                </span>
                                {parameter.required && (
                                  <span className="text-xs text-destructive">required</span>
                                )}
                              </div>
                              {parameter.description && (
                                <p className="text-xs text-muted-foreground">
                                  {parameter.description}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

          {/* Request Body */}
          {parsedRequestBody && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Body</span>
                <span className="items-center justify-center rounded-full border px-1 py-0.5 text-xs">
                  application/json
                </span>
              </div>
              {Object.entries(parsedRequestBody.properties || {}).map(([key, value]) => (
                <SchemaField
                  key={key}
                  name={key}
                  schema={value as ParsedSchema}
                  required={parsedRequestBody.required?.includes(key) || false}
                />
              ))}
              {requestBodyExample && (
                <div className="mt-1">
                  <span className="text-xs font-semibold">Example:</span>
                  <pre className="mt-1 rounded-lg bg-muted p-2 text-xs">
                    {JSON.stringify(requestBodyExample, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Responses */}
          {hasResponses && (
            <div>
              <span className="text-xs font-semibold">Responses</span>
              <Accordion multiple>
                {Object.entries(operation.responses).map(([code, response]) => {
                  const responseSchema = getResponseSchema(operation, code);
                  const parsedSchema = responseSchema
                    ? parseSchema(responseSchema as OpenAPIV3.SchemaObject)
                    : undefined;
                  const responseObj = response as OpenAPIV3.ResponseObject;
                  const example = responseObj.content?.["application/json"]?.example;

                  return (
                    <AccordionItem key={code} value={code} className="border-b-0 last:border-0">
                      <AccordionTrigger className="py-1 text-xs hover:no-underline">
                        <div className="flex items-center space-x-2 text-xs">
                          <span className="font-medium">{code}</span>
                          <span>{responseObj.description}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="p-0 pb-1">
                        <p className="text-xs text-muted-foreground">{responseObj.description}</p>
                        <div>
                          {parsedSchema?.properties &&
                            Object.entries(parsedSchema.properties).map(([key, value]) => (
                              <SchemaField
                                key={key}
                                name={key}
                                schema={value as ParsedSchema}
                                required={parsedSchema.required?.includes(key) || false}
                              />
                            ))}
                        </div>
                        {example && (
                          <div>
                            <span className="text-xs font-semibold">Example:</span>
                            <pre className="mt-1 rounded-lg bg-muted p-2 text-xs">
                              {JSON.stringify(example, null, 2)}
                            </pre>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>
          )}

          {/* Security */}
          {hasSecurity && (
            <div>
              <span className="text-xs font-semibold">Security</span>
              <div className="mt-1 flex flex-col gap-1">
                {operation.security?.map((security) => (
                  <div
                    key={nanoid()}
                    className="flex flex-col gap-1 rounded-lg border bg-muted/50 p-2"
                  >
                    {Object.entries(security).map(([scheme, scopes]) => (
                      <div key={scheme} className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Badge variant="outline">{scheme}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {scheme === "bearerAuth" ? "Bearer Token Authentication" : scheme}
                          </span>
                        </div>
                        {scopes.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {scopes.map((scope) => (
                              <span key={scope} className="text-xs">
                                {scope}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-4 text-center text-xs text-muted-foreground">
          This endpoint has not been fully defined yet
        </div>
      )}
    </div>
  );
}
