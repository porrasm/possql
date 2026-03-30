import { describe, it, expect, vi } from "vitest";
import { createDatabase } from "../../src/database/db-definition";
import { PiquelErrorCode } from "../../src/errors";
import { sql } from "../../src/database/sql/sql-builder";

describe("createDatabase connectionTimeoutMs", () => {
  it("throws CONNECTION_TIMEOUT when connect exceeds timeout", async () => {
    const pendingConnection = new Promise<never>((resolve) => {
      void resolve;
    });
    const pool = {
      connect: () => pendingConnection,
    };
    const db = createDatabase({
      pool,
      useZodValidation: false,
      connectionTimeoutMs: 50,
    });

    await expect(db.client.nonQuery(sql`SELECT 1`)).rejects.toMatchObject({
      code: PiquelErrorCode.CONNECTION_TIMEOUT,
    });
  });

  it("releases the client if connect completes after the timeout", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    let resolveConnect: ((c: typeof client) => void) | undefined;
    const pool = {
      connect: () =>
        new Promise<typeof client>((resolve) => {
          resolveConnect = resolve;
        }),
    };
    const db = createDatabase({
      pool,
      useZodValidation: false,
      connectionTimeoutMs: 50,
    });

    const p = db.client.nonQuery(sql`SELECT 1`);
    await expect(p).rejects.toMatchObject({
      code: PiquelErrorCode.CONNECTION_TIMEOUT,
    });

    if (!resolveConnect) {
      throw new Error("Expected connect resolver to be assigned");
    }
    resolveConnect(client);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(client.release).toHaveBeenCalledOnce();
  });
});
