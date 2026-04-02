/* eslint-disable no-console */
import { createDatabase, type Database } from "../database/db-definition";
import { parsePublicSchema } from "./table-parser";
import { generateSchemaTypescript } from "./schema.template";
import fs from "fs";
import { execFileSync } from "child_process";
import type { PoolLike } from "../database/external-types";
import { sql } from "../database/sql/sql-builder";
import {
  populateSchemaGenerationConfig,
  type SchemaGenerationConfig,
} from "./schema-generation-config";
import {
  fetchColumns,
  fetchForeignKeys,
  fetchPrimaryKeys,
  fetchEnumRows,
  fetchTableTypes,
  groupEnumRows,
} from "./metadata-queries";

const runPrettierOnSchemaFile = (outputTypescriptFile: string): void => {
  try {
    console.log("Running prettier on generated schema file...");
    execFileSync(
      "npx",
      ["--no-install", "prettier", "--write", outputTypescriptFile],
      {
        cwd: process.cwd(),
        stdio: "inherit",
      },
    );
    console.log("Schema file formatted successfully!");
  } catch (error) {
    console.error("Failed to format schema file with prettier:", error);
    throw error;
  }
};

interface SchemaGenerationParams {
  pool: PoolLike;
  outputTypescriptFile: string;
  config?: Partial<SchemaGenerationConfig>;
  format?: boolean;
}

const dbHealthCheck = async (db: Database): Promise<void> => {
  try {
    await db.client.queryOne(sql`SELECT 1`);
  } catch (error) {
    console.error("Error: Database health check failed");
    throw error;
  }
};

export const runSchemaGeneration = async (
  params: SchemaGenerationParams,
): Promise<void> => {
  const schemaGenerationConfig = populateSchemaGenerationConfig(
    params.config ?? {},
  );

  const db = createDatabase({
    pool: params.pool,
    useZodValidation: true,
  });

  await dbHealthCheck(db);

  const rows = await db.client.query(fetchColumns({}));
  const foreignKeys = await db.client.query(fetchForeignKeys({}));
  const primaryKeys = await db.client.query(fetchPrimaryKeys({}));
  const enumTypes = groupEnumRows(await db.client.query(fetchEnumRows({})));
  const tableTypes = await db.client.query(fetchTableTypes({}));

  const { tables, enums } = parsePublicSchema({
    rows,
    foreignKeys,
    primaryKeys,
    enumTypes,
    tableTypes,
    config: schemaGenerationConfig,
  });
  const schemaDefinition = generateSchemaTypescript(
    tables,
    enums,
    schemaGenerationConfig,
  );

  fs.writeFileSync(params.outputTypescriptFile, schemaDefinition);
  if (params.format ?? true) {
    runPrettierOnSchemaFile(params.outputTypescriptFile);
  }
};
