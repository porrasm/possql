import {
  getTransactionClient,
  runSqlStatement,
  runUsingContextTransaction,
  runUsingTransaction,
} from "./query-logic";
import { prepareOperation } from "./operations";
import type { DBClient, DbConfig } from "./types";
import type { PoolLike, PoolClientLike } from "./external-types";
import { PiquelError, PiquelErrorCode } from "../errors";

interface ResolvedClient {
  client: PoolClientLike;
  releaseAfterQuery: boolean;
}

/** Always acquires a fresh client from the pool (with optional timeout). */
function createPoolConnect(
  pool: PoolLike,
  connectionTimeoutMs: number | undefined,
): () => Promise<PoolClientLike> {
  if (connectionTimeoutMs === undefined || connectionTimeoutMs <= 0) {
    return () => pool.connect();
  }

  const timeoutMs = connectionTimeoutMs;
  const timeoutDetail = `Exceeded ${timeoutMs.toString()}ms`;

  return async () => {
    let didTimeout = false;
    const connectPromise = pool.connect();
    void connectPromise.then(
      (client) => {
        if (didTimeout) {
          client.release();
        }
      },
      () => undefined,
    );

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        didTimeout = true;
        reject(
          new PiquelError(PiquelErrorCode.CONNECTION_TIMEOUT, timeoutDetail),
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([connectPromise, timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  };
}

/**
 * Creates a client resolver that checks AsyncLocalStorage for an ambient
 * transaction client at query time. Falls back to the pool when none exists.
 */
function createGetClient(
  poolConnect: () => Promise<PoolClientLike>,
): () => Promise<ResolvedClient> {
  return async () => {
    const ambientClient = getTransactionClient();
    if (ambientClient) {
      return { client: ambientClient, releaseAfterQuery: false };
    }
    return { client: await poolConnect(), releaseAfterQuery: true };
  };
}

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

const createTransact =
  (poolConnect: () => Promise<PoolClientLike>, useZodValidation: boolean) =>
  async <T>(op: (client: DBClient) => Promise<T>): Promise<T> => {
    const client = await poolConnect();

    const txGetClient = (): Promise<ResolvedClient> =>
      Promise.resolve({ client, releaseAfterQuery: false });

    const txQueryParams: QueryParams = {
      getClient: txGetClient,
      useZodValidation,
    };

    const opClient: DBClient = {
      query: createQuery(txQueryParams),
      queryOneOrNone: createQueryOneOrNone(txQueryParams),
      queryOne: createQueryOne(txQueryParams),
      nonQuery: createNonQuery({
        ...txQueryParams,
        useZodValidation: false,
      }),
    };

    return runUsingTransaction(client, () => op(opClient));
  };

const createContextTransact =
  (poolConnect: () => Promise<PoolClientLike>) =>
  async <T>(op: () => Promise<T>): Promise<T> => {
    return runUsingContextTransaction(poolConnect, op);
  };

export interface Database {
  client: DBClient;
  transact: ReturnType<typeof createTransact>;
  contextTransact: ReturnType<typeof createContextTransact>;
  pool: PoolLike;
}

export const createDatabase = (config: DbConfig): Database => {
  const poolConnect = createPoolConnect(
    config.pool,
    config.connectionTimeoutMs,
  );

  const queryParams: QueryParams = {
    getClient: createGetClient(poolConnect),
    useZodValidation: config.useZodValidation,
  };

  const queryClient: DBClient = {
    query: createQuery(queryParams),
    queryOneOrNone: createQueryOneOrNone(queryParams),
    queryOne: createQueryOne(queryParams),
    nonQuery: createNonQuery(queryParams),
  };

  return {
    client: queryClient,
    transact: createTransact(poolConnect, config.useZodValidation),
    contextTransact: createContextTransact(poolConnect),
    pool: config.pool,
  };
};
