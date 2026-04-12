import { checkMixedTransactionTypes } from "./transaction-context";
import {
  runExplicitTransaction,
  runContextTransaction,
} from "./transaction-runner";
import { runSqlStatement } from "./sql-executor";
import { prepareOperation } from "./operations";
import type { DBClient, DbConfig } from "./types";
import type { PoolLike } from "./external-types";
import { PiquelError, PiquelErrorCode } from "../errors";
import {
  createGetClient,
  createPoolConnect,
  type ResolvedClient,
} from "./db-client";

interface QueryParams {
  getClient: () => Promise<ResolvedClient>;
  useZodValidation: boolean;
}

/** Implements {@link DBClient.query}. */
const createQuery =
  ({ getClient, useZodValidation }: QueryParams): DBClient["query"] =>
  async (...args) => {
    const { sql, validator } = prepareOperation(...args);
    const { client, releaseAfterQuery } = await getClient();
    const { rows } = await runSqlStatement({
      client,
      sql,
      releaseAfterQuery,
    });
    // rows is unknown[] from pg driver — zod validates at runtime, or caller accepts the trust boundary
    return useZodValidation ? validator.array().parse(rows) : (rows as never);
  };

/** Implements {@link DBClient.queryOneOrNone}. */
const createQueryOneOrNone =
  ({ getClient, useZodValidation }: QueryParams): DBClient["queryOneOrNone"] =>
  async (...args) => {
    const { sql, validator } = prepareOperation(...args);
    const { client, releaseAfterQuery } = await getClient();
    const { rows } = await runSqlStatement({
      client,
      sql,
      releaseAfterQuery,
    });
    const firstRow: unknown = rows[0];
    if (!firstRow) {
      return null;
    }
    return useZodValidation ? validator.parse(firstRow) : (firstRow as never);
  };

/** Implements {@link DBClient.queryOne}. */
const createQueryOne =
  ({ getClient, useZodValidation }: QueryParams): DBClient["queryOne"] =>
  async (...args) => {
    const { sql, validator } = prepareOperation(...args);
    const { client, releaseAfterQuery } = await getClient();
    const { rows } = await runSqlStatement({
      client,
      sql,
      releaseAfterQuery,
    });
    const firstRow: unknown = rows[0];
    if (firstRow === undefined) {
      throw new PiquelError(PiquelErrorCode.QUERY_RETURNED_NO_ROWS);
    }
    return useZodValidation ? validator.parse(firstRow) : (firstRow as never);
  };

/** Implements {@link DBClient.nonQuery}. */
const createNonQuery =
  ({ getClient }: QueryParams): DBClient["nonQuery"] =>
  async (...args) => {
    const { sql } = prepareOperation(...args);
    const { client, releaseAfterQuery } = await getClient();
    await runSqlStatement({
      client,
      sql,
      releaseAfterQuery,
    });
  };

const createDBClient = (params: QueryParams): DBClient => {
  return {
    query: createQuery(params),
    queryOneOrNone: createQueryOneOrNone(params),
    queryOne: createQueryOne(params),
    nonQuery: createNonQuery(params),
  };
};

/** Runtime database instance returned by {@link createDatabase}. */
export interface Database {
  client: DBClient;
  transact: <T>(op: (client: DBClient) => Promise<T>) => Promise<T>;
  contextTransact: <T>(op: () => Promise<T>) => Promise<T>;
  pool: PoolLike;
}

/** Creates a database facade with query client and transaction helper. */
export const createDatabase = (config: DbConfig): Database => {
  const poolConnect = createPoolConnect(
    config.pool,
    config.connectionTimeoutMs,
  );

  const nestedStrategy = config.nestedContextTransactionStrategy ?? "disallow";
  const mixStrategy = config.mixTransactionTypesStrategy ?? "disallow";

  const queryClient = createDBClient({
    getClient: createGetClient(poolConnect),
    useZodValidation: config.useZodValidation,
  });

  const transact = async <T>(
    op: (client: DBClient) => Promise<T>,
  ): Promise<T> => {
    checkMixedTransactionTypes(mixStrategy, "explicit");
    const client = await poolConnect();
    const txClient = createDBClient({
      getClient: () => Promise.resolve({ client, releaseAfterQuery: false }),
      useZodValidation: config.useZodValidation,
    });
    return runExplicitTransaction(client, () => op(txClient));
  };

  const contextTransact = async <T>(op: () => Promise<T>): Promise<T> => {
    checkMixedTransactionTypes(mixStrategy, "context");
    return runContextTransaction(poolConnect, op, nestedStrategy);
  };

  return {
    client: queryClient,
    transact,
    contextTransact,
    pool: config.pool,
  };
};
