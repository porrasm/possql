# SQL Builder

The `sql` tagged template creates parameterized SQL definitions safe from typical SQL injection.

## Basic usage

```ts
import { sql } from "piquel";

const id = 42;
const query = sql`SELECT * FROM users WHERE user_id = ${id}`;
```

Interpolated values become parameterized query values — they are never concatenated into the SQL string. The resulting `SQLDefinition` separates the SQL template from its parameters:

```ts
// query.templateSqlQuery → ["SELECT * FROM users WHERE user_id = ", ""]
// query.sqlParameters    → [42]
```

When executed, the driver receives a parameterized statement like `SELECT * FROM users WHERE user_id = $1` with values `[42]`.

## Accepted parameter types

The `sql` template accepts:

- `string`, `number`, `boolean`
- `null` (maps to SQL `NULL`)
- `bigint` (maps to PostgreSQL `int8`/`bigserial`)
- `Uint8Array` / `Buffer` (maps to PostgreSQL `bytea`)
- `Date`
- Arrays and records of the above primitives (serialized by the driver, useful for `jsonb`)
- Another `SQLDefinition` (nested composition — see below)

`undefined` is **not** accepted and throws a `PiquelError` with code `UNDEFINED_SQL_PARAMETER` at runtime. This prevents accidental silent bugs where a missing value would be interpolated as `NULL`.

## `unsafeParam` — escape hatch for custom types

If you need to pass a value whose type is not in the whitelist above — for example a custom class instance that your database driver knows how to serialize — wrap it with `unsafeParam`:

```ts
import { sql, unsafeParam } from "piquel";

const point = new PgPoint(1.5, 2.0); // not in the default whitelist
const query = sql`INSERT INTO locations (pos) VALUES (${unsafeParam(point)})`;
```

`unsafeParam` skips Piquel's runtime type check but **does not enable SQL injection**. The value is still passed to the driver as a bound parameter (`$1`, `$2`, …), never concatenated into the SQL string.

Standard and unsafe params can be mixed freely in the same template:

```ts
sql`UPDATE t SET a = ${standardValue}, b = ${unsafeParam(customValue)}`;
```

## `sqlUnchecked` — validation-free `sql` for entire files

If your codebase frequently uses custom driver types and per-parameter `unsafeParam` wrapping would be too noisy, use `sqlUnchecked`. It behaves identically to `sql` but skips type validation for every interpolated value — no wrapping needed at call sites.

```ts
import { sqlUnchecked } from "piquel";

const result = sqlUnchecked`INSERT INTO locations (pos) VALUES (${myCustomPoint})`;
```

### Using `sqlUnchecked` as the project default

The recommended pattern is to re-export `sqlUnchecked` as `sql` from a single project-local module, then import from that module instead of directly from `"piquel"`:

```ts
// src/db/sql.ts
export { sqlUnchecked as sql } from "piquel";
```

```ts
// src/services/user.ts
import { sql } from "../db/sql"; // picks up the unchecked variant

const query = sql`SELECT * FROM users WHERE id = ${myCustomId}`;
```

This keeps call sites clean while confining the bypass to one re-export. If only a handful of parameters need to bypass validation, prefer the targeted `unsafeParam` wrapper with the standard `sql` instead.

## Nested composition

`sql` fragments can be embedded inside other `sql` fragments. When a parameter is itself a `SQLDefinition`, the builder inlines its template parts and re-numbers the parameters automatically:

```ts
const whereClause = sql`active = ${true} AND role = ${"admin"}`;
const query = sql`SELECT * FROM users WHERE ${whereClause} ORDER BY name`;

// Produces: SELECT * FROM users WHERE active = $1 AND role = $2 ORDER BY name
// Parameters: [true, "admin"]
```

### Dynamic WHERE clauses

Nesting is particularly useful for building queries with optional filters:

```ts
const conditions: SQLDefinition[] = [];

if (title !== undefined) {
  conditions.push(sql`title ILIKE ${"%" + title + "%"}`);
}
if (minRate !== undefined) {
  conditions.push(sql`rental_rate >= ${minRate}`);
}

let query = sql`SELECT * FROM film`;

if (conditions.length > 0) {
  let where = conditions[0]!;
  for (let i = 1; i < conditions.length; i++) {
    where = sql`${where} AND ${conditions[i]!}`;
  }
  query = sql`${query} WHERE ${where}`;
}
```

### Reusable fragments

Common clauses can be extracted and reused across queries:

```ts
const activeUsers = sql`active = ${true}`;

const countQuery = sql`SELECT count(*) FROM users WHERE ${activeUsers}`;
const listQuery = sql`SELECT * FROM users WHERE ${activeUsers} ORDER BY name`;
```

See `searchFilms` in [`examples/services.ts`](../examples/services.ts) for a runnable demo of dynamic WHERE composition.

## How parameters work internally

The `sql` tagged template produces a `SQLDefinition` with two fields:

- `templateSqlQuery` — an array of string parts (one more than the number of parameters)
- `sqlParameters` — an array of parameter values

When nesting, the builder walks the inner definition's template parts and parameters, merging them into the outer definition. This means deeply nested compositions still produce a single flat parameterized query with no string concatenation.
