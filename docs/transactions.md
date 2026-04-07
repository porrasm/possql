# Transactions

Piquel provides two transaction primitives: `db.transact()` for explicit transactions where you manage the client, and `db.contextTransact()` for ambient transactions where `db.client` picks up the transaction automatically.

## `db.transact()`

`db.transact()` runs a callback inside a `BEGIN`/`COMMIT` block. The callback receives a dedicated `DBClient` bound to the transaction connection. If the callback throws, the transaction is automatically rolled back.

### Usage

```ts
await db.transact(async (tx) => {
  await tx.nonQuery(
    sql`UPDATE accounts SET balance = balance - ${100} WHERE user_id = ${1}`,
  );
  await tx.nonQuery(
    sql`UPDATE accounts SET balance = balance + ${100} WHERE user_id = ${2}`,
  );
});
```

### Return values

The transaction callback can return a value:

```ts
const user = await db.transact(async (tx) => {
  await tx.nonQuery(sql`UPDATE users SET name = ${"John"} WHERE id = ${1}`);
  return tx.queryOne(getUserById({ id: 1 }));
});
```

### Transaction client

The `tx` parameter is a full `DBClient` — it supports all four query methods (`query`, `queryOne`, `queryOneOrNone`, `nonQuery`). Operations created with `createOperation` work seamlessly inside transactions.

### Semantics

- **Commit:** automatic on successful callback return
- **Rollback:** automatic if the callback throws

See `hireActorForFilm` in [`examples/services.ts`](../examples/services.ts) for a runnable demo.

---

## `db.contextTransact()`

`db.contextTransact()` opens a transaction and makes it available to the _entire async call tree_ via `AsyncLocalStorage`. Any call to `db.client` inside the callback automatically uses the transaction connection — no need to thread a `tx` argument through your code.

### Usage

```ts
await db.contextTransact(async () => {
  // db.client automatically uses the transaction connection
  await db.client.nonQuery(
    sql`UPDATE accounts SET balance = balance - ${100} WHERE user_id = ${1}`,
  );
  await db.client.nonQuery(
    sql`UPDATE accounts SET balance = balance + ${100} WHERE user_id = ${2}`,
  );
});
```

This is especially useful in layered service code where you want multiple independent functions to participate in the same transaction without explicitly passing a client:

```ts
await db.contextTransact(async () => {
  await deductBalance(userId, amount);  // calls db.client internally
  await creditBalance(recipientId, amount);
});
```

### Semantics

- **Commit:** automatic on successful callback return
- **Rollback:** automatic if the callback throws
- **Ambient client:** `db.client` uses the transaction connection for the duration of the callback; queries outside the callback acquire a fresh pool connection as normal

---

## Nesting and mixing transaction types

By default, Piquel rejects patterns that are likely mistakes: starting a context transaction inside another context transaction, or using `transact` and `contextTransact` together in the same call stack. Both behaviours are configurable via `DbConfig`.

### `nestedContextTransactionStrategy`

Controls what happens when `db.contextTransact()` is called while a context transaction is already active.

| Value | Behaviour |
|---|---|
| `"disallow"` _(default)_ | Throws `NESTED_CONTEXT_TRANSACTION` |
| `"reuse"` | The inner call is a no-op — the callback runs on the existing transaction. An error inside the inner callback propagates and will roll back the outer transaction unless caught. |
| `"start-new"` | Acquires a new connection and opens a separate transaction. The inner transaction commits or rolls back independently of the outer one. |

```ts
// "reuse" — inner joins the outer transaction
const db = createDatabase({ pool, useZodValidation: true, nestedContextTransactionStrategy: "reuse" });

await db.contextTransact(async () => {
  await db.contextTransact(async () => {
    // runs on the same connection as the outer transaction
  });
});
```

```ts
// "start-new" — inner transaction is independent
const db = createDatabase({ pool, useZodValidation: true, nestedContextTransactionStrategy: "start-new" });

await db.contextTransact(async () => {
  await db.contextTransact(async () => {
    // own connection; commits before the outer transaction does
  });
});
```

### `mixTransactionTypesStrategy`

Controls what happens when `db.transact()` is called inside a `db.contextTransact()` callback (or vice versa).

| Value | Behaviour |
|---|---|
| `"disallow"` _(default)_ | Throws `MIXED_TRANSACTION_TYPES` |
| `"allow"` | Both transaction types can be nested freely. Each `transact` always acquires its own dedicated connection and commits/rolls back independently, regardless of any ambient context transaction. |

```ts
const db = createDatabase({ pool, useZodValidation: true, mixTransactionTypesStrategy: "allow" });

await db.contextTransact(async () => {
  await db.client.nonQuery(sql`INSERT INTO log ...`);

  // independent transact — commits or rolls back on its own
  await db.transact(async (tx) => {
    await tx.nonQuery(sql`INSERT INTO events ...`);
  });
});
```
