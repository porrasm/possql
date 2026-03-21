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
  schemaName: string;
  cleanup: () => Promise<void>;
}

export async function setupTestDb(
  sqlFile: string,
  params?: {
    useZodValidation?: boolean;
  },
): Promise<TestDb> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const schemaName = `test_${Date.now()}_${suffix}`;

  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

  // Create isolated schema and run the fixture SQL inside it
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}"`);

    const sqlContent = fs.readFileSync(path.resolve(sqlFile), "utf8");
    await client.query(sqlContent);
  } finally {
    client.release();
  }

  // Create a pool that sets search_path on every new connection
  const schemaPool = new pg.Pool({
    connectionString: TEST_DATABASE_URL,
  });

  // Patch connect() to set search_path automatically
  const originalConnect = schemaPool.connect.bind(schemaPool);
  schemaPool.connect = async (): Promise<pg.PoolClient> => {
    const c = await originalConnect();
    await c.query(`SET search_path TO "${schemaName}"`);
    return c;
  };

  const db = createDatabase({
    pool: schemaPool,
    useZodValidation: params?.useZodValidation ?? true,
  });

  const cleanup = async (): Promise<void> => {
    await pool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    await pool.end();
    await schemaPool.end();
  };

  return { db, pool: schemaPool, schemaName, cleanup };
}
