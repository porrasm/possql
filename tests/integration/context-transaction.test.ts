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

describe("contextTransact", () => {
  it("commits changes on success", async () => {
    await testDb.db.contextTransact(async () => {
      await testDb.db.client.nonQuery(
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
      testDb.db.contextTransact(async () => {
        await testDb.db.client.nonQuery(
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

  it("multiple db.client calls inside one contextTransact use the same transaction", async () => {
    await testDb.db.contextTransact(async () => {
      await testDb.db.client.nonQuery(
        sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
      );
      await testDb.db.client.nonQuery(
        sql`INSERT INTO users (user_id, name, email) VALUES (3, 'Carol', 'carol@example.com')`,
      );
      const rows = await testDb.db.client.query(
        sql`SELECT * FROM users ORDER BY user_id`,
        userSchema,
      );
      // All three visible inside the transaction
      expect(rows).toHaveLength(3);
    });

    const rows = await testDb.db.client.query(
      sql`SELECT * FROM users ORDER BY user_id`,
      userSchema,
    );
    expect(rows).toHaveLength(3);
  });

  it("nested contextTransact joins the outer transaction", async () => {
    await expect(
      testDb.db.contextTransact(async () => {
        await testDb.db.client.nonQuery(
          sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
        );

        // Nested contextTransact — should join the outer transaction
        await testDb.db.contextTransact(async () => {
          await testDb.db.client.nonQuery(
            sql`INSERT INTO users (user_id, name, email) VALUES (3, 'Carol', 'carol@example.com')`,
          );
        });

        // Error after nested commit — should roll back everything
        throw new Error("outer rollback");
      }),
    ).rejects.toThrow("outer rollback");

    const rows = await testDb.db.client.query(
      sql`SELECT * FROM users`,
      userSchema,
    );
    // Both Bob and Carol rolled back because nested joined the outer transaction
    expect(rows).toHaveLength(1);
  });

  it("transact still works independently", async () => {
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
  });

  it("transact inside contextTransact uses its own dedicated client", async () => {
    // transact always acquires a fresh pool client, independent of ambient context
    await testDb.db.contextTransact(async () => {
      await testDb.db.client.nonQuery(
        sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
      );

      // This transact gets its own connection and transaction
      await testDb.db.transact(async (txClient) => {
        await txClient.nonQuery(
          sql`INSERT INTO users (user_id, name, email) VALUES (3, 'Carol', 'carol@example.com')`,
        );
      });
    });

    const rows = await testDb.db.client.query(
      sql`SELECT * FROM users ORDER BY user_id`,
      userSchema,
    );
    expect(rows).toHaveLength(3);
  });
});
