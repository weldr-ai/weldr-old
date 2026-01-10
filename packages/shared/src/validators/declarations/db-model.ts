import { z } from "zod";

export const dbModelDeclarationSpecsSchema = z.object({
  type: z.literal("db-model"),
  name: z
    .string()
    .describe(
      "The name of the table in the database. Must be lowercase, snake_case, and plural (e.g. users, posts)",
    ),
  columns: z
    .object({
      name: z.string().describe("The name of the column"),
      type: z.string().describe("The type of the column"),
      required: z.boolean().optional().describe("Whether the field is required"),
      nullable: z.boolean().optional().default(true).describe("Whether the field is nullable"),
      unique: z.boolean().optional().describe("Whether the field is unique"),
      default: z.unknown().optional().describe("The default value of the field"),
      isPrimaryKey: z.boolean().optional().describe("Whether the field is a primary key"),
      autoIncrement: z.boolean().optional().describe("Whether the field is auto-incremented"),
    })
    .array()
    .describe("The fields/columns of the model"),
  relationships: z
    .object({
      type: z.enum(["oneToOne", "oneToMany", "manyToOne", "manyToMany"]),
      referencedModel: z.string().describe("The name of the related model"),
      referencedColumn: z.string().describe("The column name in the related model"),
      onDelete: z
        .enum(["CASCADE", "SET_NULL", "RESTRICT", "NO_ACTION"])
        .optional()
        .describe("The deletion behavior for related records"),
      onUpdate: z
        .enum(["CASCADE", "SET_NULL", "RESTRICT", "NO_ACTION"])
        .optional()
        .describe("The update behavior for related records"),
    })
    .array()
    .optional()
    .describe("The relationships of the model"),
  indexes: z
    .object({
      name: z.string().describe("The name of the index"),
      columns: z.array(z.string()).describe("The columns that make up the index"),
      unique: z.boolean().optional().describe("Whether the index is unique"),
    })
    .array()
    .optional()
    .describe("The indexes of the model"),
});
