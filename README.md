# Piquel

<p align="center">
<a href="https://github.com/porrasm/piquel/actions/workflows/ci.yml"><img src="https://github.com/porrasm/piquel/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status" /></a>
<a href="https://codecov.io/gh/porrasm/piquel"><img src="https://codecov.io/gh/porrasm/piquel/branch/main/graph/badge.svg" alt="Coverage" /></a>
<a href="https://www.npmjs.com/package/piquel"><img src="https://img.shields.io/npm/v/piquel" alt="npm" /></a>
<a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/github/license/porrasm/piquel" alt="License" /></a>
<a href="https://github.com/porrasm/piquel"><img src="https://img.shields.io/github/stars/porrasm/piquel" alt="GitHub stars" /></a>
</p>

Typed raw PostgreSQL queries with optional Zod validation and schema generation.

> **[Read the full documentation](docs/)**

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
  ({ userId }: { userId: number }) =>
    sql`SELECT user_id, name FROM app_user WHERE user_id = ${userId}`,
  z.object({
    user_id: schema.app_user.types.user_id,
    name: schema.app_user.types.name,
  }),
);

// Use the operation
const user = await db.client.queryOne(getUserById({ userId: 1 }));

// Or use the operation inside a transaction
const updatedUser = await db.transact(async (tx) => {
  const userId = 1;
  const userBeforeUpdate = await tx.queryOne(getUserById({ userId }));

  await tx.nonQuery(
    sql`UPDATE app_user SET name = ${userBeforeUpdate.name.reverse()} WHERE user_id = ${userId}`,
  );
  return tx.queryOne(getUserById({ userId }));
});
```

## Installation

```bash
npm install piquel zod

# Piquel is not a database driver — you need one separately (e.g., pg)
npm install pg
```

`piquel` requires Zod v4 (`zod@^4`).

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

Documentation is available in the [`docs/`](docs/) folder:

- [Getting Started](docs/getting-started.md) — installation, prerequisites, quickstart
- [SQL Builder](docs/sql-builder.md) — parameterized SQL, nesting, dynamic composition
- [Database Facade](docs/database-facade.md) — query methods, validation, error behavior
- [Operations](docs/operations.md) — reusable query units with `createOperation`
- [Transactions](docs/transactions.md) — commit/rollback semantics
- [Schema Generation](docs/schema-generation.md) — config options and generated output
- [Adapter Contract](docs/adapter-contract.md) — integrating other PostgreSQL drivers

### Examples

Examples are in [`examples/`](examples/) and they provide a quick demonstration of most common use cases.
