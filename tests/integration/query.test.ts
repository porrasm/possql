import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { sql } from "../../src/database/sql/sql-builder";
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

  // Seed some users
  await testDb.db.client.nonQuery(
    sql`INSERT INTO users (user_id, name, email, active) VALUES
      (1, 'Alice', 'alice@example.com', true),
      (2, 'Bob', 'bob@example.com', false),
      (3, 'Carol', 'carol@example.com', NULL)`
  );
});

afterEach(async () => {
  await resetDb(testDb);
});

describe("query", () => {
  it("returns all rows", async () => {
    const rows = await testDb.db.client.query(sql`SELECT * FROM users ORDER BY user_id`, userSchema);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ user_id: 1, name: "Alice" });
  });

  it("returns empty array when no rows match", async () => {
    const rows = await testDb.db.client.query(
      sql`SELECT * FROM users WHERE user_id = ${999}`,
      userSchema
    );
    expect(rows).toEqual([]);
  });

  it("validates rows with Zod schema", async () => {
    const rows = await testDb.db.client.query(sql`SELECT * FROM users ORDER BY user_id`, userSchema);
    expect(() => userSchema.array().parse(rows)).not.toThrow();
  });

  it("passes parametrized queries correctly", async () => {
    const rows = await testDb.db.client.query(
      sql`SELECT * FROM users WHERE user_id = ${2}`,
      userSchema
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Bob" });
  });
});

describe("queryOneOrNone", () => {
  it("returns the row when found", async () => {
    const row = await testDb.db.client.queryOneOrNone(
      sql`SELECT * FROM users WHERE user_id = ${1}`,
      userSchema
    );
    expect(row).toMatchObject({ user_id: 1, name: "Alice" });
  });

  it("returns null when not found", async () => {
    const row = await testDb.db.client.queryOneOrNone(
      sql`SELECT * FROM users WHERE user_id = ${999}`,
      userSchema
    );
    expect(row).toBeNull();
  });
});

describe("queryOne", () => {
  it("returns the single row", async () => {
    const row = await testDb.db.client.queryOne(
      sql`SELECT * FROM users WHERE user_id = ${1}`,
      userSchema
    );
    expect(row).toMatchObject({ user_id: 1, name: "Alice" });
  });

  it("throws when no row found", async () => {
    await expect(
      testDb.db.client.queryOne(
        sql`SELECT * FROM users WHERE user_id = ${999}`,
        userSchema
      )
    ).rejects.toThrow("Query returned undefined");
  });
});

describe("nonQuery", () => {
  it("inserts a row without returning data", async () => {
    await testDb.db.client.nonQuery(
      sql`INSERT INTO users (user_id, name, email) VALUES (100, 'Dan', 'dan@example.com')`
    );
    const row = await testDb.db.client.queryOne(
      sql`SELECT * FROM users WHERE user_id = ${100}`,
      userSchema
    );
    expect(row).toMatchObject({ name: "Dan" });
  });

  it("deletes rows without returning data", async () => {
    await testDb.db.client.nonQuery(sql`DELETE FROM users WHERE user_id = ${1}`);
    const rows = await testDb.db.client.query(sql`SELECT * FROM users`, userSchema);
    expect(rows).toHaveLength(2);
  });
});
