import { describe, it, expect, beforeEach } from "vitest";
import { parsePublicSchema } from "../../src/schema-generation/table-parser";
import { setConfig } from "../../src/schema-generation/schema-generation-config";
import type { PublicSchemaRow } from "../../src/schema-generation/table-parser";

beforeEach(() => {
  setConfig({});
});

function makeRow(overrides: Partial<PublicSchemaRow>): PublicSchemaRow {
  return {
    table_schema: "public",
    // Use singular "user" so that "user_id" matches the PK convention: ${table_name}_id
    table_name: "user",
    column_name: "user_id",
    data_type: "integer",
    is_nullable: "NO",
    udt_name: "int4",
    ...overrides,
  };
}

describe("parsePublicSchema", () => {
  describe("basic grouping", () => {
    it("groups columns into tables", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "user",
          column_name: "user_id",
          data_type: "integer",
        }),
        makeRow({
          table_name: "user",
          column_name: "name",
          data_type: "text",
          udt_name: "text",
        }),
      ];
      const tables = parsePublicSchema(rows, []);
      expect(tables).toHaveLength(1);
      expect(tables[0]?.name).toBe("user");
      expect(tables[0]?.columns).toHaveLength(2);
    });

    it("sorts tables alphabetically", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "zebra",
          column_name: "zebra_id",
          data_type: "integer",
        }),
        makeRow({
          table_name: "alpha",
          column_name: "alpha_id",
          data_type: "integer",
        }),
      ];
      const tables = parsePublicSchema(rows, []);
      expect(tables[0]?.name).toBe("alpha");
      expect(tables[1]?.name).toBe("zebra");
    });

    it("sorts columns alphabetically within a table", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "user",
          column_name: "name",
          data_type: "text",
          udt_name: "text",
        }),
        makeRow({
          table_name: "user",
          column_name: "active",
          data_type: "boolean",
          udt_name: "bool",
        }),
        makeRow({
          table_name: "user",
          column_name: "user_id",
          data_type: "integer",
        }),
      ];
      const tables = parsePublicSchema(rows, []);
      const names = tables[0]?.columns.map((c) => c.name);
      expect(names).toEqual(["active", "name", "user_id"]);
    });
  });

  describe("nullable columns", () => {
    it("appends .nullable() suffix for nullable columns", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "user",
          column_name: "bio",
          data_type: "text",
          is_nullable: "YES",
          udt_name: "text",
        }),
      ];
      const tables = parsePublicSchema(rows, []);
      const col = tables[0]?.columns[0];
      expect(col.zodType).toMatch(/\.nullable\(\)$/);
    });

    it("does not append suffix for NOT NULL columns", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "user",
          column_name: "name",
          data_type: "text",
          is_nullable: "NO",
          udt_name: "text",
        }),
      ];
      const tables = parsePublicSchema(rows, []);
      const col = tables[0]?.columns[0];
      expect(col.zodType).not.toMatch(/\.nullable\(\)/);
    });

    it("zodTypeWithoutNullable never contains .nullable()", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "user",
          column_name: "bio",
          data_type: "text",
          is_nullable: "YES",
          udt_name: "text",
        }),
      ];
      const tables = parsePublicSchema(rows, []);
      const col = tables[0]?.columns[0];
      expect(col.zodTypeWithoutNullable).not.toMatch(/\.nullable\(\)/);
    });
  });

  describe("primary key detection", () => {
    it("marks column as primary key when column_name === table_name + _id", () => {
      // table_name "user" → PK column must be "user_id"
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "user",
          column_name: "user_id",
          data_type: "integer",
        }),
      ];
      const tables = parsePublicSchema(rows, []);
      expect(tables[0]?.columns[0]?.isPrimaryKey).toBe(true);
    });

    it("does not mark other columns as primary key", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "user",
          column_name: "name",
          data_type: "text",
          udt_name: "text",
        }),
      ];
      const tables = parsePublicSchema(rows, []);
      expect(tables[0]?.columns[0]?.isPrimaryKey).toBe(false);
    });
  });

  describe("ignored tables", () => {
    it("skips the default ignored tables", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "migrations",
          column_name: "migrations_id",
          data_type: "integer",
        }),
        makeRow({
          table_name: "user",
          column_name: "user_id",
          data_type: "integer",
        }),
      ];
      const tables = parsePublicSchema(rows, []);
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).not.toContain("migrations");
      expect(tableNames).toContain("user");
    });

    it("respects custom ignored tables from config", () => {
      setConfig({
        getIgnoredTables: (defaults) =>
          new Set([...defaults, "custom_ignored"]),
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "custom_ignored",
          column_name: "custom_ignored_id",
          data_type: "integer",
        }),
        makeRow({
          table_name: "user",
          column_name: "user_id",
          data_type: "integer",
        }),
      ];
      const tables = parsePublicSchema(rows, []);
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).not.toContain("custom_ignored");
    });
  });

  describe("unknown type error", () => {
    it("throws for unknown data types", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          column_name: "weird",
          data_type: "completely_unknown_type",
          udt_name: "???",
        }),
      ];
      expect(() => parsePublicSchema(rows, [])).toThrow(/Unknown data type/);
    });
  });

  describe("foreign key resolution", () => {
    it("uses branded schema reference for FK columns when foreign column is a known PK", () => {
      // "user" table has "user_id" PK → detected because "user_id" === `${"user"}_id`
      // "post" table has "post_id" PK and "user_id" as FK referencing user.user_id
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "user",
          column_name: "user_id",
          data_type: "integer",
        }),
        makeRow({
          table_name: "post",
          column_name: "post_id",
          data_type: "integer",
        }),
        makeRow({
          table_name: "post",
          column_name: "user_id",
          data_type: "integer",
        }),
      ];
      const foreignKeys = [
        {
          table_name: "post",
          column_name: "user_id",
          foreign_table_name: "user",
          foreign_column_name: "user_id",
        },
      ];
      const tables = parsePublicSchema(rows, foreignKeys);
      const post = tables.find((t) => t.name === "post");
      const fkCol = post?.columns.find((c) => c.name === "user_id");
      expect(fkCol?.zodType).toContain("user_idSchema");
    });

    it("falls back to regular zod type for FK with non-PK foreign column", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "post",
          column_name: "post_id",
          data_type: "integer",
        }),
        makeRow({
          table_name: "post",
          column_name: "author_ref",
          data_type: "integer",
        }),
      ];
      const foreignKeys = [
        {
          table_name: "post",
          column_name: "author_ref",
          foreign_table_name: "user",
          foreign_column_name: "user_id", // user_id is not in rows (no user table), so falls back
        },
      ];
      const tables = parsePublicSchema(rows, foreignKeys);
      const post = tables.find((t) => t.name === "post");
      const col = post?.columns.find((c) => c.name === "author_ref");
      // foreign_column_name "user_id" is not in tableIds (no user table in rows), so falls back
      expect(col?.zodType).toBe("z.number().int()");
    });
  });

  describe("array types", () => {
    it("maps ARRAY/udt_name using zodArrayTypeMap", () => {
      // "t" table: t_id → PK (t + _id = t_id ✓), tags → ARRAY/_text
      const rows: PublicSchemaRow[] = [
        makeRow({ table_name: "t", column_name: "t_id", data_type: "integer" }),
        makeRow({
          table_name: "t",
          column_name: "tags",
          data_type: "ARRAY",
          udt_name: "_text",
          is_nullable: "NO",
        }),
      ];
      const tables = parsePublicSchema(rows, []);
      const col = tables[0]?.columns.find((c) => c.name === "tags");
      expect(col?.zodType).toBe("z.array(z.string())");
    });
  });
});
