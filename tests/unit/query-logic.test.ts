import { describe, it, expect, vi } from "vitest";
import {
  checkMixedTransactionTypes,
  getTransactionContext,
  runSqlStatement,
  runUsingContextTransaction,
  runUsingTransaction,
} from "../../src/database/query-logic";
import { PiquelErrorCode } from "../../src/errors";
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

describe("runUsingContextTransaction", () => {
  it("acquires a client and runs the fn when no ambient context exists", async () => {
    const client = makeClient();
    const getClient = vi.fn().mockResolvedValue(client);
    const fn = vi.fn().mockResolvedValue("result");

    const result = await runUsingContextTransaction(getClient, fn, "disallow");

    expect(getClient).toHaveBeenCalledOnce();
    expect(result).toBe("result");
  });

  it('"reuse" with no ambient context — acquires a client and runs the fn normally', async () => {
    const client = makeClient();
    const getClient = vi.fn().mockResolvedValue(client);
    const fn = vi.fn().mockResolvedValue("result");

    const result = await runUsingContextTransaction(getClient, fn, "reuse");

    expect(getClient).toHaveBeenCalledOnce();
    expect(result).toBe("result");
  });

  it('"start-new" with no ambient context — acquires a client and runs the fn normally', async () => {
    const client = makeClient();
    const getClient = vi.fn().mockResolvedValue(client);
    const fn = vi.fn().mockResolvedValue("result");

    const result = await runUsingContextTransaction(getClient, fn, "start-new");

    expect(getClient).toHaveBeenCalledOnce();
    expect(result).toBe("result");
  });

  it('"disallow" — throws NESTED_CONTEXT_TRANSACTION when ambient context client exists', async () => {
    const outerClient = makeClient();
    const getClient = vi.fn().mockResolvedValue(outerClient);

    await runUsingContextTransaction(
      getClient,
      async () => {
        const innerClient = makeClient();
        const innerGetClient = vi.fn().mockResolvedValue(innerClient);
        await expect(
          runUsingContextTransaction(innerGetClient, vi.fn(), "disallow"),
        ).rejects.toMatchObject({
          code: PiquelErrorCode.NESTED_CONTEXT_TRANSACTION,
        });
      },
      "disallow",
    );
  });

  it('"reuse" — returns fn() directly when ambient context exists, without acquiring new client', async () => {
    const outerClient = makeClient();
    const outerGetClient = vi.fn().mockResolvedValue(outerClient);

    await runUsingContextTransaction(
      outerGetClient,
      async () => {
        const innerGetClient = vi.fn();
        const fn = vi.fn().mockResolvedValue("inner");
        const result = await runUsingContextTransaction(
          innerGetClient,
          fn,
          "reuse",
        );
        expect(result).toBe("inner");
        expect(innerGetClient).not.toHaveBeenCalled();
      },
      "reuse",
    );
  });

  it('"start-new" — acquires a new client even when ambient context exists', async () => {
    const outerClient = makeClient();
    const outerGetClient = vi.fn().mockResolvedValue(outerClient);

    await runUsingContextTransaction(
      outerGetClient,
      async () => {
        const innerClient = makeClient();
        const innerGetClient = vi.fn().mockResolvedValue(innerClient);
        const fn = vi.fn().mockResolvedValue("inner");
        await runUsingContextTransaction(innerGetClient, fn, "start-new");
        expect(innerGetClient).toHaveBeenCalledOnce();
      },
      "start-new",
    );
  });

  it('"start-new" inner throws and is caught — outer context is preserved and outer fn continues', async () => {
    const outerClient = makeClient();
    const outerGetClient = vi.fn().mockResolvedValue(outerClient);
    const afterInnerThrow = vi.fn();

    await runUsingContextTransaction(
      outerGetClient,
      async () => {
        const innerClient = makeClient();
        const innerGetClient = vi.fn().mockResolvedValue(innerClient);

        await expect(
          runUsingContextTransaction(
            innerGetClient,
            vi.fn().mockRejectedValue(new Error("inner fail")),
            "start-new",
          ),
        ).rejects.toThrow("inner fail");

        // Outer context must still be the outer client
        expect(getTransactionContext()).toMatchObject({
          client: outerClient,
          type: "context",
        });
        afterInnerThrow();
      },
      "start-new",
    );

    expect(afterInnerThrow).toHaveBeenCalledOnce();
  });

  it('"reuse" inner throws and is caught — outer context is preserved and outer fn continues', async () => {
    const outerClient = makeClient();
    const outerGetClient = vi.fn().mockResolvedValue(outerClient);
    const afterInnerThrow = vi.fn();

    await runUsingContextTransaction(
      outerGetClient,
      async () => {
        const innerGetClient = vi.fn();

        await expect(
          runUsingContextTransaction(
            innerGetClient,
            vi.fn().mockRejectedValue(new Error("inner fail")),
            "reuse",
          ),
        ).rejects.toThrow("inner fail");

        // Outer context must still be active
        expect(getTransactionContext()).toMatchObject({
          client: outerClient,
          type: "context",
        });
        afterInnerThrow();
      },
      "reuse",
    );

    expect(afterInnerThrow).toHaveBeenCalledOnce();
  });
});

describe("checkMixedTransactionTypes", () => {
  it('"disallow" with ambient context client, caller explicit — throws MIXED_TRANSACTION_TYPES', async () => {
    const client = makeClient();
    const getClient = vi.fn().mockResolvedValue(client);

    await runUsingContextTransaction(
      getClient,
      () => {
        expect(() => {
          checkMixedTransactionTypes("disallow", "explicit");
        }).toThrow(
          expect.objectContaining({
            code: PiquelErrorCode.MIXED_TRANSACTION_TYPES,
          }),
        );
        return Promise.resolve();
      },
      "disallow",
    );
  });

  it('"disallow" with ambient explicit client, caller context — throws MIXED_TRANSACTION_TYPES', async () => {
    const client = makeClient();

    await runUsingTransaction(
      client,
      () => {
        expect(() => {
          checkMixedTransactionTypes("disallow", "context");
        }).toThrow(
          expect.objectContaining({
            code: PiquelErrorCode.MIXED_TRANSACTION_TYPES,
          }),
        );
        return Promise.resolve();
      },
      true,
    );
  });

  it('"disallow" with ambient context, caller context — does not throw', async () => {
    const client = makeClient();
    const getClient = vi.fn().mockResolvedValue(client);

    await runUsingContextTransaction(
      getClient,
      () => {
        expect(() => {
          checkMixedTransactionTypes("disallow", "context");
        }).not.toThrow();
        return Promise.resolve();
      },
      "disallow",
    );
  });

  it('"disallow" with no ambient context — does not throw', () => {
    expect(() => {
      checkMixedTransactionTypes("disallow", "explicit");
    }).not.toThrow();
    expect(() => {
      checkMixedTransactionTypes("disallow", "context");
    }).not.toThrow();
  });

  it('"allow" with ambient different type — does not throw', async () => {
    const client = makeClient();
    const getClient = vi.fn().mockResolvedValue(client);

    await runUsingContextTransaction(
      getClient,
      () => {
        expect(() => {
          checkMixedTransactionTypes("allow", "explicit");
        }).not.toThrow();
        return Promise.resolve();
      },
      "disallow",
    );
  });
});
