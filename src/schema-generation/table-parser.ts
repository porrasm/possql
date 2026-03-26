import { z } from "zod";
import type { ForeignKey } from "./schema-generator";
import { config, UNKNOWN_DATA_TYPE_ZOD_TYPE } from "./schema-generation-config";

export interface ColumnToGenerate {
  name: string;
  isPrimaryKey: boolean;
  zodType: string;
  zodTypeWithoutNullable: string;
}

export interface TableToGenerate {
  name: string;
  columns: ColumnToGenerate[];
}

export const publicSchemaValidator = z.object({
  table_schema: z.string(),
  table_name: z.string(),
  column_name: z.string(),
  data_type: z.string(),
  is_nullable: z.string(),
  udt_name: z.string(),
});

export type PublicSchemaRow = z.infer<typeof publicSchemaValidator>;

const getZodType = (row: PublicSchemaRow): string | null => {
  // Array type information does not contain the element type
  if (row.data_type === config().arrayDataTypeName) {
    return config().zodArrayTypeMap[row.udt_name] ?? null;
  }
  return config().zodTypeMap[row.data_type] ?? null;
};

const parseColumn = (row: PublicSchemaRow): ColumnToGenerate => {
  const zodType = getZodType(row);

  if (!zodType && config().allowUnknownDataTypes) {
    return {
      name: row.column_name,
      zodType: UNKNOWN_DATA_TYPE_ZOD_TYPE,
      zodTypeWithoutNullable: UNKNOWN_DATA_TYPE_ZOD_TYPE,
      isPrimaryKey: false,
    };
  }

  if (!zodType) {
    throw new Error(
      `Unknown data type: ${row.data_type}: \n${JSON.stringify(row, null, 2)}`,
    );
  }

  const suffix = row.is_nullable === "YES" ? config().zodNullableSuffix : "";

  return {
    name: row.column_name,
    zodType: `${zodType}${suffix}`,
    zodTypeWithoutNullable: zodType,
    isPrimaryKey: row.column_name === `${row.table_name}_id`,
  };
};

export const parsePublicSchema = (
  rows: PublicSchemaRow[],
  foreignKeys: ForeignKey[],
): TableToGenerate[] => {
  const tableIds = rows
    .filter((row) => row.column_name === `${row.table_name}_id`)
    .map((row) => row.column_name);

  const tables = new Map<string, TableToGenerate>();

  rows.forEach((row) => {
    if (config().ignoredTables.has(row.table_name)) {
      return;
    }

    const table = tables.get(row.table_name) ?? {
      name: row.table_name,
      columns: [],
    };

    const foreignKey = foreignKeys.find(
      (foreignKey) =>
        foreignKey.table_name === row.table_name &&
        foreignKey.column_name === row.column_name,
    );
    if (foreignKey && tableIds.includes(foreignKey.foreign_column_name)) {
      const transformedForeignKeyTableName = config().tableNameTransform(
        foreignKey.foreign_table_name,
      );
      const suffix =
        row.is_nullable === "YES" ? config().zodNullableSuffix : "";
      table.columns.push({
        name: row.column_name,
        zodType: `${transformedForeignKeyTableName}${config().primaryKeySuffix}Schema${suffix}`,
        zodTypeWithoutNullable: `${transformedForeignKeyTableName}${config().primaryKeySuffix}Schema`,
        // Todo: recognize primary key automatically
        isPrimaryKey: row.column_name === `${row.table_name}_id`,
      });
    } else {
      table.columns.push(parseColumn(row));
    }

    tables.set(row.table_name, table);
  });
  for (const table of tables.values()) {
    table.columns.sort((a, b) => a.name.localeCompare(b.name));
  }
  return Array.from(tables.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
};
