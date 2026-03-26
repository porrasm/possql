import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupDumpTestDb,
  teardownDumpTestDb,
  type DumpTestDb,
} from "../helpers/db";
import { pagila_schema } from "../fixtures/pagila-schema";

let testDb: DumpTestDb;

const PAGILA_TABLES = Object.values(pagila_schema);

beforeAll(async () => {
  testDb = await setupDumpTestDb("tests/fixtures/pagila.sql", {
    useZodValidation: true,
  });
});

afterAll(async () => {
  await teardownDumpTestDb(testDb);
});

describe("data fetching", () => {
  for (const table of PAGILA_TABLES) {
    it(`fetches data from ${table.tableName}`, async () => {
      const result = await testDb.pool.query(
        `SELECT * FROM ${table.tableName}`,
      );
      expect(result.rows.length).toBeGreaterThan(0);
    });
  }
});
