import { type PoolClientLike } from "./external-types";
import type { SQLDefinition } from "./types";
import { PiquelError, PiquelErrorCode } from "../errors";
import sqlTemplateStrings from "sql-template-strings";
import { AsyncLocalStorage } from "async_hooks";

interface TransactionContext {
  client: PoolClientLike;
  type: "context" | "explicit";
}

const transactionStorage = new AsyncLocalStorage<TransactionContext>();

export const getTransactionContext = (): TransactionContext | undefined => {
  return transactionStorage.getStore();
};

export const getTransactionClient = (): PoolClientLike | undefined => {
  return transactionStorage.getStore()?.client;
};

export const checkMixedTransactionTypes = (
  strategy: "disallow" | "allow",
  callerType: "context" | "explicit",
): void => {
  if (strategy === "allow") {
    return;
  }
  const existing = getTransactionContext();
  if (existing && existing.type !== callerType) {
    throw new PiquelError(PiquelErrorCode.MIXED_TRANSACTION_TYPES);
  }
};

export const runUsingTransaction = async <T>(
  client: PoolClientLike,
  fn: () => Promise<T>,
  storeInContext?: boolean,
): Promise<T> => {
  const wrappedFn = storeInContext
    ? () => transactionStorage.run({ client, type: "explicit" }, fn)
    : fn;
  try {
    await client.query("BEGIN");
    const result = await wrappedFn();
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
  nestedStrategy: "disallow" | "start-new" | "reuse",
): Promise<T> => {
  const existingCtx = getTransactionContext();
  if (existingCtx) {
    switch (nestedStrategy) {
      case "disallow":
        throw new PiquelError(PiquelErrorCode.NESTED_CONTEXT_TRANSACTION);
      case "reuse":
        return fn();
      case "start-new":
        break; // fall through to acquire new client
    }
  }

  const newClient = await getClient();
  return transactionStorage.run({ client: newClient, type: "context" }, () =>
    runUsingTransaction(newClient, fn),
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
