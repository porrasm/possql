import type {
  DBValidator,
  SQLPreparer,
  QueryParams,
  SQLDefinition,
  OperationBuilder,
} from "./types";
import { z } from "zod";

interface OperationParams<R> {
  sql: SQLDefinition;
  validator: DBValidator<R>;
}

type SQLOrPreparer<Args> = SQLPreparer<Args> | SQLDefinition;

export const createOperation = <Args, T>(
  sql: SQLOrPreparer<Args>,
  validator: DBValidator<T>,
): OperationBuilder<Args, T> => {
  return (args) => ({
    args,
    validator,
    prepareSql: typeof sql === "function" ? sql : () => sql,
  });
};

export const prepareOperation = <Args, R>(
  ...args: QueryParams<Args, R>
): OperationParams<R> => {
  if (args.length === 2) {
    return {
      sql: args[0],
      validator: args[1],
    };
  }

  if ("templateSqlQuery" in args[0]) {
    return {
      sql: args[0],
      validator: z.any(),
    };
  }

  const [operation] = args;
  const sql = operation.prepareSql(operation.args);

  return {
    sql,
    validator: operation.validator,
  };
};
