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
  await testDb.db.client.nonQuery(
    sql`INSERT INTO users (user_id, name, email) VALUES (1, 'Alice', 'alice@example.com')`,
  );
});

afterEach(async () => {
  await resetDb(testDb);
});

describe("transact", () => {
  it("commits changes on success", async () => {
    await testDb.db.transact(async (client) => {
      await client.nonQuery(
        sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
      );
    });

    const rows = await testDb.db.client.query(
      sql`SELECT * FROM users ORDER BY user_id`,
      userSchema,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ name: "Bob" });
  });

  it("rolls back on error and leaves DB unchanged", async () => {
    await expect(
      testDb.db.transact(async (client) => {
        await client.nonQuery(
          sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
        );
        throw new Error("intentional rollback");
      }),
    ).rejects.toThrow("intentional rollback");

    const rows = await testDb.db.client.query(
      sql`SELECT * FROM users`,
      userSchema,
    );
    expect(rows).toHaveLength(1); // only Alice
  });

  it("client inside transaction has clientMetadata.type === 'transaction'", async () => {
    await testDb.db.transact((client) => {
      expect(client.clientMetadata.type).toBe("transaction");
      return Promise.resolve();
    });
  });

  it("supports querying inside a transaction", async () => {
    const result = await testDb.db.transact(async (client) => {
      return client.queryOne(
        sql`SELECT * FROM users WHERE user_id = ${1}`,
        userSchema,
      );
    });
    expect(result).toMatchObject({ name: "Alice" });
  });

  it("normal client has clientMetadata.type === 'normal'", () => {
    expect(testDb.db.client.clientMetadata.type).toBe("normal");
  });
});
