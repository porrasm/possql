import { describe, it, expect, vi } from "vitest";
import {
  checkMixedTransactionTypes,
  runInTransactionContext,
} from "../../src/database/transaction-context";
import { executeTransaction } from "../../src/database/transaction-runner";
import { PiquelErrorCode } from "../../src/errors";

function makeClient(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
    release: vi.fn(),
  };
}

describe("checkMixedTransactionTypes", () => {
  it('"disallow" with ambient context client, caller explicit — throws MIXED_TRANSACTION_TYPES', async () => {
    const client = makeClient();

    await runInTransactionContext(client, "context", () => {
      expect(() => {
        checkMixedTransactionTypes("disallow", "explicit");
      }).toThrow(
        expect.objectContaining({
          code: PiquelErrorCode.MIXED_TRANSACTION_TYPES,
        }),
      );
      return Promise.resolve();
    });
  });

  it('"disallow" with ambient explicit client, caller context — throws MIXED_TRANSACTION_TYPES', async () => {
    const client = makeClient();

    await runInTransactionContext(client, "explicit", () => {
      expect(() => {
        checkMixedTransactionTypes("disallow", "context");
      }).toThrow(
        expect.objectContaining({
          code: PiquelErrorCode.MIXED_TRANSACTION_TYPES,
        }),
      );
      return Promise.resolve();
    });
  });

  it('"disallow" with ambient context, caller context — does not throw', async () => {
    const client = makeClient();

    await runInTransactionContext(client, "context", () => {
      expect(() => {
        checkMixedTransactionTypes("disallow", "context");
      }).not.toThrow();
      return Promise.resolve();
    });
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

    await runInTransactionContext(client, "context", () => {
      expect(() => {
        checkMixedTransactionTypes("allow", "explicit");
      }).not.toThrow();
      return Promise.resolve();
    });
  });

  it("detects explicit context set by executeTransaction + runInTransactionContext", async () => {
    const client = makeClient();

    await executeTransaction(client, () =>
      runInTransactionContext(client, "explicit", () => {
        expect(() => {
          checkMixedTransactionTypes("disallow", "context");
        }).toThrow(
          expect.objectContaining({
            code: PiquelErrorCode.MIXED_TRANSACTION_TYPES,
          }),
        );
        return Promise.resolve();
      }),
    );
  });
});
