import { describe, it, expect, vi } from "vitest";
import { runSqlStatement } from "../../src/database/sql-executor";
import { sql } from "../../src/database/sql/sql-builder";

function makeClient(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
    release: vi.fn(),
  };
}

const simpleSql = sql`SELECT 1`;

describe("runSqlStatement", () => {
  describe("normal client", () => {
    it("does not release the client before an in-flight query settles", async () => {
      let resolveQuery: ((value: { rows: unknown[] }) => void) | undefined;
      const queryPromise = new Promise<{ rows: unknown[] }>((resolve) => {
        resolveQuery = resolve;
      });

      const client = {
        query: vi.fn().mockReturnValue(queryPromise),
        release: vi.fn(),
      };

      const runPromise = runSqlStatement({
        client,
        sql: simpleSql,
        releaseAfterQuery: true,
      });

      expect(client.release).not.toHaveBeenCalled();

      resolveQuery?.({ rows: [{ n: 1 }] });
      await expect(runPromise).resolves.toEqual({ rows: [{ n: 1 }] });
      expect(client.release).toHaveBeenCalledOnce();
    });

    it("releases the client after a successful query", async () => {
      const client = makeClient([{ n: 1 }]);
      await runSqlStatement({
        client,
        sql: simpleSql,
        releaseAfterQuery: true,
      });
      expect(client.release).toHaveBeenCalledOnce();
    });

    it("releases the client even when query throws", async () => {
      const client = makeClient();
      client.query.mockRejectedValueOnce(new Error("DB error"));
      await expect(
        runSqlStatement({
          client,
          sql: simpleSql,
          releaseAfterQuery: true,
        }),
      ).rejects.toThrow("DB error");
      expect(client.release).toHaveBeenCalledOnce();
    });

    it("returns the rows from the query result", async () => {
      const rows = [{ id: 1 }, { id: 2 }];
      const client = makeClient(rows);
      const result = await runSqlStatement({
        client,
        sql: simpleSql,
        releaseAfterQuery: true,
      });
      expect(result.rows).toEqual(rows);
    });
  });

  describe("transaction client", () => {
    it("does NOT release the client", async () => {
      const client = makeClient([]);
      await runSqlStatement({
        client,
        sql: simpleSql,
        releaseAfterQuery: false,
      });
      expect(client.release).not.toHaveBeenCalled();
    });

    it("returns the rows from the query result", async () => {
      const rows = [{ x: 99 }];
      const client = makeClient(rows);
      const result = await runSqlStatement({
        client,
        sql: simpleSql,
        releaseAfterQuery: false,
      });
      expect(result.rows).toEqual(rows);
    });
  });
});
