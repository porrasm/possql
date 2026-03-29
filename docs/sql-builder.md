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
- `Date`
- Arrays and objects of primitives (serialized by the driver, useful for `jsonb`)
- Another `SQLDefinition` (nested composition — see below)

`undefined` is **not** accepted and throws a `PiquelError` with code `UNDEFINED_SQL_PARAMETER` at runtime. This prevents accidental silent bugs where a missing value would be interpolated as `NULL`.

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
