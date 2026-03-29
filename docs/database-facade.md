# Database Facade

`createDatabase` wraps a pool (e.g., `pg.Pool`) and provides typed query methods with optional Zod validation.

## Setup

```ts
import { createDatabase, type DbConfig } from "piquel";

const db = createDatabase({
  pool,                    // any PoolLike-compatible pool
  useZodValidation: true,  // enable runtime validation
});
```

## Query methods

All query methods accept either:
- A `SQLDefinition` + optional Zod validator
- A `PreparedOperation` (from `createOperation`)

### `query` — multiple rows

```ts
const users = await db.client.query(
  sql`SELECT * FROM users`,
  userSchema,
);
// Returns: UserType[]
```

### `queryOne` — exactly one row

```ts
const user = await db.client.queryOne(
  sql`SELECT * FROM users WHERE user_id = ${1}`,
  userSchema,
);
// Returns: UserType
// Throws if no row is returned
```

### `queryOneOrNone` — zero or one row

```ts
const user = await db.client.queryOneOrNone(
  sql`SELECT * FROM users WHERE user_id = ${1}`,
  userSchema,
);
// Returns: UserType | null
```

### `nonQuery` — no return value

```ts
await db.client.nonQuery(
  sql`UPDATE users SET active = ${false} WHERE user_id = ${1}`,
);
```

### Without a validator

You can skip the validator entirely — the result will be `unknown[]`:

```ts
const rows = await db.client.query(sql`SELECT now()`);
```

## Error behavior

- `queryOne` throws a `PiquelError` with code `QUERY_RETURNED_NO_ROWS` if the query returns zero rows
- `queryOne` and `queryOneOrNone` return the first row when multiple rows match

All errors thrown by Piquel are instances of `PiquelError`, which carries a `code` property (`PiquelErrorCode`) for programmatic handling. See [`src/errors.ts`](../src/errors.ts) for the full list of error codes.

See the [pagila example](../examples/) for a runnable demo of all query methods.
