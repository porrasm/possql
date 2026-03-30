/* eslint-disable @typescript-eslint/naming-convention */

/** Error codes for all errors thrown by Piquel. */
export enum PiquelErrorCode {
  /** Template query parts and SQL parameters count do not match. */
  SQL_PARAMETER_COUNT_MISMATCH = "SQL_PARAMETER_COUNT_MISMATCH",

  /** `queryOne` returned no rows. */
  QUERY_RETURNED_NO_ROWS = "QUERY_RETURNED_NO_ROWS",

  /** A template SQL query part was undefined or null. */
  TEMPLATE_SQL_UNDEFINED = "TEMPLATE_SQL_UNDEFINED",

  /** An SQL parameter was explicitly `undefined`. */
  UNDEFINED_SQL_PARAMETER = "UNDEFINED_SQL_PARAMETER",

  /** A transformed name is not a valid TypeScript identifier. */
  INVALID_TYPESCRIPT_NAME = "INVALID_TYPESCRIPT_NAME",

  /** Schema generation config was accessed before initialization. */
  CONFIG_NOT_INITIALIZED = "CONFIG_NOT_INITIALIZED",

  /** A column's PostgreSQL data type has no known Zod mapping. */
  UNKNOWN_DATA_TYPE = "UNKNOWN_DATA_TYPE",

  /** Acquiring a connection from the pool exceeded `connectionTimeoutMs`. */
  CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
}

/** Human-readable descriptions for each error code. */
export const piquelErrorDescriptions: Record<PiquelErrorCode, string> = {
  [PiquelErrorCode.SQL_PARAMETER_COUNT_MISMATCH]:
    "Template query parts and SQL parameters count mismatch",
  [PiquelErrorCode.QUERY_RETURNED_NO_ROWS]:
    "queryOne expected at least one row but the query returned none",
  [PiquelErrorCode.TEMPLATE_SQL_UNDEFINED]:
    "A template SQL query part was undefined or null",
  [PiquelErrorCode.UNDEFINED_SQL_PARAMETER]:
    "An SQL parameter was explicitly undefined",
  [PiquelErrorCode.INVALID_TYPESCRIPT_NAME]:
    "A transformed name is not a valid TypeScript identifier",
  [PiquelErrorCode.CONFIG_NOT_INITIALIZED]:
    "Schema generation config was accessed before calling setConfig",
  [PiquelErrorCode.UNKNOWN_DATA_TYPE]:
    "A column data type has no known Zod mapping",
  [PiquelErrorCode.CONNECTION_TIMEOUT]:
    "Timed out while waiting for a connection from the pool",
};

/** Custom error class for all Piquel errors. */
export class PiquelError extends Error {
  public readonly code: PiquelErrorCode;
  public readonly description: string;
  public readonly detail?: string;

  public constructor(code: PiquelErrorCode, detail?: string) {
    const description = piquelErrorDescriptions[code];
    const message = detail ? `${description}: ${detail}` : description;
    super(message);
    this.name = "PiquelError";
    this.code = code;
    this.description = description;
    this.detail = detail;
  }
}
