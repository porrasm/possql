# Piquel

Typed raw PostgreSQL queries with optional Zod validation and schema generation.

```ts
import { z } from "zod";
import { createDatabase, createOperation, sql } from "piquel";
import { schema } from "./generated-schema";

// Wrap a pool in a database facade
const db = createDatabase({
  pool: somePool,
  useZodValidation: process.env.NODE_ENV !== "production",
});

// Create a reusable operation
const getUserById = createOperation(
  ({ id }: { id: number }) => sql`SELECT * FROM users WHERE id = ${id}`,
  z.object({
    user_id: z.number(),
    name: z.string(),
  }),
);

// Use the operation
const user = await db.client.queryOne(getUserById({ id: 1 }));

// Or use the operation inside a transaction
const updatedUser = await db.transact(async (tx) => {
  await tx.nonQuery(sql`UPDATE users SET name = ${"John"} WHERE id = ${1}`);
  return tx.queryOne(getUserById({ id: 1 }));
});
```

## Installation

```bash
npm install piquel zod

# Piquel is not a database driver — you need one separately (e.g., pg)
npm install pg
```

## Why Piquel

- Raw SQL first, no ORM DSL
- Nested SQL composition (`sql` inside `sql`)
- Type inference from Zod schemas
- Optional `createOperation` pattern for reusable query units
- Runtime validation toggle (`useZodValidation`) for safety in dev/test
- Built-in transaction support
- Safe parameterized SQL via template interpolation
- Works with different PostgreSQL clients through a small adapter interface

## Features

| Component | Description |
|---|---|
| **[Database facade](docs/database-facade.md)** | Wraps a pool and exposes `query`, `queryOne`, `queryOneOrNone`, and `nonQuery` with optional Zod validation |
| **[SQL builder](docs/sql-builder.md)** | `sql` tagged template for parameterized, composable SQL |
| **[Operations](docs/operations.md)** | `createOperation` pairs SQL + Zod validator into reusable, context-agnostic query units |
| **[Transactions](docs/transactions.md)** | `db.transact()` with automatic commit/rollback |
| **[Schema generation](docs/schema-generation.md)** | `runSchemaGeneration` introspects PostgreSQL and generates Zod validators + TypeScript types |
| **[Adapter contract](docs/adapter-contract.md)** | `PoolLike`/`PoolClientLike` interfaces for integrating any PostgreSQL driver |
| **[Error handling](src/errors.ts)** | `PiquelError` class with typed `PiquelErrorCode` for programmatic error handling |

### Why Piquel?

Piquel is lightweight and versatile, and fits common patterns of database usage. It can easily be integrated into existing projects as it support step by step (even query by query) adoption . Runtime Zod validation in dev and automated tests catches schema drift early while schema generation can be utilized to keep type information in sync with the database.

## Documentation

Dcumentation is available in the [`docs/`](docs/) folder:

- [Getting Started](docs/getting-started.md) — installation, prerequisites, quickstart
- [SQL Builder](docs/sql-builder.md) — parameterized SQL, nesting, dynamic composition
- [Database Facade](docs/database-facade.md) — query methods, validation, error behavior
- [Operations](docs/operations.md) — reusable query units with `createOperation`
- [Transactions](docs/transactions.md) — commit/rollback semantics
- [Schema Generation](docs/schema-generation.md) — config options and generated output
- [Adapter Contract](docs/adapter-contract.md) — integrating other PostgreSQL drivers

### Examples

Examples are in [`examples/`](examples/) and they provide a quick demonstration of most common use cases.
