import { AsyncLocalStorage } from "async_hooks";
import type { PoolClientLike } from "./external-types";
import type { MixTransactionTypesStrategy, TransactionType } from "./types";
import { PiquelError, PiquelErrorCode } from "../errors";

interface TransactionContext {
  client: PoolClientLike;
  type: TransactionType;
}

const transactionStorage = new AsyncLocalStorage<TransactionContext>();

export const getTransactionContext = (): TransactionContext | undefined => {
  return transactionStorage.getStore();
};

export const getTransactionClient = (): PoolClientLike | undefined => {
  return transactionStorage.getStore()?.client;
};

export const checkMixedTransactionTypes = (
  strategy: MixTransactionTypesStrategy,
  callerType: TransactionType,
): void => {
  if (strategy === "allow") {
    return;
  }
  const existing = getTransactionContext();
  if (existing && existing.type !== callerType) {
    throw new PiquelError(PiquelErrorCode.MIXED_TRANSACTION_TYPES);
  }
};

export const runInTransactionContext = <T>(
  client: PoolClientLike,
  type: TransactionType,
  fn: () => Promise<T>,
): Promise<T> => {
  return transactionStorage.run({ client, type }, fn);
};
