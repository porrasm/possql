import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import pg from "pg";
import { sql } from "../../src/database/sql/sql-builder";
import { createDatabase } from "../../src/database/db-definition";
import { setupTestDb, resetDb, type TestDb } from "../helpers/db";

const userSchema = z.object({
  user_id: z.number(),
  name: z.string(),
  email: z.string(),
  active: z.boolean().nullable(),
});

let testDb: TestDb;

beforeEach(async () => {
  testDb = await setupTestDb("tests/fixtures/small-schema.sql");
  await testDb.db.client.nonQuery(
    sql`INSERT INTO users (user_id, name, email, active) VALUES (1, 'Alice', 'alice@example.com', true)`,
  );
});

afterEach(async () => {
  await resetDb(testDb);
});

describe("Zod validation", () => {
  it("validates rows against schema when useZodValidation=true", async () => {
    const rows = await testDb.db.client.query(
      sql`SELECT * FROM users`,
      userSchema,
    );
    expect(rows[0]).toMatchObject({ user_id: 1, name: "Alice" });
  });

  it("throws ZodError when row does not match schema", async () => {
    const strictSchema = z.object({ user_id: z.string() }); // wrong type: number not string
    await expect(
      testDb.db.client.query(sql`SELECT * FROM users`, strictSchema),
    ).rejects.toThrow();
  });

  it("bypasses Zod validation when useZodValidation=false", async () => {
    const rawPool = new pg.Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ??
        "postgresql://pgtest:pgtest@localhost:5433/pg_db_lib_test",
    });
    const schemaName = testDb.schemaName;
    const originalConnect = rawPool.connect.bind(rawPool);
    rawPool.connect = async () => {
      const c = await originalConnect();
      await c.query(`SET search_path TO "${schemaName}"`);
      return c;
    };

    const noValidationDb = createDatabase({
      pool: rawPool,
      useZodValidation: false,
    });

    // Wrong schema — should not throw because validation is disabled
    const wrongSchema = z.object({ user_id: z.string() });
    const rows = await noValidationDb.client.query(
      sql`SELECT * FROM users`,
      wrongSchema,
    );
    expect(rows).toHaveLength(1);

    await rawPool.end();
  });
});
