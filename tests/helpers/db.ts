import fs from "fs";
import path from "path";
import pg from "pg";
import { createDatabase } from "../../src/database/db-definition";
import type { Database } from "../../src/database/db-definition";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://pgtest:pgtest@localhost:5433/pg_db_lib_test";

export interface TestDb {
  db: Database;
  pool: pg.Pool;
  adminPool: pg.Pool;
  schemaName: string;
}

export async function setupTestDb(
  sqlFile: string,
  params?: {
    useZodValidation?: boolean;
  },
): Promise<TestDb> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const schemaName = `test_${Date.now()}_${suffix}`;

  const adminPool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

  // Create isolated schema and run the fixture SQL inside it
  const client = await adminPool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}"`);

    const sqlContent = fs.readFileSync(path.resolve(sqlFile), "utf8");
    await client.query(sqlContent);
  } finally {
    client.release();
  }

  // Create a pool that sets search_path on every new connection
  const pool = new pg.Pool({
    connectionString: TEST_DATABASE_URL,
  });

  // Patch connect() to set search_path automatically
  const originalConnect = pool.connect.bind(pool);
  pool.connect = async (): Promise<pg.PoolClient> => {
    const c = await originalConnect();
    await c.query(`SET search_path TO "${schemaName}"`);
    return c;
  };

  const db = createDatabase({
    pool,
    useZodValidation: params?.useZodValidation ?? true,
  });

  return { db, pool, adminPool, schemaName };
}

export async function setupPublicSchemaTest(sqlFile: string): Promise<{ pool: pg.Pool }> {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  const sqlContent = fs.readFileSync(path.resolve(sqlFile), "utf8");
  await pool.query(sqlContent);
  return { pool };
}

export async function resetDb(ctx: TestDb | { pool: pg.Pool }): Promise<void> {
  if ("schemaName" in ctx) {
    await ctx.adminPool.query(`DROP SCHEMA "${ctx.schemaName}" CASCADE`);
    await ctx.adminPool.end();
    await ctx.pool.end();
  } else {
    const res = await ctx.pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    for (const row of res.rows as { tablename: string }[]) {
      await ctx.pool.query(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`);
    }
    await ctx.pool.end();
  }
}
