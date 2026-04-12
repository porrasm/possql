import type { SqlParameter, SQLDefinition, TemplateQuery } from "../types";
import { PiquelError, PiquelErrorCode } from "../../errors";
import {
  sqlDefinitionSchema,
  sqlParameterSchema,
  templateQuerySchema,
} from "./sql-schema";

export const unsafeParamBrand = Symbol("piquel.unsafeParam");

/** Represents a SQL parameter that bypasses runtime type validation. See {@link unsafeParam}. */
export interface UnsafeParam {
  readonly [unsafeParamBrand]: true;
  readonly value: unknown;
}

const isUnsafeParam = (v: unknown): v is UnsafeParam =>
  typeof v === "object" && v !== null && unsafeParamBrand in v;

/**
 * Wraps a value to bypass `sql`'s runtime parameter validation.
 *
 * By default, `sql` only accepts a defined set of types (strings, numbers,
 * booleans, null, bigint, Uint8Array/Buffer, Date, arrays and records of
 * those, and nested `SQLDefinition`s). If you need to pass a value whose
 * type is not in this list — for example a custom class instance that your
 * database driver knows how to serialize — wrap it with `unsafeParam`.
 *
 * **Safety:** `unsafeParam` does NOT enable SQL injection. The wrapped value
 * is still sent to the driver as a bound parameter (`$1`, `$2`, …), never
 * concatenated into the SQL string. Only Piquel's own type-check is skipped.
 *
 * @example
 * // Custom pg type that the driver handles natively
 * import { sql, unsafeParam } from "piquel";
 *
 * const point = new PgPoint(1.5, 2.0); // not in the default whitelist
 * const query = sql`INSERT INTO locations (pos) VALUES (${unsafeParam(point)})`;
 *
 * @example
 * // Mixing standard and unsafe params in one query
 * sql`UPDATE t SET a = ${standardValue}, b = ${unsafeParam(customValue)}`;
 */
export const unsafeParam = (value: unknown): UnsafeParam => ({
  [unsafeParamBrand]: true,
  value,
});

const assertDefined = <T>(
  value: T | undefined | null,
  code: PiquelErrorCode,
  detail?: string,
): T => {
  if (value === undefined || value === null) {
    throw new PiquelError(code, detail);
  }
  return value;
};

class SqlDefinitionBuilder {
  private previousQueryParts: string[];
  private currentQueryPart: string;
  private sqlParameters: unknown[];

  public constructor() {
    this.previousQueryParts = [];
    this.currentQueryPart = "";
    this.sqlParameters = [];
  }

  public appendRawSql(sql: string): void {
    this.currentQueryPart += sql;
  }

  public appendSubQuery({
    templateSqlQuery,
    sqlParameters,
  }: SQLDefinition): void {
    for (let i = 0; i < templateSqlQuery.length; i++) {
      this.appendRawSql(
        assertDefined(
          templateSqlQuery[i],
          PiquelErrorCode.TEMPLATE_SQL_UNDEFINED,
        ),
      );
      if (i >= sqlParameters.length) {
        continue;
      }

      const parameter: unknown = sqlParameters[i];

      // Null values are allowed here so we check for undefined only
      if (parameter === undefined) {
        throw new PiquelError(PiquelErrorCode.UNDEFINED_SQL_PARAMETER);
      }

      if (isUnsafeParam(parameter)) {
        this.appendRawParameter(parameter.value);
        continue;
      }

      const subQueryParameter = sqlDefinitionSchema.safeParse(parameter);

      if (subQueryParameter.success) {
        this.appendSubQuery(subQueryParameter.data);
      } else {
        this.appendSqlParameter(sqlParameterSchema.parse(parameter));
      }
    }
  }

  public appendSqlParameter(sqlParameter: SqlParameter): void {
    this.appendRawParameter(sqlParameter);
  }

  public appendRawParameter(value: unknown): void {
    this.previousQueryParts.push(this.currentQueryPart);
    this.currentQueryPart = "";
    this.sqlParameters.push(value);
  }

  public build(): SQLDefinition {
    return {
      templateSqlQuery: [...this.previousQueryParts, this.currentQueryPart],
      sqlParameters: this.sqlParameters,
    };
  }
}

/**
 * @internal Exported to test builder validation without Zod preprocessing
 * of nested definitions (e.g. undefined template parts).
 */
export const combineQueryAndParameters = (
  templateQueryParts: string[],
  sqlParameters: (SqlParameter | UnsafeParam)[],
): SQLDefinition => {
  if (templateQueryParts.length !== sqlParameters.length + 1) {
    throw new PiquelError(PiquelErrorCode.SQL_PARAMETER_COUNT_MISMATCH);
  }

  const builder = new SqlDefinitionBuilder();
  builder.appendSubQuery({
    templateSqlQuery: templateQueryParts,
    sqlParameters,
  });

  return builder.build();
};

const generateSqlDefinition = (
  templateQuery: TemplateQuery,
  sqlParameters: (SqlParameter | UnsafeParam)[],
): SQLDefinition => {
  if (typeof templateQuery === "string") {
    return {
      templateSqlQuery: [templateQuery],
      sqlParameters: [],
    };
  }

  return combineQueryAndParameters(templateQuery, sqlParameters);
};

const paramToUnsafeParam = (param: unknown): UnsafeParam => {
  if (isUnsafeParam(param)) {
    return param;
  }
  return unsafeParam(param);
};

/**
 * Variant of {@link sql} that skips runtime parameter type validation entirely.
 *
 * Every interpolated value is treated as if it were wrapped with
 * {@link unsafeParam}: Piquel's type whitelist is not checked, but values are
 * still passed to the driver as bound parameters (`$1`, `$2`, …) — never
 * concatenated into the SQL string. There is no SQL injection risk.
 *
 * Use this when your codebase frequently passes custom driver types and
 * per-parameter `unsafeParam` wrapping would be too noisy. The recommended
 * pattern is to re-export it as `sql` from a project-local module so that all
 * query files pick it up automatically:
 *
 * ```ts
 * // src/db/sql.ts
 * export { sqlUnchecked as sql } from "piquel";
 * ```
 *
 * Then import from your local module instead of directly from `"piquel"`:
 *
 * ```ts
 * import { sql } from "../db/sql";
 * const query = sql`SELECT * FROM t WHERE id = ${myCustomId}`;
 * ```
 *
 * If only a few parameters need to bypass validation, prefer the targeted
 * {@link unsafeParam} wrapper with the standard {@link sql} instead.
 */
export const sqlUnchecked = (
  templateQuery: TemplateStringsArray,
  ...sqlParameters: unknown[]
): SQLDefinition => {
  return sql(templateQuery, ...sqlParameters.map(paramToUnsafeParam));
};

/** Creates a SQL definition from a template query and SQL parameters. */
export const sql = (
  templateQueryRaw: TemplateStringsArray,
  ...sqlParametersRaw: (SqlParameter | UnsafeParam)[]
): SQLDefinition => {
  const templateQuery = templateQuerySchema.parse(templateQueryRaw, {
    error: (error) => {
      return {
        message: "Invalid template query",
        path: [],
        code: "invalid_template_query",
        cause: error,
      };
    },
  });

  // Validate non-unsafe parameters eagerly; unsafe params pass through as-is
  const sqlParameters: (SqlParameter | UnsafeParam)[] = sqlParametersRaw.map(
    (p) => {
      if (isUnsafeParam(p)) {
        return p;
      }
      return sqlParameterSchema.parse(p, {
        error: (error) => {
          return {
            message: "Invalid SQL parameters",
            path: [],
            code: "invalid_sql_parameters",
            cause: error,
          };
        },
      });
    },
  );

  return generateSqlDefinition(templateQuery, sqlParameters);
};
