import * as ts from "typescript";

import type { DeclarationPosition } from "@weldr/shared/types/declarations";

// Extract parameter information from TypeScript nodes
export function extractParameterInfo(param: ts.ParameterDeclaration): {
  name: string;
  type: string;
  isOptional: boolean;
  isRest: boolean;
} {
  const name = ts.isIdentifier(param.name) ? param.name.text : "_complex_param";
  const type = param.type ? extractTypeAnnotation(param.type) : "any";
  const isOptional = !!param.questionToken;
  const isRest = !!param.dotDotDotToken;

  return {
    name,
    type,
    isOptional,
    isRest,
  };
}

// Extract type parameters (generics) from TypeScript nodes
export function extractTypeParameters(
  typeParams: ts.NodeArray<ts.TypeParameterDeclaration>,
): string[] {
  return typeParams.map((param) => {
    let str = param.name.text;
    if (param.constraint) {
      str += ` extends ${extractType(param.constraint)}`;
    }
    if (param.default) {
      str += ` = ${extractType(param.default)}`;
    }
    return str;
  });
}

// Extract type annotation from TypeScript nodes
export function extractTypeAnnotation(typeNode: ts.TypeNode): string {
  return extractType(typeNode);
}

// Extract expression type (for extends/implements) from TypeScript nodes
export function extractExpressionType(expr: ts.LeftHandSideExpression): string {
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return `${extractExpressionType(expr.expression)}.${expr.name.text}`;
  }
  return expr.getText();
}

// Comprehensive type extraction for TypeScript nodes
export function extractType(type: ts.TypeNode): string {
  switch (type.kind) {
    case ts.SyntaxKind.StringKeyword:
      return "string";
    case ts.SyntaxKind.NumberKeyword:
      return "number";
    case ts.SyntaxKind.BooleanKeyword:
      return "boolean";
    case ts.SyntaxKind.VoidKeyword:
      return "void";
    case ts.SyntaxKind.AnyKeyword:
      return "any";
    case ts.SyntaxKind.UnknownKeyword:
      return "unknown";
    case ts.SyntaxKind.NeverKeyword:
      return "never";
    case ts.SyntaxKind.UndefinedKeyword:
      return "undefined";
    case ts.SyntaxKind.NullKeyword:
      return "null";
    case ts.SyntaxKind.ObjectKeyword:
      return "object";
    case ts.SyntaxKind.SymbolKeyword:
      return "symbol";
    case ts.SyntaxKind.BigIntKeyword:
      return "bigint";

    case ts.SyntaxKind.TypeReference: {
      const typeRef = type as ts.TypeReferenceNode;
      let base = ts.isIdentifier(typeRef.typeName)
        ? typeRef.typeName.text
        : typeRef.typeName.getText();

      if (typeRef.typeArguments) {
        const params = typeRef.typeArguments.map((arg) => extractType(arg)).join(", ");
        base += `<${params}>`;
      }
      return base;
    }

    case ts.SyntaxKind.ArrayType: {
      const arrayType = type as ts.ArrayTypeNode;
      return `${extractType(arrayType.elementType)}[]`;
    }

    case ts.SyntaxKind.TupleType: {
      const tupleType = type as ts.TupleTypeNode;
      const elements = tupleType.elements.map((e) => extractType(e)).join(", ");
      return `[${elements}]`;
    }

    case ts.SyntaxKind.UnionType: {
      const unionType = type as ts.UnionTypeNode;
      return unionType.types.map((t) => extractType(t)).join(" | ");
    }

    case ts.SyntaxKind.IntersectionType: {
      const intersectionType = type as ts.IntersectionTypeNode;
      return intersectionType.types.map((t) => extractType(t)).join(" & ");
    }

    case ts.SyntaxKind.ThisType:
      return "this";

    case ts.SyntaxKind.FunctionType: {
      const funcType = type as ts.FunctionTypeNode;
      const params = funcType.parameters
        .map((p) => extractParameterInfo(p))
        .map((p) => `${p.name}: ${p.type}`)
        .join(", ");
      const returnType = extractType(funcType.type);
      return `(${params}) => ${returnType}`;
    }

    case ts.SyntaxKind.TypeLiteral: {
      const typeLiteral = type as ts.TypeLiteralNode;
      const memberStrs = typeLiteral.members
        .map((member) => {
          if (ts.isPropertySignature(member) && ts.isIdentifier(member.name)) {
            const optional = member.questionToken ? "?" : "";
            const memberType = member.type ? extractType(member.type) : "any";
            return `${member.name.text}${optional}: ${memberType}`;
          }
          return "";
        })
        .filter(Boolean);
      return `{ ${memberStrs.join("; ")} }`;
    }

    case ts.SyntaxKind.LiteralType: {
      const literalType = type as ts.LiteralTypeNode;
      if (ts.isStringLiteral(literalType.literal)) {
        return `"${literalType.literal.text}"`;
      }
      if (ts.isNumericLiteral(literalType.literal)) {
        return literalType.literal.text;
      }
      if (literalType.literal.kind === ts.SyntaxKind.TrueKeyword) {
        return "true";
      }
      if (literalType.literal.kind === ts.SyntaxKind.FalseKeyword) {
        return "false";
      }
      return "literal";
    }

    case ts.SyntaxKind.TypeQuery: {
      const typeQuery = type as ts.TypeQueryNode;
      return `typeof ${typeQuery.exprName.getText()}`;
    }

    case ts.SyntaxKind.ConditionalType: {
      const conditionalType = type as ts.ConditionalTypeNode;
      const check = extractType(conditionalType.checkType);
      const ext = extractType(conditionalType.extendsType);
      const trueTy = extractType(conditionalType.trueType);
      const falseTy = extractType(conditionalType.falseType);
      return `${check} extends ${ext} ? ${trueTy} : ${falseTy}`;
    }

    case ts.SyntaxKind.IndexedAccessType: {
      const indexedAccess = type as ts.IndexedAccessTypeNode;
      const obj = extractType(indexedAccess.objectType);
      const idx = extractType(indexedAccess.indexType);
      return `${obj}[${idx}]`;
    }

    case ts.SyntaxKind.ParenthesizedType: {
      const parenthesized = type as ts.ParenthesizedTypeNode;
      return `(${extractType(parenthesized.type)})`;
    }

    case ts.SyntaxKind.MappedType: {
      const mappedType = type as ts.MappedTypeNode;
      const typeParam = mappedType.typeParameter;
      const nameType = mappedType.nameType ? ` as ${extractType(mappedType.nameType)}` : "";
      const questionToken = mappedType.questionToken ? "?" : "";
      const readonlyToken = mappedType.readonlyToken ? "readonly " : "";
      const constraint = typeParam.constraint ? ` in ${extractType(typeParam.constraint)}` : "";
      const mappedTypeResult = mappedType.type ? extractType(mappedType.type) : "any";
      return `{ ${readonlyToken}[${typeParam.name.text}${constraint}]${nameType}${questionToken}: ${mappedTypeResult} }`;
    }

    case ts.SyntaxKind.TemplateLiteralType: {
      const templateType = type as ts.TemplateLiteralTypeNode;
      let result = `\`${templateType.head.text}`;
      for (let i = 0; i < templateType.templateSpans.length; i++) {
        const span = templateType.templateSpans[i];
        if (span) {
          result += `\${${extractType(span.type)}${span.literal.text}`;
        }
      }
      result += "`}";
      return result;
    }

    case ts.SyntaxKind.ImportType: {
      const importType = type as ts.ImportTypeNode;
      const moduleSpecifier = importType.argument.getText();
      const qualifier = importType.qualifier ? `.${importType.qualifier.getText()}` : "";
      const typeArgs = importType.typeArguments
        ? `<${importType.typeArguments.map((arg) => extractType(arg)).join(", ")}>`
        : "";
      return `import(${moduleSpecifier})${qualifier}${typeArgs}`;
    }

    case ts.SyntaxKind.RestType: {
      const restType = type as ts.RestTypeNode;
      return `...${extractType(restType.type)}`;
    }

    case ts.SyntaxKind.NamedTupleMember: {
      const namedTuple = type as ts.NamedTupleMember;
      const optional = namedTuple.questionToken ? "?" : "";
      const dotDotDot = namedTuple.dotDotDotToken ? "..." : "";
      return `${dotDotDot}${namedTuple.name.getText()}${optional}: ${extractType(namedTuple.type)}`;
    }

    default:
      return type.getText() || "any";
  }
}

// Get position information from TypeScript nodes
export function getNodePosition(node: ts.Node, sourceFile: ts.SourceFile): DeclarationPosition {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

  return {
    start: {
      line: start.line + 1, // TypeScript uses 0-based lines, we want 1-based
      column: start.character + 1,
    },
    end: {
      line: end.line + 1,
      column: end.character + 1,
    },
  };
}

// Extract raw code from TypeScript nodes
export function extractRawCode(node: ts.Node, sourceCode: string): string {
  return sourceCode.slice(node.getStart(), node.getEnd());
}

// Infer type from expression for TypeScript nodes
export function inferTypeFromExpression(expr: ts.Expression): string {
  switch (expr.kind) {
    case ts.SyntaxKind.StringLiteral:
      return "string";
    case ts.SyntaxKind.NumericLiteral:
      return "number";
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
      return "boolean";
    case ts.SyntaxKind.NullKeyword:
      return "null";
    case ts.SyntaxKind.ArrayLiteralExpression:
      return "any[]";
    case ts.SyntaxKind.ObjectLiteralExpression:
      return "object";
    case ts.SyntaxKind.FunctionExpression:
    case ts.SyntaxKind.ArrowFunction: {
      const func = expr as ts.FunctionExpression | ts.ArrowFunction;
      const params = func.parameters.map((p) => extractParameterInfo(p));
      const paramStr = params.map((p) => `${p.name}: ${p.type}`).join(", ");
      const returnType = func.type ? extractType(func.type) : "any";
      return `(${paramStr}) => ${returnType}`;
    }
    case ts.SyntaxKind.Identifier:
      return "any"; // Can't infer without context
    default:
      return "any";
  }
}

// Infer return type from function body by analyzing return statements
export function inferReturnTypeFromFunctionBody(
  funcDecl:
    | ts.FunctionDeclaration
    | ts.MethodDeclaration
    | ts.FunctionExpression
    | ts.ArrowFunction,
  parameters: {
    name: string;
    type: string;
    isOptional: boolean;
    isRest: boolean;
  }[],
): string {
  if (!funcDecl.body) {
    return "void";
  }

  const returnTypes: string[] = [];
  let hasVoidReturn = false;

  // Helper function to visit nodes and find return statements
  function visitNode(node: ts.Node) {
    if (ts.isReturnStatement(node)) {
      if (node.expression) {
        // Try to infer the type of the return expression
        const returnType = inferTypeFromReturnExpression(node.expression, parameters);
        returnTypes.push(returnType);
      } else {
        // return; with no expression
        hasVoidReturn = true;
      }
    }

    // Recursively visit child nodes
    ts.forEachChild(node, visitNode);
  }

  visitNode(funcDecl.body);

  // If no return statements found, check if it's an arrow function with expression body
  if (returnTypes.length === 0 && !hasVoidReturn) {
    if (ts.isArrowFunction(funcDecl) && !ts.isBlock(funcDecl.body)) {
      // Arrow function with expression body like: (x) => x
      const returnType = inferTypeFromReturnExpression(funcDecl.body, parameters);
      returnTypes.push(returnType);
    } else {
      // No return statements and not an expression arrow function
      return "void";
    }
  }

  // Combine return types
  if (returnTypes.length === 0) {
    return hasVoidReturn ? "void" : "void";
  }

  if (hasVoidReturn) {
    returnTypes.push("void");
  }

  // Remove duplicates and create union type if needed
  const uniqueTypes = [...new Set(returnTypes)];

  if (uniqueTypes.length === 1) {
    return uniqueTypes[0] ?? "any";
  }

  return uniqueTypes.join(" | ");
}

// Helper function to infer type from return expression
function inferTypeFromReturnExpression(
  expr: ts.Expression,
  parameters: {
    name: string;
    type: string;
    isOptional: boolean;
    isRest: boolean;
  }[],
): string {
  // If returning a parameter directly, use the parameter's type
  if (ts.isIdentifier(expr)) {
    const param = parameters.find((p) => p.name === expr.text);
    if (param) {
      return param.type;
    }
  }

  // For other expressions, use the existing inference logic
  return inferTypeFromExpression(expr);
}
