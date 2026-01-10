import { type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

type ColumnData<Colum extends PgColumn> = Colum["_"]["data"];

export function mergeJson<
  Colum extends PgColumn,
  CustomType extends ColumnData<Colum> = ColumnData<Colum>,
>(column: Colum, data: Partial<CustomType> | null): SQL;

export function mergeJson<
  Colum extends PgColumn,
  CustomType extends ColumnData<Colum> = ColumnData<Colum>,
  Key extends keyof CustomType = keyof CustomType,
>(column: Colum, field: Key, data: Partial<CustomType[Key]> | null): SQL;

export function mergeJson<
  Colum extends PgColumn,
  CustomType extends ColumnData<Colum> = ColumnData<Colum>,
  Key extends keyof CustomType = keyof CustomType,
>(column: Colum, fieldOrData: Key | Partial<CustomType>, data?: Partial<CustomType[Key]> | null) {
  if (typeof fieldOrData === "string") {
    return sql`jsonb_set(${column}, '{${sql.raw(String(fieldOrData))}}', ${data ? sql`${column} -> '${sql.raw(String(fieldOrData))}' || ${JSON.stringify(data)}` : "null"})`;
  }
  return sql`coalesce(${column}, '{}') || ${fieldOrData ? JSON.stringify(fieldOrData) : null}`;
}
