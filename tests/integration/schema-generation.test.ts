import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import pg from "pg";
import { runSchemaGeneration } from "../../src/schema-generation/schema-generator";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://pgtest:pgtest@localhost:5433/pg_db_lib_test";

// Tables in large-schema.sql in drop order (FKs first)
const LARGE_SCHEMA_TABLES = [
  "article_tag",
  "article",
  "int_array",
  "text_array",
  "tag",
  "setting",
  "location",
  "file",
  "product",
  "event",
  "profile",
  "big_number",
  "category",
];

interface SchemaGenTestContext {
  pool: pg.Pool;
  cleanup: () => Promise<void>;
}

async function setupSchemaGenTest(
  sqlFile: string,
): Promise<SchemaGenTestContext> {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  const sqlContent = fs.readFileSync(path.resolve(sqlFile), "utf8");
  // Create tables in the public schema
  await pool.query(sqlContent);

  const cleanup = async (): Promise<void> => {
    for (const table of LARGE_SCHEMA_TABLES) {
      await pool.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
    await pool.end();
  };

  return { pool, cleanup };
}

let ctx: SchemaGenTestContext;

beforeEach(async () => {
  ctx = await setupSchemaGenTest("tests/fixtures/large-schema.sql");
});

afterEach(async () => {
  await ctx.cleanup();
});

describe("runSchemaGeneration", () => {
  it("matches the expected generated file content", async () => {
    const outputFile = path.join(os.tmpdir(), `schema-test-${Date.now()}.ts`);
    await runSchemaGeneration({
      pool: ctx.pool,
      outputTypescriptFile: outputFile,
    });
    const content = fs.readFileSync(outputFile, "utf8");
    const expectedContent = fs.readFileSync(
      "tests/fixtures/large-schema-generated.ts.txt",
      "utf8",
    );
    expect(content).toEqual(expectedContent);
  });

  it("generates a TypeScript file with expected table names", async () => {
    const outputFile = path.join(os.tmpdir(), `schema-test-${Date.now()}.ts`);

    try {
      await runSchemaGeneration({
        pool: ctx.pool,
        outputTypescriptFile: outputFile,
      });

      expect(fs.existsSync(outputFile)).toBe(true);
      const content = fs.readFileSync(outputFile, "utf8");

      // Tables from large-schema.sql that should appear (singular names)
      expect(content).toContain("category");
      expect(content).toContain("profile");
      expect(content).toContain("event");
      expect(content).toContain("product");
      expect(content).toContain("article");
      expect(content).toContain("tag");
    } finally {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  });

  it("generates valid TypeScript with zod import", async () => {
    const outputFile = path.join(os.tmpdir(), `schema-test-${Date.now()}.ts`);

    try {
      await runSchemaGeneration({
        pool: ctx.pool,
        outputTypescriptFile: outputFile,
      });
      const content = fs.readFileSync(outputFile, "utf8");
      expect(content).toContain('from "zod"');
    } finally {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  });

  it("respects custom schemaExportName config option", async () => {
    const outputFile = path.join(os.tmpdir(), `schema-test-${Date.now()}.ts`);

    try {
      await runSchemaGeneration({
        pool: ctx.pool,
        outputTypescriptFile: outputFile,
        config: { schemaExportName: "myCustomSchema" },
      });
      const content = fs.readFileSync(outputFile, "utf8");
      expect(content).toContain("myCustomSchema");
    } finally {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  });

  it("respects custom tableNameTransform config option", async () => {
    const outputFile = path.join(os.tmpdir(), `schema-test-${Date.now()}.ts`);

    try {
      await runSchemaGeneration({
        pool: ctx.pool,
        outputTypescriptFile: outputFile,
        config: {
          tableNameTransform: (name) => `Prefixed_${name}`,
        },
      });
      const content = fs.readFileSync(outputFile, "utf8");
      // transformed table name should appear somewhere in output
      expect(content).toContain("Prefixed_");
    } finally {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  });

  it("generates branded id schemas for tables with _id primary keys", async () => {
    const outputFile = path.join(os.tmpdir(), `schema-test-${Date.now()}.ts`);

    try {
      await runSchemaGeneration({
        pool: ctx.pool,
        outputTypescriptFile: outputFile,
      });
      const content = fs.readFileSync(outputFile, "utf8");
      // category_id is a PK (category + _id = category_id) → branded schema generated
      expect(content).toContain("category_idSchema");
    } finally {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  });
});
