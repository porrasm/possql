import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import type pg from "pg";
import { runSchemaGeneration } from "../../src/schema-generation/schema-generator";
import {
  setupPublicSchemaTest,
  resetDb,
  setupDumpTestDb,
  teardownDumpTestDb,
  type DumpTestDb,
} from "../helpers/db";

let ctx: { pool: pg.Pool };

beforeEach(async () => {
  ctx = await setupPublicSchemaTest("tests/fixtures/large-schema.sql");
});

afterEach(async () => {
  await resetDb(ctx);
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

  it("supports disabling formatting via format option", async () => {
    const outputFile = path.join(os.tmpdir(), `schema-test-${Date.now()}.ts`);

    try {
      await runSchemaGeneration({
        pool: ctx.pool,
        outputTypescriptFile: outputFile,
        format: false,
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

  it("overrides jsonb column type with overrideZodType", async () => {
    const outputFile = path.join(os.tmpdir(), `schema-test-${Date.now()}.ts`);

    try {
      await runSchemaGeneration({
        pool: ctx.pool,
        outputTypescriptFile: outputFile,
        config: {
          overrideZodType: (col) =>
            col.data_type === "jsonb"
              ? "z.record(z.string(), z.unknown())"
              : null,
        },
      });
      const content = fs.readFileSync(outputFile, "utf8");
      // The setting table has a jsonb "value" column — it should use the override
      expect(content).toContain("z.record(z.string(), z.unknown())");
      // The default jsonb mapping (z.object({})) should not appear
      expect(content).not.toContain("z.object({})");
    } finally {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  });

  it("uses permissive default zod type for jsonb columns", async () => {
    const outputFile = path.join(os.tmpdir(), `schema-test-${Date.now()}.ts`);

    try {
      await runSchemaGeneration({
        pool: ctx.pool,
        outputTypescriptFile: outputFile,
      });
      const content = fs.readFileSync(outputFile, "utf8");
      expect(content).toContain("z.record(z.string(), z.unknown())");
      expect(content).not.toContain("value: z.object({})");
    } finally {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  });

  it("overrides specific jsonb column by table and column name", async () => {
    const outputFile = path.join(os.tmpdir(), `schema-test-${Date.now()}.ts`);

    try {
      await runSchemaGeneration({
        pool: ctx.pool,
        outputTypescriptFile: outputFile,
        config: {
          overrideZodType: (col) =>
            col.table_name === "setting" && col.column_name === "value"
              ? "z.object({ theme: z.string() })"
              : null,
        },
      });
      const content = fs.readFileSync(outputFile, "utf8");
      expect(content).toContain("z.object({ theme: z.string() })");
    } finally {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  });

  it("generates branded id schemas for primary key columns", async () => {
    const outputFile = path.join(os.tmpdir(), `schema-test-${Date.now()}.ts`);

    try {
      await runSchemaGeneration({
        pool: ctx.pool,
        outputTypescriptFile: outputFile,
      });
      const content = fs.readFileSync(outputFile, "utf8");
      expect(content).toContain("category_idSchema");
    } finally {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  });
});

describe("enum schema generation", () => {
  let enumContent: string;

  beforeEach(async () => {
    await resetDb(ctx);
    ctx = await setupPublicSchemaTest("tests/fixtures/enum-schema.sql");

    const outputFile = path.join(os.tmpdir(), `enum-test-${Date.now()}.ts`);
    await runSchemaGeneration({
      pool: ctx.pool,
      outputTypescriptFile: outputFile,
      format: false,
    });
    enumContent = fs.readFileSync(outputFile, "utf8");
    fs.unlinkSync(outputFile);
  });

  it("generates z.enum schemas for PostgreSQL enum types", () => {
    expect(enumContent).toContain('z.enum(["pending", "in_progress", "done"])');
    expect(enumContent).toContain(
      'z.enum(["info", "warning", "error", "fatal"])',
    );
  });

  it("generates enum schema type exports", () => {
    expect(enumContent).toContain("export const task_statusSchema");
    expect(enumContent).toContain("export type task_status");
    expect(enumContent).toContain("export const severitySchema");
    expect(enumContent).toContain("export type severity");
  });

  it("references enum schema for scalar enum columns", () => {
    // NOT NULL enum column
    expect(enumContent).toContain("status: task_statusSchema,");
    // nullable enum column
    expect(enumContent).toContain("severity: severitySchema.nullable(),");
  });

  it("generates z.array wrapper for enum array columns", () => {
    // NOT NULL enum array column
    expect(enumContent).toContain("tags: z.array(severitySchema),");
    // nullable enum array column
    expect(enumContent).toContain(
      "history: z.array(task_statusSchema).nullable(),",
    );
  });
});

describe("pagila schema generation", () => {
  let pagilaCtx: DumpTestDb;

  beforeAll(async () => {
    pagilaCtx = await setupDumpTestDb("tests/fixtures/pagila.sql");
  });

  afterAll(async () => {
    await teardownDumpTestDb(pagilaCtx);
  });

  it("matches the predefined pagila schema", async () => {
    const outputFile = path.join(
      os.tmpdir(),
      `pagila-schema-test-${Date.now()}.ts`,
    );
    try {
      await runSchemaGeneration({
        pool: pagilaCtx.pool,
        outputTypescriptFile: outputFile,
        config: {
          schemaExportName: "pagila_schema",
          allowUnknownDataTypes: true,
          columnNameTransform: (name) => name.replace(/ /g, "_"),
        },
      });
      const content = fs.readFileSync(outputFile, "utf8");
      const expectedContent = fs.readFileSync(
        "tests/fixtures/pagila-schema.ts",
        "utf8",
      );
      expect(content).toEqual(expectedContent);
    } finally {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  });
});
