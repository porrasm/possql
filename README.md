# possql

Type-safe PostgreSQL database library with schema generation.

## Installation

```bash
npm install possql pg zod
```

## Quick Start

### 1. Create a database instance

```typescript
import { createDatabase } from "possql";
import pg from "pg";

export const db = createDatabase({
  pool: new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  useZodValidation: false, // set to true in development to validate query results
});
```

### 2. Define operations with `sql` and `createOperation`

```typescript
import { sql, createOperation } from "possql";
import { z } from "zod";

const getUser = createOperation(
  ({ id }: { id: number }) => sql`SELECT * FROM users WHERE id = ${id}`,
  z.object({ id: z.number(), name: z.string(), email: z.string() }),
);

// Execute
const user = await db.client.queryOne(getUser({ id: 1 }));
const users = await db.client.query(getUser({ id: 1 }));
```

### 3. Transactions

```typescript
const result = await db.transact(async (client) => {
  const user = await client.queryOne(getUser({ id: 1 }));
  await client.nonQuery(updateUser({ id: user.id, name: "New Name" }));
  return user;
});
```

## Schema Generation

Add to your `package.json`:

```json
{
  "scripts": {
    "db:types": "possql generate-schema --connection-string $DATABASE_URL --output ./src/database/schema.ts"
  }
}
```

Then run:

```bash
npm run db:types
```

### CLI Options

| Flag | Description | Required |
|------|-------------|----------|
| `--connection-string` | PostgreSQL connection string | Yes |
| `--output` | Output TypeScript file path | Yes |
| `--schema-name` | Export name for the schema object (default: `schema`) | No |

## Configuration

### `createDatabase(config)`

| Option | Type | Description |
|--------|------|-------------|
| `pool` | `pg.Pool` | PostgreSQL connection pool |
| `useZodValidation` | `boolean` | Validate query results with Zod (disable in production for performance) |

### Schema Generation Config

Pass via `--schema-name` CLI flag or in the programmatic API:

```typescript
import { runSchemaGeneration } from "possql";

await runSchemaGeneration({
  dbConnectionString: "postgres://...",
  outputTypescriptFile: "./src/schema.ts",
  config: {
    schemaExportName: "schema",         // default: "schema"
    primaryKeySuffix: "_id",            // default: "_id"
    tableTypeSuffix: "Type",            // default: "Type"
    tableNameTransform: (name) => name, // default: identity
    columnNameTransform: (name) => name, // default: identity
  },
});
```
