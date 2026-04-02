import { describe, it, expect } from "vitest";
import { parsePublicSchema } from "../../src/schema-generation/table-parser";
import { populateSchemaGenerationConfig } from "../../src/schema-generation/schema-generation-config";
import type { PublicSchemaRow } from "../../src/schema-generation/metadata-queries";
import type { PrimaryKey } from "../../src/schema-generation/metadata-queries";

const defaultConfig = populateSchemaGenerationConfig({});

function makeRow(overrides: Partial<PublicSchemaRow>): PublicSchemaRow {
  return {
    table_schema: "public",
    table_name: "user",
    column_name: "user_id",
    data_type: "integer",
    is_nullable: "NO",
    udt_name: "int4",
    ...overrides,
  };
}

function pk(table_name: string, column_name: string): PrimaryKey {
  return { table_name, column_name };
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
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [pk("user", "user_id")],
        enumTypes: [],
        config: defaultConfig,
      });
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
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [pk("zebra", "zebra_id"), pk("alpha", "alpha_id")],
        enumTypes: [],
        config: defaultConfig,
      });
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
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [pk("user", "user_id")],
        enumTypes: [],
        config: defaultConfig,
      });
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
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config: defaultConfig,
      });
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
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config: defaultConfig,
      });
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
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config: defaultConfig,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodTypeWithoutNullable).not.toMatch(/\.nullable\(\)/);
    });
  });

  describe("default zod type map", () => {
    it.each([
      ["json", "z.record(z.string(), z.unknown())"],
      ["smallint", "z.number().int()"],
      ["real", "z.number()"],
      ["interval", "z.string()"],
      ["time without time zone", "z.string()"],
      ["time with time zone", "z.string()"],
      ["citext", "z.string()"],
      ["inet", "z.string()"],
      ["cidr", "z.string()"],
      ["macaddr", "z.string()"],
      ["char", "z.string()"],
      ["character", "z.string()"],
      ["money", "z.string()"],
    ])("maps %s to %s", (dataType, expectedZodType) => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "value",
          data_type: dataType,
          udt_name: dataType,
        }),
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config: defaultConfig,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe(expectedZodType);
      expect(col.zodTypeWithoutNullable).toBe(expectedZodType);
    });
  });

  describe("primary key detection", () => {
    it("marks column as primary key when it appears in primaryKeys", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "user",
          column_name: "user_id",
          data_type: "integer",
        }),
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [pk("user", "user_id")],
        enumTypes: [],
        config: defaultConfig,
      });
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
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [pk("user", "user_id")],
        enumTypes: [],
        config: defaultConfig,
      });
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
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [pk("migrations", "migrations_id"), pk("user", "user_id")],
        enumTypes: [],
        config: defaultConfig,
      });
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).not.toContain("migrations");
      expect(tableNames).toContain("user");
    });

    it("respects custom ignored tables from config", () => {
      const config = populateSchemaGenerationConfig({
        getIgnoredTables: (defaults: Set<string>) =>
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
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [
          pk("custom_ignored", "custom_ignored_id"),
          pk("user", "user_id"),
        ],
        enumTypes: [],
        config,
      });
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
      expect(() =>
        parsePublicSchema({
          rows,
          foreignKeys: [],
          primaryKeys: [],
          enumTypes: [],
          config: defaultConfig,
        }),
      ).toThrow(/no known Zod mapping/);
    });
  });

  describe("allowUnknownDataTypes", () => {
    it("does not throw for unknown data types when allowUnknownDataTypes is true", () => {
      const config = populateSchemaGenerationConfig({
        allowUnknownDataTypes: true,
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          column_name: "weird",
          data_type: "completely_unknown_type",
          udt_name: "???",
        }),
      ];
      expect(() =>
        parsePublicSchema({
          rows,
          foreignKeys: [],
          primaryKeys: [],
          enumTypes: [],
          config,
        }),
      ).not.toThrow();
    });

    it("uses z.any() for unknown data types when allowUnknownDataTypes is true", () => {
      const config = populateSchemaGenerationConfig({
        allowUnknownDataTypes: true,
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "weird",
          data_type: "completely_unknown_type",
          udt_name: "???",
        }),
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe("z.any()");
      expect(col.zodTypeWithoutNullable).toBe("z.any()");
    });

    it("uses z.any() for unknown array types when allowUnknownDataTypes is true", () => {
      const config = populateSchemaGenerationConfig({
        allowUnknownDataTypes: true,
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "weird_array",
          data_type: "ARRAY",
          udt_name: "_unknown_type",
        }),
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe("z.any()");
    });

    it("still maps known data types normally when allowUnknownDataTypes is true", () => {
      const config = populateSchemaGenerationConfig({
        allowUnknownDataTypes: true,
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "name",
          data_type: "text",
          udt_name: "text",
        }),
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe("z.string()");
    });

    it("ignores nullability for unknown data types", () => {
      const config = populateSchemaGenerationConfig({
        allowUnknownDataTypes: true,
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "weird",
          data_type: "completely_unknown_type",
          udt_name: "???",
          is_nullable: "YES",
        }),
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config,
      });
      const col = tables[0]?.columns[0];
      // unknown types always get z.any() regardless of nullability
      expect(col.zodType).toBe("z.any()");
    });

    it("does not mark unknown type columns as primary keys", () => {
      const config = populateSchemaGenerationConfig({
        allowUnknownDataTypes: true,
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "t_id",
          data_type: "custom_id_type",
          udt_name: "custom_id",
        }),
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config,
      });
      const col = tables[0]?.columns[0];
      expect(col.isPrimaryKey).toBe(false);
    });
  });

  describe("foreign key resolution", () => {
    it("uses branded schema reference for FK columns when foreign column is a known PK", () => {
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
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys,
        primaryKeys: [pk("user", "user_id"), pk("post", "post_id")],
        enumTypes: [],
        config: defaultConfig,
      });
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
          foreign_column_name: "email", // email is not a PK, so falls back
        },
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys,
        primaryKeys: [pk("post", "post_id")],
        enumTypes: [],
        config: defaultConfig,
      });
      const post = tables.find((t) => t.name === "post");
      const col = post?.columns.find((c) => c.name === "author_ref");
      expect(col?.zodType).toBe("z.number().int()");
    });
  });

  describe("overrideZodType", () => {
    it("uses the override when overrideZodType returns a string", () => {
      const config = populateSchemaGenerationConfig({
        overrideZodType: (col) =>
          col.data_type === "jsonb" ? "MyJsonSchema" : null,
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "setting",
          column_name: "value",
          data_type: "jsonb",
          udt_name: "jsonb",
          is_nullable: "NO",
        }),
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe("MyJsonSchema");
      expect(col.zodTypeWithoutNullable).toBe("MyJsonSchema");
    });

    it("appends nullable suffix to overridden type when column is nullable", () => {
      const config = populateSchemaGenerationConfig({
        overrideZodType: (col) =>
          col.data_type === "jsonb" ? "MyJsonSchema" : null,
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "setting",
          column_name: "metadata",
          data_type: "jsonb",
          udt_name: "jsonb",
          is_nullable: "YES",
        }),
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe("MyJsonSchema.nullable()");
      expect(col.zodTypeWithoutNullable).toBe("MyJsonSchema");
    });

    it("falls back to default mapping when overrideZodType returns null", () => {
      const config = populateSchemaGenerationConfig({
        overrideZodType: () => null,
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "name",
          data_type: "text",
          udt_name: "text",
        }),
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe("z.string()");
    });

    it("can override based on table and column name", () => {
      const config = populateSchemaGenerationConfig({
        overrideZodType: (col) =>
          col.table_name === "setting" && col.column_name === "value"
            ? "SettingValueSchema"
            : null,
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "setting",
          column_name: "value",
          data_type: "jsonb",
          udt_name: "jsonb",
        }),
        makeRow({
          table_name: "other",
          column_name: "value",
          data_type: "jsonb",
          udt_name: "jsonb",
        }),
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config,
      });
      const settingCol = tables.find((t) => t.name === "setting")?.columns[0];
      const otherCol = tables.find((t) => t.name === "other")?.columns[0];
      expect(settingCol?.zodType).toBe("SettingValueSchema");
      expect(otherCol?.zodType).toBe("z.record(z.string(), z.unknown())");
    });

    it("takes precedence over unknown type handling", () => {
      const config = populateSchemaGenerationConfig({
        allowUnknownDataTypes: true,
        overrideZodType: (col) =>
          col.data_type === "custom_type" ? "CustomSchema" : null,
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "col",
          data_type: "custom_type",
          udt_name: "custom",
        }),
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe("CustomSchema");
    });
  });

  describe("array types", () => {
    it("maps ARRAY/udt_name using zodArrayTypeMap", () => {
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
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [pk("t", "t_id")],
        enumTypes: [],
        config: defaultConfig,
      });
      const col = tables[0]?.columns.find((c) => c.name === "tags");
      expect(col?.zodType).toBe("z.array(z.string())");
    });
  });

  describe("enum types", () => {
    it("maps USER-DEFINED enum columns to enum schema reference", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "status",
          data_type: "USER-DEFINED",
          udt_name: "status_enum",
          is_nullable: "NO",
        }),
      ];
      const enumTypes = [
        { name: "status_enum", labels: ["active", "inactive"] },
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes,
        config: defaultConfig,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe("status_enumSchema");
      expect(col.zodTypeWithoutNullable).toBe("status_enumSchema");
    });

    it("appends .nullable() for nullable enum columns", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "status",
          data_type: "USER-DEFINED",
          udt_name: "status_enum",
          is_nullable: "YES",
        }),
      ];
      const enumTypes = [
        { name: "status_enum", labels: ["active", "inactive"] },
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes,
        config: defaultConfig,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe("status_enumSchema.nullable()");
      expect(col.zodTypeWithoutNullable).toBe("status_enumSchema");
    });

    it("returns used enums sorted alphabetically", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "priority",
          data_type: "USER-DEFINED",
          udt_name: "priority_level",
          is_nullable: "NO",
        }),
        makeRow({
          table_name: "t",
          column_name: "status",
          data_type: "USER-DEFINED",
          udt_name: "article_status",
          is_nullable: "NO",
        }),
      ];
      const enumTypes = [
        { name: "priority_level", labels: ["low", "medium", "high"] },
        { name: "article_status", labels: ["draft", "published", "archived"] },
      ];
      const { enums } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes,
        config: defaultConfig,
      });
      expect(enums).toHaveLength(2);
      expect(enums[0]?.name).toBe("article_status");
      expect(enums[1]?.name).toBe("priority_level");
    });

    it("excludes unused enums from the result", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "name",
          data_type: "text",
          udt_name: "text",
        }),
      ];
      const enumTypes = [{ name: "unused_enum", labels: ["a", "b"] }];
      const { enums } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes,
        config: defaultConfig,
      });
      expect(enums).toHaveLength(0);
    });

    it("throws for USER-DEFINED types that are not enums without allowUnknownDataTypes", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "geo",
          data_type: "USER-DEFINED",
          udt_name: "geometry",
          is_nullable: "NO",
        }),
      ];
      expect(() =>
        parsePublicSchema({
          rows,
          foreignKeys: [],
          primaryKeys: [],
          enumTypes: [],
          config: defaultConfig,
        }),
      ).toThrow(/no known Zod mapping/);
    });

    it("falls back to z.any() for USER-DEFINED non-enum with allowUnknownDataTypes", () => {
      const config = populateSchemaGenerationConfig({
        allowUnknownDataTypes: true,
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "geo",
          data_type: "USER-DEFINED",
          udt_name: "geometry",
          is_nullable: "NO",
        }),
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes: [],
        config,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe("z.any()");
    });

    it("maps enum array columns to z.array(enumSchema)", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "statuses",
          data_type: "ARRAY",
          udt_name: "_status_enum",
          is_nullable: "NO",
        }),
      ];
      const enumTypes = [
        { name: "status_enum", labels: ["active", "inactive"] },
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes,
        config: defaultConfig,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe("z.array(status_enumSchema)");
      expect(col.zodTypeWithoutNullable).toBe("z.array(status_enumSchema)");
    });

    it("appends .nullable() for nullable enum array columns", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "statuses",
          data_type: "ARRAY",
          udt_name: "_status_enum",
          is_nullable: "YES",
        }),
      ];
      const enumTypes = [
        { name: "status_enum", labels: ["active", "inactive"] },
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes,
        config: defaultConfig,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe("z.array(status_enumSchema).nullable()");
      expect(col.zodTypeWithoutNullable).toBe("z.array(status_enumSchema)");
    });

    it("includes enum in used enums when only referenced via array column", () => {
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "statuses",
          data_type: "ARRAY",
          udt_name: "_status_enum",
          is_nullable: "NO",
        }),
      ];
      const enumTypes = [
        { name: "status_enum", labels: ["active", "inactive"] },
      ];
      const { enums } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes,
        config: defaultConfig,
      });
      expect(enums).toHaveLength(1);
      expect(enums[0]?.name).toBe("status_enum");
    });

    it("overrideZodType takes precedence over enum mapping", () => {
      const config = populateSchemaGenerationConfig({
        overrideZodType: (col) =>
          col.udt_name === "status_enum" ? "CustomStatusSchema" : null,
      });
      const rows: PublicSchemaRow[] = [
        makeRow({
          table_name: "t",
          column_name: "status",
          data_type: "USER-DEFINED",
          udt_name: "status_enum",
          is_nullable: "NO",
        }),
      ];
      const enumTypes = [
        { name: "status_enum", labels: ["active", "inactive"] },
      ];
      const { tables } = parsePublicSchema({
        rows,
        foreignKeys: [],
        primaryKeys: [],
        enumTypes,
        config,
      });
      const col = tables[0]?.columns[0];
      expect(col.zodType).toBe("CustomStatusSchema");
    });
  });
});
