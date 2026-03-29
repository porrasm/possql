/** Creates a database facade with query client and transaction helper. */
export { createDatabase } from "./database/db-definition";

/** Runtime database instance returned by {@link createDatabase}. */
export type { Database } from "./database/db-definition";

/** Configuration options for {@link createDatabase}. */
export type { DbConfig } from "./database/types";

/** Query client interface used by normal and transaction contexts. */
export type { DBClient } from "./database/types";

/** Minimal pool interface that {@link createDatabase} accepts. */
export type { PoolLike, PoolClientLike } from "./database/external-types";

/** Tagged template function for building parameterized SQL definitions. */
export { sql } from "./database/sql/sql-builder";

/**
 * Creates a reusable operation that pairs SQL preparation with a Zod validator.
 */
export { createOperation } from "./database/operations";

/** Function type that builds prepared operations from input arguments. */
export type { OperationBuilder } from "./database/types";

/** Infers the row result type from an {@link OperationBuilder}. */
export type { OperationResult } from "./database/types";

/** Internal SQL representation consumed by the query runner. */
export type { SQLDefinition } from "./database/types";

/** Zod validator type used to validate query results. */
export type { DBValidator } from "./database/types";

/** Options for customizing generated schema output. */
export type { SchemaGenerationConfig } from "./schema-generation/schema-generation-config";

/** Generates Zod/TypeScript schema artifacts from a PostgreSQL database. */
export { runSchemaGeneration } from "./schema-generation/schema-generator";

/** Custom error class thrown by all Piquel operations. */
export { PiquelError } from "./errors";

/** Error code enum for programmatic error handling. */
export { PiquelErrorCode } from "./errors";
