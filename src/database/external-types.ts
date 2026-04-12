interface SQLStatementLike {
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: any[];
}

interface QueryResultLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
}

export interface PoolClientLike {
  release: () => void;
  query: (sql: string | SQLStatementLike) => Promise<QueryResultLike>;
}
/** Minimal pool interface that {@link createDatabase} accepts. */
export interface PoolLike {
  connect: () => Promise<PoolClientLike>;
}
