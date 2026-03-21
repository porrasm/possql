import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createOperation, prepareOperation } from "../../src/database/operations";
import { sql } from "../../src/database/sql/sql-builder";

const simpleSql = sql`SELECT 1`;
const userSchema = z.object({ user_id: z.number(), name: z.string() });

describe("createOperation", () => {
  it("returns a builder function", () => {
    const builder = createOperation(simpleSql, userSchema);
    expect(typeof builder).toBe("function");
  });

  it("builder returns an object with args, validator, and prepareSql", () => {
    const builder = createOperation(simpleSql, userSchema);
    const result = builder({ some: "args" });
    expect(result).toHaveProperty("args", { some: "args" });
    expect(result).toHaveProperty("validator", userSchema);
    expect(typeof result.prepareSql).toBe("function");
  });

  it("prepareSql from static SQLDefinition always returns that definition", () => {
    const builder = createOperation(simpleSql, userSchema);
    const op = builder({});
    expect(op.prepareSql({})).toEqual(simpleSql);
  });

  it("accepts a function as SQL preparer", () => {
    const preparer = (args: { id: number }) => sql`SELECT * FROM users WHERE user_id = ${args.id}`;
    const builder = createOperation(preparer, userSchema);
    const op = builder({ id: 7 });
    const prepared = op.prepareSql({ id: 7 });
    expect(prepared.sqlParameters).toEqual([7]);
  });
});

describe("prepareOperation", () => {
  describe("two-argument overload [SQLDefinition, validator]", () => {
    it("returns sql and the provided validator", () => {
      const result = prepareOperation(simpleSql, userSchema);
      expect(result.sql).toEqual(simpleSql);
      expect(result.validator).toBe(userSchema);
    });
  });

  describe("one-argument overload with SQLDefinition (no validator)", () => {
    it("returns sql and z.any() validator", () => {
      const result = prepareOperation(simpleSql);
      expect(result.sql).toEqual(simpleSql);
      // z.any() accepts anything
      expect(result.validator.parse("anything")).toBe("anything");
      expect(result.validator.parse(42)).toBe(42);
    });
  });

  describe("one-argument overload with PreparedOperation", () => {
    it("calls prepareSql and returns the result with the operation's validator", () => {
      const preparer = (args: { id: number }) => sql`SELECT * FROM users WHERE user_id = ${args.id}`;
      const builder = createOperation(preparer, userSchema);
      const op = builder({ id: 42 });

      const result = prepareOperation(op);
      expect(result.sql.sqlParameters).toEqual([42]);
      expect(result.validator).toBe(userSchema);
    });
  });
});
