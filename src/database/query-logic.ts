import { type PoolClientLike } from "./external-types";
import type { ClientMetadata, SQLDefinition } from "./types";
import { PiquelError, PiquelErrorCode } from "../errors";
import sqlTemplateStrings from "sql-template-strings";

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

interface RunSqlParams {
  client: PoolClientLike;
  sql: SQLDefinition;
  clientMetadata: ClientMetadata;
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

const runTransactionStatement = async ({
  client,
  sql,
}: RunSqlParams): Promise<{ rows: unknown[] }> => {
  const sqlStatement = sqlDefinitionToSqlStatement(sql);
  return client.query(sqlStatement);
};

const runNormalStatement = async ({
  client,
  sql,
}: RunSqlParams): Promise<{ rows: unknown[] }> => {
  const sqlStatement = sqlDefinitionToSqlStatement(sql);
  try {
    return await client.query(sqlStatement);
  } finally {
    client.release();
  }
};

export const runSqlStatement = async (
  params: RunSqlParams,
): Promise<{ rows: unknown[] }> =>
  params.clientMetadata.type === "transaction"
    ? runTransactionStatement(params)
    : runNormalStatement(params);
