import { runSqlStatement, runUsingTransaction } from "./query-logic";
import { prepareOperation } from "./operations";
import type { ClientMetadata, DBClient, DbConfig } from "./types";
import type { PoolLike, PoolClientLike } from "./external-types";

interface QueryParams {
  getClient: () => Promise<PoolClientLike>;
  useZodValidation: boolean;
  clientMetadata: ClientMetadata;
}

const createQuery =
  ({
    getClient,
    useZodValidation,
    clientMetadata,
  }: QueryParams): DBClient["query"] =>
  async (...args) => {
    const { sql, validator } = prepareOperation(...args);
    const { rows } = await runSqlStatement({
      client: await getClient(),
      sql,
      clientMetadata,
    });
    // rows is unknown[] from pg driver — zod validates at runtime, or caller accepts the trust boundary
    return useZodValidation ? validator.array().parse(rows) : (rows as never);
  };

const createQueryOneOrNone =
  ({
    getClient,
    useZodValidation,
    clientMetadata,
  }: QueryParams): DBClient["queryOneOrNone"] =>
  async (...args) => {
    const { sql, validator } = prepareOperation(...args);
    const { rows } = await runSqlStatement({
      client: await getClient(),
      sql,
      clientMetadata,
    });
    const firstRow: unknown = rows[0];
    if (!firstRow) {
      return null;
    }
    return useZodValidation ? validator.parse(firstRow) : (firstRow as never);
  };

const createQueryOne =
  ({
    getClient,
    useZodValidation,
    clientMetadata,
  }: QueryParams): DBClient["queryOne"] =>
  async (...args) => {
    const { sql, validator } = prepareOperation(...args);
    const { rows } = await runSqlStatement({
      client: await getClient(),
      sql,
      clientMetadata,
    });
    const firstRow: unknown = rows[0];
    if (firstRow === undefined) {
      throw new Error("Query returned undefined");
    }
    return useZodValidation ? validator.parse(firstRow) : (firstRow as never);
  };

const createNonQuery =
  ({ getClient, clientMetadata }: QueryParams): DBClient["nonQuery"] =>
  async (...args) => {
    const { sql } = prepareOperation(...args);
    await runSqlStatement({
      client: await getClient(),
      sql,
      clientMetadata,
    });
  };

const createTransact =
  ({ getClient, useZodValidation }: QueryParams) =>
  async <T>(op: (client: DBClient) => Promise<T>): Promise<T> => {
    const client = await getClient();

    const clientMetadata: ClientMetadata = {
      type: "transaction",
    };

    const opClient: DBClient = {
      query: createQuery({
        getClient: () => Promise.resolve(client),
        useZodValidation,
        clientMetadata,
      }),
      queryOneOrNone: createQueryOneOrNone({
        getClient: () => Promise.resolve(client),
        useZodValidation,
        clientMetadata,
      }),
      queryOne: createQueryOne({
        getClient: () => Promise.resolve(client),
        useZodValidation,
        clientMetadata,
      }),
      nonQuery: createNonQuery({
        getClient: () => Promise.resolve(client),
        useZodValidation: false,
        clientMetadata,
      }),
      clientMetadata,
    };

    return runUsingTransaction(client, () => op(opClient));
  };

export interface Database {
  client: DBClient;
  transact: ReturnType<typeof createTransact>;
  pool: PoolLike;
}

export const createDatabase = (config: DbConfig): Database => {
  const clientMetadata: ClientMetadata = {
    type: "normal",
  };

  const queryParams: QueryParams = {
    getClient: () => config.pool.connect(),
    useZodValidation: config.useZodValidation,
    clientMetadata,
  };

  const queryClient: DBClient = {
    query: createQuery(queryParams),
    queryOneOrNone: createQueryOneOrNone(queryParams),
    queryOne: createQueryOne(queryParams),
    nonQuery: createNonQuery(queryParams),
    clientMetadata,
  };

  return {
    client: queryClient,
    transact: createTransact(queryParams),
    pool: config.pool,
  };
};
