import { z } from "zod";
import { sql } from "../database/sql/sql-builder";
import { createOperation } from "../database/operations";
import type { EnumType } from "./table-parser";

export const publicSchemaValidator = z.object({
  table_schema: z.string(),
  table_name: z.string(),
  column_name: z.string(),
  data_type: z.string(),
  is_nullable: z.string(),
  udt_name: z.string(),
});

export type PublicSchemaRow = z.infer<typeof publicSchemaValidator>;

const foreignKeyValidator = z.object({
  table_name: z.string(),
  column_name: z.string(),
  foreign_table_name: z.string(),
  foreign_column_name: z.string(),
});

export type ForeignKey = z.infer<typeof foreignKeyValidator>;

const primaryKeyValidator = z.object({
  table_name: z.string(),
  column_name: z.string(),
});

export type PrimaryKey = z.infer<typeof primaryKeyValidator>;

const tableTypeValidator = z.object({
  table_name: z.string(),
  table_type: z.string(),
});

export type TableTypeRow = z.infer<typeof tableTypeValidator>;

const enumRowValidator = z.object({
  typname: z.string(),
  enumlabel: z.string(),
});

type EnumRow = z.infer<typeof enumRowValidator>;

export const fetchColumns = createOperation(
  sql`SELECT * FROM information_schema.columns WHERE table_schema = 'public'`,
  publicSchemaValidator,
);

export const fetchForeignKeys = createOperation(
  sql`
    SELECT
      source_table.relname AS table_name,
      source_column.attname AS column_name,
      foreign_table.relname AS foreign_table_name,
      foreign_column.attname AS foreign_column_name
    FROM pg_constraint constraint_definition
    JOIN pg_class source_table
      ON source_table.oid = constraint_definition.conrelid
    JOIN pg_namespace source_schema
      ON source_schema.oid = source_table.relnamespace
    JOIN pg_class foreign_table
      ON foreign_table.oid = constraint_definition.confrelid
    JOIN pg_namespace foreign_schema
      ON foreign_schema.oid = foreign_table.relnamespace
    JOIN LATERAL unnest(constraint_definition.conkey, constraint_definition.confkey) WITH ORDINALITY
      AS paired_columns(source_attnum, foreign_attnum, ord)
      ON true
    JOIN pg_attribute source_column
      ON source_column.attrelid = constraint_definition.conrelid
      AND source_column.attnum = paired_columns.source_attnum
    JOIN pg_attribute foreign_column
      ON foreign_column.attrelid = constraint_definition.confrelid
      AND foreign_column.attnum = paired_columns.foreign_attnum
    WHERE constraint_definition.contype = 'f'
      AND source_schema.nspname = 'public'
      AND foreign_schema.nspname = 'public'
    ORDER BY source_table.relname, paired_columns.ord`,
  foreignKeyValidator,
);

export const fetchPrimaryKeys = createOperation(
  sql`
    SELECT
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema='public'`,
  primaryKeyValidator,
);

export const fetchTableTypes = createOperation(
  sql`SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public'`,
  tableTypeValidator,
);

export const fetchEnumRows = createOperation(
  sql`
    SELECT t.typname, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder`,
  enumRowValidator,
);

export const groupEnumRows = (enumRows: EnumRow[]): EnumType[] => {
  const enumMap = new Map<string, string[]>();
  for (const row of enumRows) {
    const labels = enumMap.get(row.typname) ?? [];
    labels.push(row.enumlabel);
    enumMap.set(row.typname, labels);
  }

  const enumTypes: EnumType[] = [];
  for (const [name, labels] of enumMap) {
    enumTypes.push({ name, labels });
  }

  return enumTypes;
};
