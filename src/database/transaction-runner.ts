import type { PoolClientLike } from "./external-types";
import type { NestedContextTransactionStrategy } from "./types";
import { PiquelError, PiquelErrorCode } from "../errors";
import {
  getTransactionContext,
  runInTransactionContext,
} from "./transaction-context";

/** Core BEGIN / COMMIT / ROLLBACK lifecycle with guaranteed client release. */
export const executeTransaction = async <T>(
  client: PoolClientLike,
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    await client.query("BEGIN");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback failures (e.g. dead connection) so we preserve the original error.
    }
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Runs a transaction that is explicitly scoped — the caller receives a
 * dedicated client and manages all queries through it. The transaction is
 * stored in AsyncLocalStorage so that mix-type checks can detect it.
 */
export const runExplicitTransaction = async <T>(
  client: PoolClientLike,
  fn: () => Promise<T>,
): Promise<T> => {
  return executeTransaction(client, () =>
    runInTransactionContext(client, "explicit", fn),
  );
};

/**
 * Runs a context (ambient) transaction. Queries issued through the normal
 * `db.client` pick up the transaction client via AsyncLocalStorage.
 *
 * Nested calls are resolved according to `nestedStrategy`:
 * - `"disallow"` — throws if a context transaction is already active
 * - `"reuse"`    — joins the outer transaction (no new BEGIN)
 * - `"start-new"` — acquires a separate client and runs an independent transaction
 */
export const runContextTransaction = async <T>(
  getClient: () => Promise<PoolClientLike>,
  fn: () => Promise<T>,
  nestedStrategy: NestedContextTransactionStrategy,
): Promise<T> => {
  const existingCtx = getTransactionContext();
  if (existingCtx) {
    switch (nestedStrategy) {
      case "disallow":
        throw new PiquelError(PiquelErrorCode.NESTED_CONTEXT_TRANSACTION);
      case "reuse":
        return fn();
      case "start-new":
        break;
    }
  }

  const newClient = await getClient();
  return runInTransactionContext(newClient, "context", () =>
    executeTransaction(newClient, fn),
  );
};
