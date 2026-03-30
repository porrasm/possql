import { describe, it, expect, vi } from "vitest";
import {
  runSqlStatement,
  runUsingTransaction,
} from "../../src/database/query-logic";
import { sql } from "../../src/database/sql/sql-builder";

function makeClient(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
    release: vi.fn(),
  };
}

const simpleSql = sql`SELECT 1`;
const normalMetadata = { type: "normal" as const };
const txMetadata = { type: "transaction" as const };

describe("runSqlStatement", () => {
  describe("normal client", () => {
    it("releases the client after a successful query", async () => {
      const client = makeClient([{ n: 1 }]);
      await runSqlStatement({
        client,
        sql: simpleSql,
        clientMetadata: normalMetadata,
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
          clientMetadata: normalMetadata,
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
        clientMetadata: normalMetadata,
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
        clientMetadata: txMetadata,
      });
      expect(client.release).not.toHaveBeenCalled();
    });

    it("returns the rows from the query result", async () => {
      const rows = [{ x: 99 }];
      const client = makeClient(rows);
      const result = await runSqlStatement({
        client,
        sql: simpleSql,
        clientMetadata: txMetadata,
      });
      expect(result.rows).toEqual(rows);
    });
  });
});

describe("runUsingTransaction", () => {
  it("sends BEGIN and COMMIT on success", async () => {
    const client = makeClient();
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await runUsingTransaction(client, fn);

    expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(client.query).toHaveBeenNthCalledWith(2, "COMMIT");
    expect(result).toBe("ok");
  });

  it("sends ROLLBACK and rethrows on error", async () => {
    const client = makeClient();
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(runUsingTransaction(client, fn)).rejects.toThrow("boom");

    expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(client.query).toHaveBeenNthCalledWith(2, "ROLLBACK");
    // COMMIT should NOT be called
    const calls = client.query.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).not.toContain("COMMIT");
  });

  it("rethrows original error when ROLLBACK fails", async () => {
    const client = makeClient();
    const originalError = new Error("boom");
    const rollbackError = new Error("connection terminated");
    const fn = vi.fn().mockRejectedValue(originalError);

    client.query.mockImplementation((query: string) => {
      if (query === "ROLLBACK") {
        return Promise.reject(rollbackError);
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(runUsingTransaction(client, fn)).rejects.toBe(originalError);

    expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(client.query).toHaveBeenNthCalledWith(2, "ROLLBACK");
    const calls = client.query.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("releases the client in finally on success", async () => {
    const client = makeClient();
    await runUsingTransaction(client, vi.fn().mockResolvedValue(null));
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("releases the client in finally on error", async () => {
    const client = makeClient();
    await expect(
      runUsingTransaction(client, vi.fn().mockRejectedValue(new Error("err"))),
    ).rejects.toThrow();
    expect(client.release).toHaveBeenCalledOnce();
  });
});
