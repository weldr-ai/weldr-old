import type {
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { DecoratorNode } from "lexical";
import type { ReactNode } from "react";
import type { z } from "zod";

import type { referencePartSchema } from "@weldr/shared/validators/chats";

import { ReferenceBadge } from "../../reference-badge";

export type SerializedReferenceNode = Spread<
  z.infer<typeof referencePartSchema>,
  SerializedLexicalNode
>;

export class ReferenceNode extends DecoratorNode<ReactNode> {
  __reference: z.infer<typeof referencePartSchema>;

  constructor(reference: z.infer<typeof referencePartSchema>, key?: string) {
    super(key);
    this.__reference = reference;
  }

  static getType(): string {
    return "reference";
  }

  static clone(node: ReferenceNode): ReferenceNode {
    return new ReferenceNode(node.exportJSON(), node.__key);
  }

  static importJSON(serializedNode: SerializedReferenceNode): ReferenceNode {
    const node = $createReferenceNode(serializedNode);
    return node;
  }

  exportJSON(): SerializedReferenceNode {
    const base = {
      id: this.__reference.id,
      type: this.__reference.type,
      ...Object.fromEntries(
        Object.entries(this.__reference).filter(([key]) => key !== "type"),
      ),
    };

    if (this.__reference.type === "endpoint") {
      return {
        ...base,
        method: this.__reference.method,
        path: this.__reference.path,
      } as SerializedReferenceNode;
    }

    return {
      ...base,
      name: this.__reference.name,
    } as SerializedReferenceNode;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span");
    element.setAttribute("data-lexical-reference", "true");
    return { element };
  }

  getTextContent(): string {
    if (this.__reference.type === "endpoint") {
      return `${this.__reference.method.toUpperCase()} ${this.__reference.path}`;
    }

    return this.__reference.name;
  }

  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    const dom = document.createElement("span");
    dom.setAttribute("data-lexical-reference", "true");
    return dom;
  }

  updateDOM(): false {
    return false;
  }

  decorate() {
    return <ReferenceBadge reference={this.__reference} />;
  }
}

export function $createReferenceNode(
  referenceNode: z.infer<typeof referencePartSchema>,
): ReferenceNode {
  return new ReferenceNode(referenceNode);
}

export function $isReferenceNode(
  node: LexicalNode | null | undefined,
): node is ReferenceNode {
  return node instanceof ReferenceNode;
}
