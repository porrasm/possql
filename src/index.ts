// Core
export { createDatabase } from "./database/db-definition";
export type { Database } from "./database/db-definition";
export type { DbConfig, DBClient } from "./database/types";

// SQL builder
export { sql } from "./database/sql/sql-builder";

// Operations
export { createOperation } from "./database/operations";
export type {
  OperationBuilder,
  OperationResult,
  SQLDefinition,
  DBValidator,
} from "./database/types";

// Schema generation
export type { SchemaGenerationConfig } from "./schema-generation/schema-generation-config";
export { runSchemaGeneration } from "./schema-generation/schema-generator";
