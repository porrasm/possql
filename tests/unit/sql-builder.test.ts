/* eslint-disable @typescript-eslint/no-extraneous-class */
import { describe, it, expect } from "vitest";
import {
  combineQueryAndParameters,
  sql,
  sqlUnchecked,
  unsafeParam,
} from "../../src/database/sql/sql-builder";
import type { SQLDefinition } from "../../src/database/types";
import { PiquelErrorCode } from "../../src/errors";

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

  describe("generateSqlDefinition string branch", () => {
    it("accepts a plain string as template query (coerced call)", () => {
      const fn = sql as unknown as (q: string) => SQLDefinition;
      const def = fn("SELECT 1");
      expect(def.templateSqlQuery).toEqual(["SELECT 1"]);
      expect(def.sqlParameters).toEqual([]);
    });
  });

  describe("invalid template query parse", () => {
    it("throws when the first argument is not a valid template query", () => {
      const fn = sql as unknown as (q: unknown) => SQLDefinition;
      expect(() => fn(123)).toThrow(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          issues: expect.arrayContaining([
            expect.objectContaining({ message: "Invalid template query" }),
          ]),
        }),
      );
    });
  });

  describe("combineQueryAndParameters mismatch", () => {
    it("throws when template parts and parameter counts do not match", () => {
      const fn = sql as unknown as (
        parts: TemplateStringsArray,
        ...params: unknown[]
      ) => SQLDefinition;
      const onePart = Object.assign(["only"], {
        raw: ["only"],
      }) as TemplateStringsArray;
      expect(() => fn(onePart, 1)).toThrow(
        expect.objectContaining({
          code: PiquelErrorCode.SQL_PARAMETER_COUNT_MISMATCH,
        }),
      );
    });
  });

  describe("nested SQLDefinition edge cases", () => {
    it("throws UNDEFINED_SQL_PARAMETER when a nested definition has undefined in sqlParameters", () => {
      const nested: SQLDefinition = {
        templateSqlQuery: ["x", ""],
        sqlParameters: [undefined],
      };
      expect(() => sql`outer ${nested}`).toThrow(
        expect.objectContaining({
          code: PiquelErrorCode.UNDEFINED_SQL_PARAMETER,
        }),
      );
    });

    it("throws TEMPLATE_SQL_UNDEFINED when a template part is undefined (test helper bypasses Zod)", () => {
      const parts = ["a", undefined] as unknown as string[];
      expect(() => combineQueryAndParameters(parts, [1])).toThrow(
        expect.objectContaining({
          code: PiquelErrorCode.TEMPLATE_SQL_UNDEFINED,
        }),
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

    it("accepts Date[] as a valid SQL parameter", () => {
      const dates = [new Date("2024-01-01"), new Date("2024-06-15")];
      const result = sql`SELECT ${dates}`;
      expect(result.sqlParameters).toEqual([dates]);
    });

    it("accepts bigint as a valid SQL parameter", () => {
      const id = 9007199254740993n;
      const result = sql`SELECT ${id}`;
      expect(result.sqlParameters).toEqual([id]);
    });

    it("accepts Uint8Array as a valid SQL parameter", () => {
      const buf = new Uint8Array([1, 2, 3]);
      const result = sql`SELECT ${buf}`;
      expect(result.sqlParameters).toEqual([buf]);
    });

    it("accepts Buffer (extends Uint8Array) as a valid SQL parameter", () => {
      const buf = Buffer.from("hello");
      const result = sql`SELECT ${buf}`;
      expect(result.sqlParameters).toEqual([buf]);
    });

    it("throws for a plain object with prototype (custom class instance)", () => {
      class Custom {}
      const obj = new Custom();
      expect(() => sql`SELECT ${obj as unknown as number}`).toThrow();
    });

    it("unsafeParam allows any value through", () => {
      class Custom {
        public x = 42;
      }
      const obj = new Custom();
      const result = sql`SELECT ${unsafeParam(obj)}`;
      expect(result.sqlParameters[0]).toBe(obj);
    });

    it("unsafeParam stores a function without validation", () => {
      const fn = () => "noop";
      const result = sql`SELECT ${unsafeParam(fn)}`;
      expect(result.sqlParameters[0]).toBe(fn);
    });

    it("mixes standard and unsafeParam in same query", () => {
      class Custom {}
      const obj = new Custom();
      const result = sql`SELECT ${42}, ${unsafeParam(obj)}`;
      expect(result.sqlParameters).toHaveLength(2);
      expect(result.sqlParameters[0]).toBe(42);
      expect(result.sqlParameters[1]).toBe(obj);
    });
  });

  describe("sqlUnchecked", () => {
    it("accepts a custom class instance without wrapping", () => {
      class Custom {
        public x = 1;
      }
      const obj = new Custom();
      const result = sqlUnchecked`SELECT ${obj}`;
      expect(result.sqlParameters[0]).toBe(obj);
    });

    it("accepts a function without validation", () => {
      const fn = () => "noop";
      const result = sqlUnchecked`SELECT ${fn}`;
      expect(result.sqlParameters[0]).toBe(fn);
    });

    it("does not double-wrap an already-wrapped UnsafeParam", () => {
      class Custom {}
      const obj = new Custom();
      const wrapped = unsafeParam(obj);
      const result = sqlUnchecked`SELECT ${wrapped}`;
      // The stored value should be the original object, not the UnsafeParam wrapper
      expect(result.sqlParameters[0]).toBe(obj);
    });

    it("stores standard types as-is", () => {
      const result = sqlUnchecked`SELECT ${42}, ${"hello"}, ${true}`;
      expect(result.sqlParameters).toEqual([42, "hello", true]);
    });

    it("produces correct template parts and parameter count", () => {
      const result = sqlUnchecked`SELECT ${1}, ${2}`;
      expect(result.templateSqlQuery).toHaveLength(3);
      expect(result.sqlParameters).toHaveLength(2);
    });
  });
});
