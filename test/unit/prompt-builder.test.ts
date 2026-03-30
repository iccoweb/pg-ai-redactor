import { describe, test, expect } from "bun:test";
import { buildClassificationPrompt } from "../../src/ai/prompt-builder.ts";
import type { ClassificationRequest } from "../../src/ai/types.ts";

describe("prompt builder", () => {
  const request: ClassificationRequest = {
    tables: [
      {
        schema: "public",
        name: "patients",
        columns: [
          { name: "id", dataType: "integer", maxLength: null, isNullable: false, defaultValue: "nextval('patients_id_seq')", isPrimaryKey: true, isForeignKey: false, foreignKeyRef: null },
          { name: "first_name", dataType: "varchar", maxLength: 100, isNullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false, foreignKeyRef: null },
          { name: "ssn", dataType: "varchar", maxLength: 11, isNullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false, foreignKeyRef: null },
        ],
        sampleRows: [
          { first_name: "John", ssn: "123-45-6789" },
          { first_name: "Jane", ssn: "987-65-4321" },
        ],
      },
    ],
  };

  test("includes HIPAA Safe Harbor categories", () => {
    const prompt = buildClassificationPrompt(request);
    expect(prompt).toContain("Safe Harbor");
    expect(prompt).toContain("(A) Names");
    expect(prompt).toContain("(G) Social Security numbers");
    expect(prompt).toContain("(R) Any other unique");
  });

  test("includes table and column info", () => {
    const prompt = buildClassificationPrompt(request);
    expect(prompt).toContain("public.patients");
    expect(prompt).toContain("first_name (varchar(100))");
    expect(prompt).toContain("[PK]");
  });

  test("includes sample data", () => {
    const prompt = buildClassificationPrompt(request);
    expect(prompt).toContain("first_name: John");
    expect(prompt).toContain("ssn: 123-45-6789");
  });

  test("truncates long sample values", () => {
    const longRequest: ClassificationRequest = {
      tables: [{
        schema: "public",
        name: "notes",
        columns: [
          { name: "body", dataType: "text", maxLength: null, isNullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false, foreignKeyRef: null },
        ],
        sampleRows: [{ body: "A".repeat(500) }],
      }],
    };
    const prompt = buildClassificationPrompt(longRequest);
    expect(prompt).toContain("...");
    expect(prompt).not.toContain("A".repeat(500));
  });

  test("requests JSON response format", () => {
    const prompt = buildClassificationPrompt(request);
    expect(prompt).toContain("valid JSON");
    expect(prompt).toContain('"phiType"');
  });
});
