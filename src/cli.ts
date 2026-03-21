#!/usr/bin/env node
/* eslint-disable no-console */
import pg from "pg";
import { runSchemaGeneration } from "./schema-generation/schema-generator";

const USAGE = `
Usage: pg-db-lib generate-schema [options]

Options:
  --connection-string <url>   PostgreSQL connection string (required)
  --output <path>             Output TypeScript file path (required)
  --schema-name <name>        Export name for the schema object (default: "schema")
  --help                      Show this help message
`.trim();

const parseArgs = (
  argv: string[],
): {
  connectionString: string;
  output: string;
  schemaName: string | undefined;
} => {
  const args = argv.slice(2);

  if (args[0] !== "generate-schema") {
    console.error(`Unknown command: ${args[0] ?? "(none)"}`);
    console.error("Available commands: generate-schema");
    process.exit(1);
  }

  if (args.includes("--help")) {
    console.log(USAGE);
    process.exit(0);
  }

  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const connectionString = get("--connection-string");
  const output = get("--output");

  if (!connectionString) {
    console.error("Error: --connection-string is required");
    console.error(USAGE);
    process.exit(1);
  }

  if (!output) {
    console.error("Error: --output is required");
    console.error(USAGE);
    process.exit(1);
  }

  return {
    connectionString,
    output,
    schemaName: get("--schema-name"),
  };
};

const main = async (): Promise<void> => {
  const { connectionString, output, schemaName } = parseArgs(process.argv);

  const pool = new pg.Pool({ connectionString });

  await runSchemaGeneration({
    pool,
    outputTypescriptFile: output,
    config: schemaName ? { schemaExportName: schemaName } : undefined,
  });

  process.exit(0);
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
