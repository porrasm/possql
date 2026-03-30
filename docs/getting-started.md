# Getting Started

## Prerequisites

- Node.js 18+
- A PostgreSQL database
- A PostgreSQL client library (e.g., [`pg`](https://www.npmjs.com/package/pg))

## Installation

```bash
npm install piquel zod

# Piquel is not a database driver — you need one separately
npm install pg
```

`piquel` requires Zod v4 (`zod@^4`).

## Quickstart

```ts
import pg from "pg";
import { z } from "zod";
import { createDatabase, sql } from "piquel";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = createDatabase({
  pool,
  useZodValidation: true,
});

const userSchema = z.object({
  user_id: z.number(),
  name: z.string(),
  email: z.string(),
  active: z.boolean().nullable(),
});

const users = await db.client.query(
  sql`SELECT * FROM users WHERE active = ${true} ORDER BY user_id`,
  userSchema,
);
// users is typed as { user_id: number; name: string; email: string; active: boolean | null }[]
```

## Validation mode

`useZodValidation` controls runtime parsing of result rows:

- `true` — rows are parsed with the provided Zod schema (catches schema drift early)
- `false` — parsing is skipped for performance; types are still inferred at compile time

A common setup:

- **development & tests:** `true`
- **production:** choose based on your performance/safety needs

```ts
const db = createDatabase({
  pool,
  useZodValidation: process.env.NODE_ENV !== "production",
});
```
