import { type PoolClientLike } from "./external-types";
import type { ClientMetadata, SQLDefinition } from "./types";
import sqlTemplateStrings from "sql-template-strings";

export const runUsingTransaction = async <T>(
  client: PoolClientLike,
  fn: () => Promise<T>
): Promise<T> => {
  try {
    await client.query("BEGIN");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
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

const sqlDefinitionToSqlStatement = (sql: SQLDefinition): ReturnType<typeof sqlTemplateStrings> => {
  if (sql.templateSqlQuery.length !== sql.sqlParameters.length + 1) {
    throw new Error("Template query parts and SQL parameters count mismatch");
  }

  return sqlTemplateStrings(sql.templateSqlQuery, ...(sql.sqlParameters as string[]));
};

const runTransactionStatement = async ({ client, sql }: RunSqlParams): Promise<{ rows: unknown[] }> => {
  const sqlStatement = sqlDefinitionToSqlStatement(sql);
  return client.query(sqlStatement);
};

const runNormalStatement = ({ client, sql }: RunSqlParams): Promise<{ rows: unknown[] }> => {
  const sqlStatement = sqlDefinitionToSqlStatement(sql);
  try {
    return client.query(sqlStatement);
  } finally {
    client.release();
  }
};

export const runSqlStatement = async (params: RunSqlParams): Promise<{ rows: unknown[] }> =>
  params.clientMetadata.type === "transaction"
    ? runTransactionStatement(params)
    : runNormalStatement(params);
