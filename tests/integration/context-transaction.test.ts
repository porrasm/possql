/* eslint-disable @typescript-eslint/no-empty-function */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { sql } from "../../src/database/sql/sql-builder";
import { setupTestDb, resetDb, type TestDb } from "../helpers/db";
import { PiquelErrorCode } from "../../src/errors";

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

  it("nested contextTransact throws NESTED_CONTEXT_TRANSACTION with disallow strategy (default)", async () => {
    await expect(
      testDb.db.contextTransact(async () => {
        await testDb.db.client.nonQuery(
          sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
        );
        await testDb.db.contextTransact(async () => {
          await testDb.db.client.nonQuery(
            sql`INSERT INTO users (user_id, name, email) VALUES (3, 'Carol', 'carol@example.com')`,
          );
        });
      }),
    ).rejects.toMatchObject({
      code: PiquelErrorCode.NESTED_CONTEXT_TRANSACTION,
    });

    const rows = await testDb.db.client.query(
      sql`SELECT * FROM users`,
      userSchema,
    );
    // Both Bob and Carol rolled back
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

  it("transact inside contextTransact throws MIXED_TRANSACTION_TYPES with disallow strategy (default)", async () => {
    await expect(
      testDb.db.contextTransact(async () => {
        await testDb.db.client.nonQuery(
          sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
        );
        await testDb.db.transact(async (txClient) => {
          await txClient.nonQuery(
            sql`INSERT INTO users (user_id, name, email) VALUES (3, 'Carol', 'carol@example.com')`,
          );
        });
      }),
    ).rejects.toMatchObject({ code: PiquelErrorCode.MIXED_TRANSACTION_TYPES });
  });
});

describe("nestedContextTransactionStrategy", () => {
  it('"disallow" — nested contextTransact throws', async () => {
    const db = await setupTestDb("tests/fixtures/small-schema.sql", {
      nestedContextTransactionStrategy: "disallow",
    });

    await expect(
      db.db.contextTransact(async () => {
        await db.db.contextTransact(async () => {});
      }),
    ).rejects.toMatchObject({
      code: PiquelErrorCode.NESTED_CONTEXT_TRANSACTION,
    });

    await resetDb(db);
  });

  it('"reuse" — nested joins outer, outer error rolls back both', async () => {
    const db = await setupTestDb("tests/fixtures/small-schema.sql", {
      nestedContextTransactionStrategy: "reuse",
    });

    await db.db.client.nonQuery(
      sql`INSERT INTO users (user_id, name, email) VALUES (1, 'Alice', 'alice@example.com')`,
    );

    await expect(
      db.db.contextTransact(async () => {
        await db.db.client.nonQuery(
          sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
        );
        await db.db.contextTransact(async () => {
          await db.db.client.nonQuery(
            sql`INSERT INTO users (user_id, name, email) VALUES (3, 'Carol', 'carol@example.com')`,
          );
        });
        throw new Error("outer rollback");
      }),
    ).rejects.toThrow("outer rollback");

    const rows = await db.db.client.query(sql`SELECT * FROM users`, userSchema);
    // Alice was inserted outside the transaction, Bob and Carol rolled back
    expect(rows).toHaveLength(1);

    await resetDb(db);
  });

  it('"start-new" — nested commits independently, outer error does not affect inner', async () => {
    const db = await setupTestDb("tests/fixtures/small-schema.sql", {
      nestedContextTransactionStrategy: "start-new",
    });

    await expect(
      db.db.contextTransact(async () => {
        await db.db.client.nonQuery(
          sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
        );
        await db.db.contextTransact(async () => {
          await db.db.client.nonQuery(
            sql`INSERT INTO users (user_id, name, email) VALUES (3, 'Carol', 'carol@example.com')`,
          );
        });
        throw new Error("outer rollback");
      }),
    ).rejects.toThrow("outer rollback");

    const rows = await db.db.client.query(sql`SELECT * FROM users`, userSchema);
    // Carol committed via inner transaction, Bob rolled back with outer
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Carol" });

    await resetDb(db);
  });

  it('"start-new" — inner throws, outer catches: inner rolls back independently, outer still commits', async () => {
    const db = await setupTestDb("tests/fixtures/small-schema.sql", {
      nestedContextTransactionStrategy: "start-new",
    });

    await db.db.contextTransact(async () => {
      await db.db.client.nonQuery(
        sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
      );
      try {
        await db.db.contextTransact(async () => {
          await db.db.client.nonQuery(
            sql`INSERT INTO users (user_id, name, email) VALUES (3, 'Carol', 'carol@example.com')`,
          );
          throw new Error("inner fail");
        });
      } catch {
        // caught — outer continues
      }
      await db.db.client.nonQuery(
        sql`INSERT INTO users (user_id, name, email) VALUES (4, 'Dave', 'dave@example.com')`,
      );
    });

    const rows = await db.db.client.query(
      sql`SELECT * FROM users ORDER BY user_id`,
      userSchema,
    );
    // Bob and Dave committed; Carol rolled back by the inner transaction
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name)).toEqual(["Bob", "Dave"]);

    await resetDb(db);
  });

  it('"reuse" — inner throws, outer catches: both inserts are on the same transaction and outer commits', async () => {
    const db = await setupTestDb("tests/fixtures/small-schema.sql", {
      nestedContextTransactionStrategy: "reuse",
    });

    await db.db.contextTransact(async () => {
      await db.db.client.nonQuery(
        sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
      );
      try {
        await db.db.contextTransact(async () => {
          await db.db.client.nonQuery(
            sql`INSERT INTO users (user_id, name, email) VALUES (3, 'Carol', 'carol@example.com')`,
          );
          throw new Error("inner fail");
        });
      } catch {
        // caught — outer continues
      }
      await db.db.client.nonQuery(
        sql`INSERT INTO users (user_id, name, email) VALUES (4, 'Dave', 'dave@example.com')`,
      );
    });

    const rows = await db.db.client.query(
      sql`SELECT * FROM users ORDER BY user_id`,
      userSchema,
    );
    // All three on the same transaction — all committed
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.name)).toEqual(["Bob", "Carol", "Dave"]);

    await resetDb(db);
  });
});

describe("mixTransactionTypesStrategy", () => {
  it('"disallow" — transact inside contextTransact throws', async () => {
    const db = await setupTestDb("tests/fixtures/small-schema.sql", {
      mixTransactionTypesStrategy: "disallow",
    });

    await expect(
      db.db.contextTransact(async () => {
        await db.db.transact(async () => {});
      }),
    ).rejects.toMatchObject({ code: PiquelErrorCode.MIXED_TRANSACTION_TYPES });

    await resetDb(db);
  });

  it('"disallow" — contextTransact inside transact throws', async () => {
    const db = await setupTestDb("tests/fixtures/small-schema.sql", {
      mixTransactionTypesStrategy: "disallow",
    });

    await expect(
      db.db.transact(async () => {
        await db.db.contextTransact(async () => {});
      }),
    ).rejects.toMatchObject({ code: PiquelErrorCode.MIXED_TRANSACTION_TYPES });

    await resetDb(db);
  });

  it('"allow" — transact inside contextTransact works independently', async () => {
    const db = await setupTestDb("tests/fixtures/small-schema.sql", {
      mixTransactionTypesStrategy: "allow",
      nestedContextTransactionStrategy: "reuse",
    });

    await db.db.contextTransact(async () => {
      await db.db.client.nonQuery(
        sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
      );
      await db.db.transact(async (txClient) => {
        await txClient.nonQuery(
          sql`INSERT INTO users (user_id, name, email) VALUES (3, 'Carol', 'carol@example.com')`,
        );
      });
    });

    const rows = await db.db.client.query(
      sql`SELECT * FROM users ORDER BY user_id`,
      userSchema,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name)).toContain("Carol");

    await resetDb(db);
  });

  it('"allow" — inner transact throws, outer contextTransact catches: inner rolls back, outer commits', async () => {
    const db = await setupTestDb("tests/fixtures/small-schema.sql", {
      mixTransactionTypesStrategy: "allow",
    });

    await db.db.contextTransact(async () => {
      await db.db.client.nonQuery(
        sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
      );
      try {
        await db.db.transact(async (txClient) => {
          await txClient.nonQuery(
            sql`INSERT INTO users (user_id, name, email) VALUES (3, 'Carol', 'carol@example.com')`,
          );
          throw new Error("transact fail");
        });
      } catch {
        // caught — outer contextTransact continues
      }
      await db.db.client.nonQuery(
        sql`INSERT INTO users (user_id, name, email) VALUES (4, 'Dave', 'dave@example.com')`,
      );
    });

    const rows = await db.db.client.query(
      sql`SELECT * FROM users ORDER BY user_id`,
      userSchema,
    );
    // Bob and Dave committed; Carol rolled back by the inner transact
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name)).toEqual(["Bob", "Dave"]);

    await resetDb(db);
  });

  it('"allow" — contextTransact inside transact works independently', async () => {
    const db = await setupTestDb("tests/fixtures/small-schema.sql", {
      mixTransactionTypesStrategy: "allow",
      nestedContextTransactionStrategy: "reuse",
    });

    await db.db.transact(async () => {
      await db.db.contextTransact(async () => {
        await db.db.client.nonQuery(
          sql`INSERT INTO users (user_id, name, email) VALUES (2, 'Bob', 'bob@example.com')`,
        );
      });
    });

    const rows = await db.db.client.query(
      sql`SELECT * FROM users ORDER BY user_id`,
      userSchema,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Bob" });

    await resetDb(db);
  });
});
