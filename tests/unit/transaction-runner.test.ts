import { describe, it, expect, vi } from "vitest";
import {
  executeTransaction,
  runContextTransaction,
} from "../../src/database/transaction-runner";
import { getTransactionContext } from "../../src/database/transaction-context";
import { PiquelErrorCode } from "../../src/errors";

function makeClient(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
    release: vi.fn(),
  };
}

describe("executeTransaction", () => {
  it("sends BEGIN and COMMIT on success", async () => {
    const client = makeClient();
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await executeTransaction(client, fn);

    expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(client.query).toHaveBeenNthCalledWith(2, "COMMIT");
    expect(result).toBe("ok");
  });

  it("sends ROLLBACK and rethrows on error", async () => {
    const client = makeClient();
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(executeTransaction(client, fn)).rejects.toThrow("boom");

    expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(client.query).toHaveBeenNthCalledWith(2, "ROLLBACK");
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

    await expect(executeTransaction(client, fn)).rejects.toBe(originalError);

    expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(client.query).toHaveBeenNthCalledWith(2, "ROLLBACK");
    const calls = client.query.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("releases the client in finally on success", async () => {
    const client = makeClient();
    await executeTransaction(client, vi.fn().mockResolvedValue(null));
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("releases the client in finally on error", async () => {
    const client = makeClient();
    await expect(
      executeTransaction(client, vi.fn().mockRejectedValue(new Error("err"))),
    ).rejects.toThrow();
    expect(client.release).toHaveBeenCalledOnce();
  });
});

describe("runContextTransaction", () => {
  it("acquires a client and runs the fn when no ambient context exists", async () => {
    const client = makeClient();
    const getClient = vi.fn().mockResolvedValue(client);
    const fn = vi.fn().mockResolvedValue("result");

    const result = await runContextTransaction(getClient, fn, "disallow");

    expect(getClient).toHaveBeenCalledOnce();
    expect(result).toBe("result");
  });

  it('"reuse" with no ambient context — acquires a client and runs the fn normally', async () => {
    const client = makeClient();
    const getClient = vi.fn().mockResolvedValue(client);
    const fn = vi.fn().mockResolvedValue("result");

    const result = await runContextTransaction(getClient, fn, "reuse");

    expect(getClient).toHaveBeenCalledOnce();
    expect(result).toBe("result");
  });

  it('"start-new" with no ambient context — acquires a client and runs the fn normally', async () => {
    const client = makeClient();
    const getClient = vi.fn().mockResolvedValue(client);
    const fn = vi.fn().mockResolvedValue("result");

    const result = await runContextTransaction(getClient, fn, "start-new");

    expect(getClient).toHaveBeenCalledOnce();
    expect(result).toBe("result");
  });

  it('"disallow" — throws NESTED_CONTEXT_TRANSACTION when ambient context client exists', async () => {
    const outerClient = makeClient();
    const getClient = vi.fn().mockResolvedValue(outerClient);

    await runContextTransaction(
      getClient,
      async () => {
        const innerClient = makeClient();
        const innerGetClient = vi.fn().mockResolvedValue(innerClient);
        await expect(
          runContextTransaction(innerGetClient, vi.fn(), "disallow"),
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

    await runContextTransaction(
      outerGetClient,
      async () => {
        const innerGetClient = vi.fn();
        const fn = vi.fn().mockResolvedValue("inner");
        const result = await runContextTransaction(innerGetClient, fn, "reuse");
        expect(result).toBe("inner");
        expect(innerGetClient).not.toHaveBeenCalled();
      },
      "reuse",
    );
  });

  it('"start-new" — acquires a new client even when ambient context exists', async () => {
    const outerClient = makeClient();
    const outerGetClient = vi.fn().mockResolvedValue(outerClient);

    await runContextTransaction(
      outerGetClient,
      async () => {
        const innerClient = makeClient();
        const innerGetClient = vi.fn().mockResolvedValue(innerClient);
        const fn = vi.fn().mockResolvedValue("inner");
        await runContextTransaction(innerGetClient, fn, "start-new");
        expect(innerGetClient).toHaveBeenCalledOnce();
      },
      "start-new",
    );
  });

  it('"start-new" inner throws and is caught — outer context is preserved and outer fn continues', async () => {
    const outerClient = makeClient();
    const outerGetClient = vi.fn().mockResolvedValue(outerClient);
    const afterInnerThrow = vi.fn();

    await runContextTransaction(
      outerGetClient,
      async () => {
        const innerClient = makeClient();
        const innerGetClient = vi.fn().mockResolvedValue(innerClient);

        await expect(
          runContextTransaction(
            innerGetClient,
            vi.fn().mockRejectedValue(new Error("inner fail")),
            "start-new",
          ),
        ).rejects.toThrow("inner fail");

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

    await runContextTransaction(
      outerGetClient,
      async () => {
        const innerGetClient = vi.fn();

        await expect(
          runContextTransaction(
            innerGetClient,
            vi.fn().mockRejectedValue(new Error("inner fail")),
            "reuse",
          ),
        ).rejects.toThrow("inner fail");

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
