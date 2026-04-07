import { type z } from "zod";
import type {
  templateQuerySchema,
  sqlDefinitionSchema,
  sqlParameterSchema,
} from "./sql/sql-schema";
import type { PoolLike } from "./external-types";

export type TemplateQuery = z.infer<typeof templateQuerySchema>;
export type SQLDefinition = z.infer<typeof sqlDefinitionSchema>;
export type SqlParameter = z.infer<typeof sqlParameterSchema>;

export type DBValidator<T> = z.ZodType<T>;

export type SQLPreparer<Args> = (args: Args) => SQLDefinition;

export interface PreparedOperation<Args, R> {
  args: Args;
  validator: DBValidator<R>;
  prepareSql: SQLPreparer<Args>;
}

export type OperationBuilder<Args, R> = (
  args: Args,
) => PreparedOperation<Args, R>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OperationResult<T extends OperationBuilder<any, unknown>> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends OperationBuilder<any, infer R> ? R : never;

export type QueryParams<Args, R> =
  | [SQLDefinition]
  | [SQLDefinition, DBValidator<R>]
  | [PreparedOperation<Args, R>];

export interface DBClient {
  /**
   * Runs the query and returns all rows as an array. An empty result set yields
   * `[]`.
   *
   * Pass a Zod schema as the second argument, or use a `PreparedOperation` from
   * `createOperation`, to validate each row when `useZodValidation` is enabled on
   * the database. Without a validator, row types are `unknown`.
   */
  query: <Args, R>(...args: QueryParams<Args, R>) => Promise<R[]>;
  /**
   * Runs the query and returns the first row, or `null` if the result is empty.
   *
   * Does not append `LIMIT 1` or otherwise constrain the query. The database
   * returns the full result set; only the first row is used. Add `LIMIT 1` (or
   * equivalent) in your SQL when you expect at most one row so the server does
   * not fetch or transfer extra rows.
   */
  queryOneOrNone: <Args, R>(...args: QueryParams<Args, R>) => Promise<R | null>;
  /**
   * Runs the query and returns the first row, or throws if the result is empty.
   *
   * Does not append `LIMIT 1` or otherwise constrain the query. The database
   * returns the full result set; only the first row is used. Add `LIMIT 1` (or
   * equivalent) in your SQL when you expect at most one row so the server does
   * not fetch or transfer extra rows.
   */
  queryOne: <Args, R>(...args: QueryParams<Args, R>) => Promise<R>;
  /**
   * Executes SQL for statements where you do not need row data (`INSERT`,
   * `UPDATE`, `DELETE`, `COPY`, DDL, etc.). The result set is not returned;
   * use `query` when you need rows.
   */
  nonQuery: <Args>(...args: QueryParams<Args, void>) => Promise<void>;
}

export interface DbConfig {
  pool: PoolLike;
  /** If true, the database query result will be validated using zod.
   * For production, this can be disabled to improve performance. */
  useZodValidation: boolean;
  /**
   * Max time in milliseconds to wait for `pool.connect()`. If the pool is
   * exhausted or the server is unreachable, this bounds how long calls hang.
   * Omit or set to `0` or less for no limit (default — same as passing only a pool).
   */
  connectionTimeoutMs?: number;
  /**
   * Determines how nested context transactions are handled. Defaults to "disallow".
   * - "disallow": throw an error if a nested context transaction is started
   * - "start-new": start a new transaction for the nested context transaction
   * - "reuse": join the nested context transaction with the outer transaction, effectively doing nothing
   */
  nestedContextTransactionStrategy?: "disallow" | "start-new" | "reuse";
  /**
   * Determines if starting a transaction inside a context transaction is allowed or vice versa. Defaults to "disallow".
   * - "disallow": throw an error if a transaction type is mixed
   * - "allow": allow mixing transaction types
   */
  mixTransactionTypesStrategy?: "disallow" | "allow";
}
