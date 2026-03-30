import { describe, test, expect } from "bun:test";
import { computeSchemaFingerprint } from "../../src/analysis/fingerprint.ts";
import type { TableInfo, ColumnInfo } from "../../src/db/types.ts";

const baseTables: TableInfo[] = [
  { schema: "public", name: "patients", fullName: "public.patients", rowCount: 100 },
  { schema: "public", name: "visits", fullName: "public.visits", rowCount: 50 },
];

const baseColumns = new Map<string, ColumnInfo[]>([
  ["public.patients", [
    { name: "id", dataType: "integer", maxLength: null, isNullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false, foreignKeyRef: null },
    { name: "name", dataType: "varchar", maxLength: 255, isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, foreignKeyRef: null },
  ]],
  ["public.visits", [
    { name: "id", dataType: "integer", maxLength: null, isNullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false, foreignKeyRef: null },
    { name: "patient_id", dataType: "integer", maxLength: null, isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: true, foreignKeyRef: { table: "public.patients", column: "id" } },
  ]],
]);

describe("schema fingerprinting", () => {
  test("same schema produces same fingerprint", () => {
    const f1 = computeSchemaFingerprint(baseTables, baseColumns, [], [], []);
    const f2 = computeSchemaFingerprint(baseTables, baseColumns, [], [], []);
    expect(f1).toBe(f2);
  });

  test("different tables produce different fingerprint", () => {
    const f1 = computeSchemaFingerprint(baseTables, baseColumns, [], [], []);
    const altTables = [...baseTables, { schema: "public", name: "new_table", fullName: "public.new_table", rowCount: 10 }];
    const f2 = computeSchemaFingerprint(altTables, baseColumns, [], [], []);
    expect(f1).not.toBe(f2);
  });

  test("adding a column changes fingerprint", () => {
    const f1 = computeSchemaFingerprint(baseTables, baseColumns, [], [], []);
    const altColumns = new Map(baseColumns);
    altColumns.set("public.patients", [
      ...baseColumns.get("public.patients")!,
      { name: "email", dataType: "varchar", maxLength: 255, isNullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false, foreignKeyRef: null },
    ]);
    const f2 = computeSchemaFingerprint(baseTables, altColumns, [], [], []);
    expect(f1).not.toBe(f2);
  });

  test("allowlist changes fingerprint", () => {
    const f1 = computeSchemaFingerprint(baseTables, baseColumns, [], [], []);
    const f2 = computeSchemaFingerprint(baseTables, baseColumns, ["public.audit"], [], []);
    expect(f1).not.toBe(f2);
  });

  test("denylist changes fingerprint", () => {
    const f1 = computeSchemaFingerprint(baseTables, baseColumns, [], [], []);
    const f2 = computeSchemaFingerprint(baseTables, baseColumns, [], [], [
      { table: "public.notes", column: "body", phiType: "free_text" },
    ]);
    expect(f1).not.toBe(f2);
  });

  test("table order doesn't matter", () => {
    const reversed = [...baseTables].reverse();
    const f1 = computeSchemaFingerprint(baseTables, baseColumns, [], [], []);
    const f2 = computeSchemaFingerprint(reversed, baseColumns, [], [], []);
    expect(f1).toBe(f2);
  });

  test("fingerprint is a 64-char hex string", () => {
    const f = computeSchemaFingerprint(baseTables, baseColumns, [], [], []);
    expect(f).toMatch(/^[a-f0-9]{64}$/);
  });
});
