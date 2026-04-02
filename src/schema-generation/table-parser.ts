import type {
  ForeignKey,
  PrimaryKey,
  PublicSchemaRow,
} from "./metadata-queries";
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

export interface EnumType {
  name: string;
  labels: string[];
}

const USER_DEFINED_DATA_TYPE = "USER-DEFINED";

/** PostgreSQL prefixes array udt_names with an underscore (e.g. `_status_enum`). */
const enumNameFromArrayUdtName = (udtName: string): string =>
  udtName.replace(/^_/, "");

const getArrayZodType = ({
  row,
  enumMap,
  config,
}: {
  row: PublicSchemaRow;
  enumMap: Map<string, EnumType>;
  config: PopulatedSchemaGenerationConfig;
}): string | null => {
  const arrayType = config.zodArrayTypeMap[row.udt_name];
  if (arrayType) {
    return arrayType;
  }
  const enumType = enumMap.get(enumNameFromArrayUdtName(row.udt_name));
  if (enumType) {
    return `z.array(${enumType.name}Schema)`;
  }
  return null;
};

/**
 * Returns the automatically generated Zod type for a column.
 * Automatically handles array and enum types.
 */
const getZodType = ({
  row,
  enumMap,
  config,
}: {
  row: PublicSchemaRow;
  enumMap: Map<string, EnumType>;
  config: PopulatedSchemaGenerationConfig;
}): string | null => {
  // Array type information does not contain the element type
  if (row.data_type === config.arrayDataTypeName) {
    return getArrayZodType({ row, enumMap, config });
  }
  // Enum types show up as USER-DEFINED with udt_name matching the enum name
  if (row.data_type === USER_DEFINED_DATA_TYPE) {
    const enumType = enumMap.get(row.udt_name);
    if (enumType) {
      return `${enumType.name}Schema`;
    }
  }
  return config.zodTypeMap[row.data_type] ?? null;
};

const parseColumn = ({
  row,
  isPrimaryKey,
  enumMap,
  config,
}: {
  row: PublicSchemaRow;
  isPrimaryKey: boolean;
  enumMap: Map<string, EnumType>;
  config: PopulatedSchemaGenerationConfig;
}): ColumnToGenerate => {
  const zodType =
    config.overrideZodType(row) ?? getZodType({ row, enumMap, config });

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

export interface ParsedSchema {
  tables: TableToGenerate[];
  enums: EnumType[];
}

const getUsedEnums = ({
  rows,
  enumMap,
  enumTypes,
  config,
}: {
  rows: PublicSchemaRow[];
  enumMap: Map<string, EnumType>;
  enumTypes: EnumType[];
  config: PopulatedSchemaGenerationConfig;
}): EnumType[] => {
  // Only include enums that are actually used by columns in the schema
  const usedEnumNames = new Set<string>();
  for (const row of rows) {
    if (row.data_type === USER_DEFINED_DATA_TYPE && enumMap.has(row.udt_name)) {
      usedEnumNames.add(row.udt_name);
    }
    if (row.data_type === config.arrayDataTypeName) {
      const enumName = enumNameFromArrayUdtName(row.udt_name);
      if (enumMap.has(enumName)) {
        usedEnumNames.add(enumName);
      }
    }
  }
  const usedEnums = enumTypes
    .filter((e) => usedEnumNames.has(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  return usedEnums;
};

export const parsePublicSchema = ({
  rows,
  foreignKeys,
  primaryKeys,
  enumTypes,
  config,
}: {
  rows: PublicSchemaRow[];
  foreignKeys: ForeignKey[];
  primaryKeys: PrimaryKey[];
  enumTypes: EnumType[];
  config: PopulatedSchemaGenerationConfig;
}): ParsedSchema => {
  const enumMap = new Map(enumTypes.map((e) => [e.name, e]));
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
        parseColumn({
          row,
          isPrimaryKey: isPrimaryKey(row.table_name, row.column_name),
          enumMap,
          config,
        }),
      );
    }

    tables.set(row.table_name, table);
  });
  for (const table of tables.values()) {
    table.columns.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    tables: Array.from(tables.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    enums: getUsedEnums({ rows, enumMap, enumTypes, config }),
  };
};
