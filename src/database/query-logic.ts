import { type PoolClientLike } from "./external-types";
import type { SQLDefinition } from "./types";
import { PiquelError, PiquelErrorCode } from "../errors";
import sqlTemplateStrings from "sql-template-strings";
import { AsyncLocalStorage } from "async_hooks";

const transactionClientStorage = new AsyncLocalStorage<PoolClientLike>();

export const getTransactionClient = (): PoolClientLike | undefined => {
  return transactionClientStorage.getStore();
};

export const runUsingTransaction = async <T>(
  client: PoolClientLike,
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    await client.query("BEGIN");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback failures (e.g. dead connection) so we preserve the original error.
    }
    throw error;
  } finally {
    client.release();
  }
};

export const runUsingContextTransaction = async <T>(
  getClient: () => Promise<PoolClientLike>,
  fn: () => Promise<T>,
): Promise<T> => {
  const existingTransactionClient = transactionClientStorage.getStore();
  if (existingTransactionClient) {
    return fn();
  }

  const newTransactionClient = await getClient();
  return transactionClientStorage.run(newTransactionClient, () =>
    runUsingTransaction(newTransactionClient, fn),
  );
};

interface RunSqlParams {
  client: PoolClientLike;
  sql: SQLDefinition;
  releaseAfterQuery: boolean;
}

const sqlDefinitionToSqlStatement = (
  sql: SQLDefinition,
): ReturnType<typeof sqlTemplateStrings> => {
  if (sql.templateSqlQuery.length !== sql.sqlParameters.length + 1) {
    throw new PiquelError(PiquelErrorCode.SQL_PARAMETER_COUNT_MISMATCH);
  }

  return sqlTemplateStrings(
    sql.templateSqlQuery,
    ...(sql.sqlParameters as string[]),
  );
};

export const runSqlStatement = async (
  params: RunSqlParams,
): Promise<{ rows: unknown[] }> => {
  const sqlStatement = sqlDefinitionToSqlStatement(params.sql);
  if (!params.releaseAfterQuery) {
    return params.client.query(sqlStatement);
  }
  try {
    return await params.client.query(sqlStatement);
  } finally {
    params.client.release();
  }
};
