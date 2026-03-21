import { describe, it, expect } from "vitest";
import { sql } from "../../src/database/sql/sql-builder";

describe("sql builder", () => {
  describe("plain string template", () => {
    it("produces a single-part definition with no parameters", () => {
      const result = sql`SELECT 1`;
      expect(result.templateSqlQuery).toEqual(["SELECT 1"]);
      expect(result.sqlParameters).toEqual([]);
    });
  });

  describe("template with parameters", () => {
    it("produces correct parts and parameters for one interpolation", () => {
      const id = 42;
      const result = sql`SELECT * FROM users WHERE user_id = ${id}`;
      expect(result.templateSqlQuery).toEqual([
        "SELECT * FROM users WHERE user_id = ",
        "",
      ]);
      expect(result.sqlParameters).toEqual([42]);
    });

    it("produces correct parts and parameters for multiple interpolations", () => {
      const name = "Alice";
      const active = true;
      const result = sql`SELECT * FROM users WHERE name = ${name} AND active = ${active}`;
      expect(result.templateSqlQuery).toHaveLength(3);
      expect(result.sqlParameters).toEqual(["Alice", true]);
    });

    it("parts.length === parameters.length + 1", () => {
      const a = 1;
      const b = 2;
      const c = 3;
      const result = sql`${a} + ${b} + ${c}`;
      expect(result.templateSqlQuery.length).toBe(
        result.sqlParameters.length + 1,
      );
    });
  });

  describe("nested SQLDefinition interpolation", () => {
    it("flattens nested sql template into parent parts and parameters", () => {
      const inner = sql`user_id = ${5}`;
      const outer = sql`SELECT * FROM users WHERE ${inner}`;

      // The builder concatenates adjacent string parts, so the first part of the
      // inner sub-query ("user_id = ") is appended to "SELECT * FROM users WHERE "
      // before the parameter causes a split. Result: ["SELECT * FROM users WHERE user_id = ", ""]
      expect(outer.templateSqlQuery).toEqual([
        "SELECT * FROM users WHERE user_id = ",
        "",
      ]);
      expect(outer.sqlParameters).toEqual([5]);
    });

    it("flattens doubly-nested sql templates", () => {
      const deep = sql`id = ${99}`;
      const mid = sql`WHERE ${deep}`;
      const outer = sql`SELECT * FROM t ${mid}`;

      expect(outer.sqlParameters).toEqual([99]);
      expect(outer.templateSqlQuery.length).toBe(
        outer.sqlParameters.length + 1,
      );
    });
  });

  describe("null parameter", () => {
    it("accepts null as a valid SQL parameter", () => {
      const result = sql`SELECT ${null}`;
      expect(result.sqlParameters).toEqual([null]);
    });

    it("rejects undefined as a SQL parameter", () => {
      expect(() => sql`SELECT ${undefined as unknown as number}`).toThrow();
    });
  });

  describe("parameter types", () => {
    it("accepts a Date as a valid SQL parameter", () => {
      const d = new Date("2024-01-01");
      const result = sql`SELECT ${d}`;
      expect(result.sqlParameters).toEqual([d]);
    });
  });
});
