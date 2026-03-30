import { z } from "zod";
import type { ForeignKey, PrimaryKey } from "./schema-generator";
import {
  type PopulatedSchemaGenerationConfig,
  UNKNOWN_DATA_TYPE_ZOD_TYPE,
} from "./schema-generation-config";
import { PiquelError, PiquelErrorCode } from "../errors";

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

const getZodType = (
  row: PublicSchemaRow,
  config: PopulatedSchemaGenerationConfig,
): string | null => {
  // Array type information does not contain the element type
  if (row.data_type === config.arrayDataTypeName) {
    return config.zodArrayTypeMap[row.udt_name] ?? null;
  }
  return config.zodTypeMap[row.data_type] ?? null;
};

const parseColumn = (
  row: PublicSchemaRow,
  isPrimaryKey: boolean,
  config: PopulatedSchemaGenerationConfig,
): ColumnToGenerate => {
  const zodType = config.overrideZodType(row) ?? getZodType(row, config);

  if (!zodType && config.allowUnknownDataTypes) {
    return {
      name: row.column_name,
      zodType: UNKNOWN_DATA_TYPE_ZOD_TYPE,
      zodTypeWithoutNullable: UNKNOWN_DATA_TYPE_ZOD_TYPE,
      isPrimaryKey: false,
    };
  }

  if (!zodType) {
    throw new PiquelError(
      PiquelErrorCode.UNKNOWN_DATA_TYPE,
      `${row.data_type}: \n${JSON.stringify(row, null, 2)}`,
    );
  }

  const suffix = row.is_nullable === "YES" ? config.zodNullableSuffix : "";

  return {
    name: row.column_name,
    zodType: `${zodType}${suffix}`,
    zodTypeWithoutNullable: zodType,
    isPrimaryKey,
  };
};

export const parsePublicSchema = (
  rows: PublicSchemaRow[],
  foreignKeys: ForeignKey[],
  primaryKeys: PrimaryKey[],
  config: PopulatedSchemaGenerationConfig,
): TableToGenerate[] => {
  const primaryKeySet = new Set(
    primaryKeys.map((pk) => `${pk.table_name}.${pk.column_name}`),
  );

  const isPrimaryKey = (tableName: string, columnName: string): boolean =>
    primaryKeySet.has(`${tableName}.${columnName}`);

  const isForeignKeyToAPrimaryKey = (fk: ForeignKey): boolean =>
    isPrimaryKey(fk.foreign_table_name, fk.foreign_column_name);

  const tables = new Map<string, TableToGenerate>();

  rows.forEach((row) => {
    if (config.ignoredTables.has(row.table_name)) {
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
    if (foreignKey && isForeignKeyToAPrimaryKey(foreignKey)) {
      const transformedForeignKeyTableName = config.tableNameTransform(
        foreignKey.foreign_table_name,
      );
      const suffix = row.is_nullable === "YES" ? config.zodNullableSuffix : "";
      table.columns.push({
        name: row.column_name,
        zodType: `${transformedForeignKeyTableName}${config.primaryKeySuffix}Schema${suffix}`,
        zodTypeWithoutNullable: `${transformedForeignKeyTableName}${config.primaryKeySuffix}Schema`,
        isPrimaryKey: isPrimaryKey(row.table_name, row.column_name),
      });
    } else {
      table.columns.push(
        parseColumn(row, isPrimaryKey(row.table_name, row.column_name), config),
      );
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
