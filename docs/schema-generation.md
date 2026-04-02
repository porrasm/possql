# Schema Generation

`runSchemaGeneration` introspects your PostgreSQL `public` schema and generates a TypeScript file with Zod validators and inferred types.

## Basic usage

You should create a development script to run schema generation and setup e.g., an npm script to run it using `npx`. Below is a full example of a schema generation script.

```ts
import pg from "pg";
import { runSchemaGeneration } from "piquel";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const main = async () => {
  await runSchemaGeneration({
    pool,
    outputTypescriptFile: "src/db/schema.ts",
    config: {
      // configuration options here
    }
  });
};

void main();
```

## Configuration

Pass a `config` object to customize the generated output:

```ts
await runSchemaGeneration({
  pool,
  outputTypescriptFile: "src/db/generated-schema.ts",
  format: true, // default: true (uses `npx --no-install prettier --write`)
  config: {
    schemaExportName: "dbSchema",        // default: "schema"
    primaryKeySuffix: "_id",             // default: "_id"
    tableTypeSuffix: "Type",             // default: "Type"
    allowUnknownDataTypes: false,        // default: false
    tableNameTransform: (name) => name,
    columnNameTransform: (name) => name,
    overrideZodType: (col) =>
      col.data_type === "jsonb"
        ? "z.record(z.string(), z.unknown())"
        : null,
    getIgnoredTables: (defaults) => {
      defaults.add("my_internal_table");
      return defaults;
    },
    getZodTypeMap: (defaults) => ({
      ...defaults,
      numeric: "z.string()",
    }),
    getZodArrayTypeMap: (defaults) => defaults,
  },
});
```

### Config options

| Option | Default | Description |
|---|---|---|
| `schemaExportName` | `"schema"` | Name of the exported schema object |
| `primaryKeySuffix` | `"_id"` | Suffix used for the ID types of primary key columns |
| `tableTypeSuffix` | `"Type"` | Suffix appended to generated type names |
| `zodNullableSuffix` | `".nullable()"` | Zod method appended for nullable columns |
| `allowUnknownDataTypes` | `false` | If `false`, throws on unmapped PostgreSQL types |
| `overrideZodType` | `() => null` | Per-column Zod type override |
| `tableNameTransform` | identity | Transform table names in generated output |
| `columnNameTransform` | identity | Transform column names in generated output |
| `getIgnoredTables` | pass-through | Modify the set of ignored tables |
| `getZodTypeMap` | pass-through | Modify the default PostgreSQL → Zod type map |
| `getZodArrayTypeMap` | pass-through | Modify the default array type map |

### Generation options

| Option | Default | Description |
|---|---|---|
| `format` | `true` | If `true`, tries to format generated output with Prettier. If Prettier is not available, generation still succeeds and formatting is skipped. |

## Views

PostgreSQL views (and materialized views) in the `public` schema are included in the generated output alongside regular tables. However, since views are read-only and may contain computed columns, their validators are generated **without** `.strict()`. This means extra fields are allowed when validating view rows, rather than causing a validation error.

Regular base tables continue to use `.strict()` validators, which reject any fields not defined in the schema.

## Generated output

The generated file exports:
- A Zod schema object containing validators for each table and view
- Inferred TypeScript types for each table and view

Run `npm run example:schema` to see schema generation in action against the pagila example database.
