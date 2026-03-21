/* eslint-disable no-console */
import { createDatabase, type Database } from "../database/db-definition";
import { z } from "zod";
import { parsePublicSchema, publicSchemaValidator } from "./table-parser";
import { generateSchemaTypescript } from "./schema.template";
import fs from "fs";
import { execSync } from "child_process";
import type { PoolLike } from "../database/external-types";
import { sql } from "../database/sql/sql-builder";
import {
  type SchemaGenerationConfig,
  setConfig,
} from "./schema-generation-config";

const foreignKeyValidator = z.object({
  table_name: z.string(),
  column_name: z.string(),
  foreign_table_name: z.string(),
  foreign_column_name: z.string(),
});

export type ForeignKey = z.infer<typeof foreignKeyValidator>;

const runPrettierOnSchemaFile = (outputTypescriptFile: string): void => {
  try {
    console.log("Running prettier on generated schema file...");
    execSync(`npx prettier --write ${outputTypescriptFile}`, {
      cwd: process.cwd(),
      stdio: "inherit",
    });
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
  setConfig(params.config ?? {});

  const db = createDatabase({
    pool: params.pool,
    useZodValidation: true,
  });

  await dbHealthCheck(db);

  const rows = await db.client.query(
    sql`SELECT * FROM information_schema.columns WHERE table_schema = 'public'`,
    publicSchemaValidator,
  );

  const foreignKeys = await db.client.query(
    sql`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema='public'`,
    foreignKeyValidator,
  );

  const tables = parsePublicSchema(rows, foreignKeys);
  const schemaDefinition = generateSchemaTypescript(tables);

  fs.writeFileSync(params.outputTypescriptFile, schemaDefinition);
  runPrettierOnSchemaFile(params.outputTypescriptFile);
};
