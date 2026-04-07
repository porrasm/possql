import type { PoolClientLike } from "./external-types";
import type { SQLDefinition } from "./types";
import { PiquelError, PiquelErrorCode } from "../errors";
import sqlTemplateStrings from "sql-template-strings";

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

interface RunSqlParams {
  client: PoolClientLike;
  sql: SQLDefinition;
  releaseAfterQuery: boolean;
}

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
