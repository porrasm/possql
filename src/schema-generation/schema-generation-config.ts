export const UNKNOWN_DATA_TYPE_ZOD_TYPE = "z.any()";

export interface SchemaGenerationConfig {
  schemaExportName: string;
  primaryKeySuffix: string;
  tableTypeSuffix: string;
  zodNullableSuffix: string;
  arrayDataTypeName: string;
  allowUnknownDataTypes: boolean;
  tableNameTransform: (tableName: string) => string;
  columnNameTransform: (columnName: string) => string;
  getIgnoredTables: (ignoredTables: Set<string>) => Set<string>;
  getZodTypeMap: (defaults: Record<string, string>) => Record<string, string>;
  getZodArrayTypeMap: (
    defaults: Record<string, string>,
  ) => Record<string, string>;
}

const VALID_TYPESCRIPT_OBJECT_NAME_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

const wrapNameTransformWithValidation = (
  transform: (name: string) => string,
): ((name: string) => string) => {
  return (name: string) => {
    const transformedName = transform(name);
    if (!VALID_TYPESCRIPT_OBJECT_NAME_REGEX.test(transformedName)) {
      throw new Error(
        `Invalid Typescript object name: '${transformedName}'. Use the "columnNameTransform" or "tableNameTransform" to transform the names to valid Typescript object names.`,
      );
    }
    return transformedName;
  };
};

type PopulatedSchemaGenerationConfig = Omit<
  SchemaGenerationConfig,
  "getZodTypeMap" | "getZodArrayTypeMap" | "getIgnoredTables"
> & {
  zodTypeMap: Record<string, string>;
  zodArrayTypeMap: Record<string, string>;
  ignoredTables: Set<string>;
};

const DEFAULT_IGNORED_TABLES = new Set([
  "pg_stat_statements",
  "pg_stat_statements_info",
  "pgmigrations",
  "pg_stat_activity",
  "pg_stat_bgwriter",
  "pg_stat_database",
  "pg_stat_database_conflicts",
  "migrations",
]);

const DEFAULT_ZOD_TYPE_MAP: Record<string, string> = {
  bigint: "z.string()",
  text: "z.string()",
  "timestamp with time zone": "z.date()",
  "timestamp without time zone": "z.date()",
  date: "z.date()",
  integer: "z.number().int()",
  boolean: "z.boolean()",
  uuid: "z.uuid()",
  "double precision": "z.number()",
  "character varying": "z.string()",
  point: `z.object({
    x: z.number(),
    y: z.number(),
  })`,
  oid: "z.number()",
  bytea: "z.instanceof(Buffer)",
  numeric: "z.number()",
  jsonb: "z.object({})",
};

const DEFAULT_ZOD_ARRAY_TYPE_MAP: Record<string, string> = {
  _int4: "z.array(z.number().int())",
  _text: "z.array(z.string())",
  _polygon: "z.array(z.any())",
};

const DEFAULT_SCHEMA_GENERATION_CONFIG: SchemaGenerationConfig = {
  schemaExportName: "schema",
  primaryKeySuffix: "_id",
  tableTypeSuffix: "Type",
  zodNullableSuffix: ".nullable()",
  arrayDataTypeName: "ARRAY",
  allowUnknownDataTypes: false,
  tableNameTransform: (tableName: string) => tableName,
  columnNameTransform: (columnName: string) => columnName,
  getIgnoredTables: (ignoredTables: Set<string>) => ignoredTables,
  getZodTypeMap: (defaults: Record<string, string>) => defaults,
  getZodArrayTypeMap: (defaults: Record<string, string>) => defaults,
};

let populatedSchemaGenerationConfig: PopulatedSchemaGenerationConfig | null =
  null;

export const config = (): PopulatedSchemaGenerationConfig => {
  if (populatedSchemaGenerationConfig !== null) {
    return populatedSchemaGenerationConfig;
  }

  throw new Error("Config not initialized");
};

export const setConfig = (config: Partial<SchemaGenerationConfig>): void => {
  const ignoredTablesFunc =
    config.getIgnoredTables ??
    DEFAULT_SCHEMA_GENERATION_CONFIG.getIgnoredTables;
  const zodTypeMapFunc =
    config.getZodTypeMap ?? DEFAULT_SCHEMA_GENERATION_CONFIG.getZodTypeMap;
  const zodArrayTypeMapFunc =
    config.getZodArrayTypeMap ??
    DEFAULT_SCHEMA_GENERATION_CONFIG.getZodArrayTypeMap;

  populatedSchemaGenerationConfig = {
    ...DEFAULT_SCHEMA_GENERATION_CONFIG,
    ...config,
    tableNameTransform: wrapNameTransformWithValidation(
      config.tableNameTransform ??
        DEFAULT_SCHEMA_GENERATION_CONFIG.tableNameTransform,
    ),
    columnNameTransform: wrapNameTransformWithValidation(
      config.columnNameTransform ??
        DEFAULT_SCHEMA_GENERATION_CONFIG.columnNameTransform,
    ),
    ignoredTables: ignoredTablesFunc(DEFAULT_IGNORED_TABLES),
    zodTypeMap: zodTypeMapFunc(DEFAULT_ZOD_TYPE_MAP),
    zodArrayTypeMap: zodArrayTypeMapFunc(DEFAULT_ZOD_ARRAY_TYPE_MAP),
  };
};
