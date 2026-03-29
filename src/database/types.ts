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

export interface ClientMetadata {
  type: "normal" | "transaction";
}

export interface DBClient {
  query: <Args, R>(...args: QueryParams<Args, R>) => Promise<R[]>;
  queryOneOrNone: <Args, R>(...args: QueryParams<Args, R>) => Promise<R | null>;
  queryOne: <Args, R>(...args: QueryParams<Args, R>) => Promise<R>;
  nonQuery: <Args>(...args: QueryParams<Args, void>) => Promise<void>;
  clientMetadata: ClientMetadata;
}

export interface DbConfig {
  pool: PoolLike;
  /** If true, the database query result will be validated using zod.
   * For production, this can be disabled to improve performance. */
  useZodValidation: boolean;
}
