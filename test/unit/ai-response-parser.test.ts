import { describe, test, expect } from "bun:test";
import { parseClassificationResponse } from "../../src/ai/response-parser.ts";

const VALID_RESPONSE = JSON.stringify({
  tables: [
    {
      schema: "public",
      name: "patients",
      columns: [
        {
          name: "first_name",
          phiType: "name",
          confidence: 0.95,
          reasoning: "Contains patient first names",
          suggestedStrategy: "faker_name",
        },
        {
          name: "id",
          phiType: null,
          confidence: 0.99,
          reasoning: "Auto-increment primary key, not PHI",
          suggestedStrategy: "none",
        },
        {
          name: "ssn",
          phiType: "ssn",
          confidence: 0.99,
          reasoning: "Social security number column",
          suggestedStrategy: "format_preserve_ssn",
        },
      ],
    },
  ],
});

describe("AI response parser", () => {
  test("parses valid JSON response", () => {
    const result = parseClassificationResponse(VALID_RESPONSE);
    expect(result.tables.length).toBe(1);
    expect(result.tables[0]!.columns.length).toBe(3);
    expect(result.tables[0]!.columns[0]!.phiType).toBe("name");
    expect(result.tables[0]!.columns[1]!.phiType).toBeNull();
  });

  test("strips markdown code fences", () => {
    const wrapped = "```json\n" + VALID_RESPONSE + "\n```";
    const result = parseClassificationResponse(wrapped);
    expect(result.tables.length).toBe(1);
  });

  test("strips plain code fences", () => {
    const wrapped = "```\n" + VALID_RESPONSE + "\n```";
    const result = parseClassificationResponse(wrapped);
    expect(result.tables.length).toBe(1);
  });

  test("throws on invalid JSON", () => {
    expect(() => parseClassificationResponse("not json")).toThrow("not valid JSON");
  });

  test("throws on wrong schema structure", () => {
    expect(() =>
      parseClassificationResponse(JSON.stringify({ wrong: "structure" })),
    ).toThrow("does not match expected schema");
  });

  test("throws on invalid PHI type", () => {
    const bad = JSON.stringify({
      tables: [{
        schema: "public",
        name: "test",
        columns: [{
          name: "col",
          phiType: "invalid_type",
          confidence: 0.9,
          reasoning: "test",
          suggestedStrategy: "none",
        }],
      }],
    });
    expect(() => parseClassificationResponse(bad)).toThrow();
  });

  test("validates confidence range", () => {
    const bad = JSON.stringify({
      tables: [{
        schema: "public",
        name: "test",
        columns: [{
          name: "col",
          phiType: "name",
          confidence: 1.5,
          reasoning: "test",
          suggestedStrategy: "faker_name",
        }],
      }],
    });
    expect(() => parseClassificationResponse(bad)).toThrow();
  });
});
