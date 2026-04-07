import { PiquelError, PiquelErrorCode } from "../errors";
import { type PoolClientLike, type PoolLike } from "./external-types";
import { getTransactionClient } from "./transaction-context";

export interface ResolvedClient {
  client: PoolClientLike;
  releaseAfterQuery: boolean;
}

/** Always acquires a fresh client from the pool (with optional timeout). */
export const createPoolConnect = (
  pool: PoolLike,
  connectionTimeoutMs: number | undefined,
): (() => Promise<PoolClientLike>) => {
  if (connectionTimeoutMs === undefined || connectionTimeoutMs <= 0) {
    return () => pool.connect();
  }

  const timeoutMs = connectionTimeoutMs;
  const timeoutDetail = `Exceeded ${timeoutMs.toString()}ms`;

  return async () => {
    let didTimeout = false;
    const connectPromise = pool.connect();
    void connectPromise.then(
      (client) => {
        if (didTimeout) {
          client.release();
        }
      },
      () => undefined,
    );

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        didTimeout = true;
        reject(
          new PiquelError(PiquelErrorCode.CONNECTION_TIMEOUT, timeoutDetail),
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([connectPromise, timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  };
};

/**
 * Creates a client resolver that checks AsyncLocalStorage for an ambient
 * transaction client at query time. Falls back to the pool when none exists.
 */
export const createGetClient = (
  poolConnect: () => Promise<PoolClientLike>,
): (() => Promise<ResolvedClient>) => {
  return async () => {
    const ambientClient = getTransactionClient();
    if (ambientClient) {
      return { client: ambientClient, releaseAfterQuery: false };
    }
    return { client: await poolConnect(), releaseAfterQuery: true };
  };
};
