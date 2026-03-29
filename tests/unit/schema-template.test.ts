import { describe, it, expect, beforeEach } from "vitest";
import { generateSchemaTypescript } from "../../src/schema-generation/schema.template";
import { setConfig } from "../../src/schema-generation/schema-generation-config";
import type { TableToGenerate } from "../../src/schema-generation/table-parser";

beforeEach(() => {
  setConfig({});
});

function makeTable(overrides?: Partial<TableToGenerate>): TableToGenerate {
  return {
    name: "user",
    columns: [
      {
        name: "user_id",
        isPrimaryKey: true,
        zodType: "z.number().int()",
        zodTypeWithoutNullable: "z.number().int()",
      },
      {
        name: "name",
        isPrimaryKey: false,
        zodType: "z.string()",
        zodTypeWithoutNullable: "z.string()",
      },
    ],
    ...overrides,
  };
}

describe("generateSchemaTypescript", () => {
  describe("invalid TypeScript names", () => {
    it("throws when a column name contains whitespace", () => {
      const table = makeTable({
        columns: [
          {
            name: "first name",
            isPrimaryKey: false,
            zodType: "z.string()",
            zodTypeWithoutNullable: "z.string()",
          },
        ],
      });
      expect(() => generateSchemaTypescript([table])).toThrow(
        /not a valid TypeScript identifier.*first name/,
      );
    });

    it("throws when a table name contains whitespace", () => {
      const table = makeTable({ name: "my table" });
      expect(() => generateSchemaTypescript([table])).toThrow(
        /not a valid TypeScript identifier.*my table/,
      );
    });

    it("throws when a column name starts with a number", () => {
      const table = makeTable({
        columns: [
          {
            name: "1column",
            isPrimaryKey: false,
            zodType: "z.string()",
            zodTypeWithoutNullable: "z.string()",
          },
        ],
      });
      expect(() => generateSchemaTypescript([table])).toThrow(
        /not a valid TypeScript identifier.*1column/,
      );
    });

    it("throws when a table name starts with a number", () => {
      const table = makeTable({ name: "123table" });
      expect(() => generateSchemaTypescript([table])).toThrow(
        /not a valid TypeScript identifier.*123table/,
      );
    });

    it("throws when a column name contains special characters", () => {
      const table = makeTable({
        columns: [
          {
            name: "user-name",
            isPrimaryKey: false,
            zodType: "z.string()",
            zodTypeWithoutNullable: "z.string()",
          },
        ],
      });
      expect(() => generateSchemaTypescript([table])).toThrow(
        /not a valid TypeScript identifier.*user-name/,
      );
    });

    it("suggests using columnNameTransform in the error message", () => {
      const table = makeTable({
        columns: [
          {
            name: "first name",
            isPrimaryKey: false,
            zodType: "z.string()",
            zodTypeWithoutNullable: "z.string()",
          },
        ],
      });
      expect(() => generateSchemaTypescript([table])).toThrow(
        /columnNameTransform/,
      );
    });

    it("suggests using tableNameTransform in the error message for invalid table names", () => {
      const table = makeTable({ name: "my table" });
      expect(() => generateSchemaTypescript([table])).toThrow(
        /tableNameTransform/,
      );
    });

    it("succeeds with a custom columnNameTransform that fixes whitespace", () => {
      setConfig({
        columnNameTransform: (name) => name.replace(/\s+/g, "_"),
      });
      const table = makeTable({
        columns: [
          {
            name: "first name",
            isPrimaryKey: false,
            zodType: "z.string()",
            zodTypeWithoutNullable: "z.string()",
          },
        ],
      });
      const result = generateSchemaTypescript([table]);
      expect(result).toContain("first_name");
    });

    it("succeeds with a custom tableNameTransform that fixes whitespace", () => {
      setConfig({
        tableNameTransform: (name) => name.replace(/\s+/g, "_"),
      });
      const table = makeTable({ name: "my table" });
      const result = generateSchemaTypescript([table]);
      expect(result).toContain("my_table");
    });

    it("allows valid names with underscores and dollar signs", () => {
      const table = makeTable({
        name: "_valid$table",
        columns: [
          {
            name: "$valid_column",
            isPrimaryKey: false,
            zodType: "z.string()",
            zodTypeWithoutNullable: "z.string()",
          },
        ],
      });
      expect(() => generateSchemaTypescript([table])).not.toThrow();
    });
  });
});
