import { describe, test, expect } from "bun:test";
import { ConsistencyMap } from "../../src/redaction/consistency-map.ts";
import { DeepRedactStrategy } from "../../src/redaction/strategies/deep-redact.ts";
import { FreeTextStrategy } from "../../src/redaction/strategies/free-text.ts";
import { NameStrategy } from "../../src/redaction/strategies/name.ts";
import { EmailStrategy } from "../../src/redaction/strategies/email.ts";
import { SSNStrategy } from "../../src/redaction/strategies/ssn.ts";
import { PhoneStrategy } from "../../src/redaction/strategies/phone.ts";
import { IdentifierStrategy } from "../../src/redaction/strategies/identifier.ts";
import type { RedactionContext } from "../../src/redaction/strategies/strategy.ts";

function makeContext(overrides?: Partial<RedactionContext>): RedactionContext {
  return {
    tableName: "public.test",
    columnName: "test_col",
    dataType: "jsonb",
    consistencyMap: new ConsistencyMap(),
    ...overrides,
  };
}

describe("DeepRedactStrategy — JSONB objects", () => {
  const deepFreeText = new DeepRedactStrategy(new FreeTextStrategy());
  const deepName = new DeepRedactStrategy(new NameStrategy());
  const deepEmail = new DeepRedactStrategy(new EmailStrategy());
  const deepSSN = new DeepRedactStrategy(new SSNStrategy());

  test("redacts PHI inside a flat JSONB object", () => {
    const input = {
      note: "Patient SSN is 123-45-6789",
      code: "A100",
    };
    const result = deepFreeText.redact(input, makeContext()) as Record<string, unknown>;
    expect(result.note).toContain("XXX-XX-XXXX");
    expect(result.note).not.toContain("123-45-6789");
    expect(result.code).toBe("A100"); // no PHI pattern, unchanged
  });

  test("redacts PHI inside nested JSONB objects", () => {
    const input = {
      patient: {
        contact: {
          email: "john@hospital.com",
          phone: "555-123-4567",
        },
        notes: "Referred by Dr. Smith at https://clinic.org/ref",
      },
      meta: { version: 2 },
    };
    const result = deepFreeText.redact(input, makeContext()) as any;
    expect(result.patient.contact.email).toBe("[EMAIL REDACTED]");
    expect(result.patient.notes).toContain("[URL REDACTED]");
    expect(result.meta.version).toBe(2); // number, untouched
  });

  test("redacts JSONB arrays of strings", () => {
    const input = {
      emails: ["alice@example.com", "bob@hospital.org"],
      tags: ["urgent", "follow-up"],
    };
    const result = deepFreeText.redact(input, makeContext()) as any;
    expect(result.emails[0]).toBe("[EMAIL REDACTED]");
    expect(result.emails[1]).toBe("[EMAIL REDACTED]");
    expect(result.tags[0]).toBe("urgent"); // not PHI
    expect(result.tags[1]).toBe("follow-up");
  });

  test("redacts top-level JSONB array", () => {
    const input = ["123-45-6789", "987-65-4321"];
    const result = deepFreeText.redact(input, makeContext()) as string[];
    expect(result[0]).toBe("XXX-XX-XXXX");
    expect(result[1]).toBe("XXX-XX-XXXX");
  });

  test("handles name strategy on JSONB object", () => {
    const input = {
      primary: "John Smith",
      emergency: "Jane Doe",
    };
    const result = deepName.redact(input, makeContext()) as Record<string, unknown>;
    expect(result.primary).not.toBe("John Smith");
    expect(result.emergency).not.toBe("Jane Doe");
    // Both should be two-word names
    expect((result.primary as string).split(" ").length).toBe(2);
    expect((result.emergency as string).split(" ").length).toBe(2);
  });

  test("handles email strategy on JSONB array", () => {
    const input = ["admin@hospital.com", "nurse@clinic.org"];
    const result = deepEmail.redact(input, makeContext()) as string[];
    expect(result[0]).toContain("@example.com");
    expect(result[1]).toContain("@example.com");
  });

  test("preserves null values inside JSONB", () => {
    const input = { name: "John", middle: null, suffix: undefined };
    const result = deepName.redact(input, makeContext()) as Record<string, unknown>;
    expect(result.name).not.toBe("John");
    expect(result.middle).toBeNull();
    // undefined becomes undefined in iteration
  });

  test("preserves boolean and numeric values in JSONB", () => {
    const input = {
      active: true,
      score: 42,
      ratio: 3.14,
      name: "Sensitive Name",
    };
    const result = deepName.redact(input, makeContext()) as any;
    expect(result.active).toBe(true);
    expect(result.score).toBe(42);
    expect(result.ratio).toBe(3.14);
    expect(result.name).not.toBe("Sensitive Name");
  });

  test("handles deeply nested JSONB (3+ levels)", () => {
    const input = {
      level1: {
        level2: {
          level3: {
            ssn: "Patient SSN: 111-22-3333",
          },
        },
      },
    };
    const result = deepFreeText.redact(input, makeContext()) as any;
    expect(result.level1.level2.level3.ssn).toContain("XXX-XX-XXXX");
    expect(result.level1.level2.level3.ssn).not.toContain("111-22-3333");
  });

  test("handles mixed arrays (objects + scalars)", () => {
    const input = [
      { note: "Call 555-111-2222" },
      "plain text",
      42,
      null,
    ];
    const result = deepFreeText.redact(input, makeContext()) as any[];
    expect(result[0].note).toContain("(XXX) XXX-XXXX");
    expect(result[1]).toBe("plain text");
    expect(result[2]).toBe(42);
    expect(result[3]).toBeNull();
  });
});

describe("DeepRedactStrategy — serialized JSON strings", () => {
  const deepFreeText = new DeepRedactStrategy(new FreeTextStrategy());
  const deepName = new DeepRedactStrategy(new NameStrategy());

  test("detects and redacts serialized JSON object strings", () => {
    const inner = { note: "SSN is 123-45-6789", code: "ABC" };
    const input = JSON.stringify(inner);
    const result = deepFreeText.redact(input, makeContext()) as string;
    // Result should be a re-serialized JSON string
    const parsed = JSON.parse(result);
    expect(parsed.note).toContain("XXX-XX-XXXX");
    expect(parsed.code).toBe("ABC");
  });

  test("detects and redacts serialized JSON array strings", () => {
    const input = JSON.stringify(["alice@test.com", "bob@test.com"]);
    const result = deepFreeText.redact(input, makeContext()) as string;
    const parsed = JSON.parse(result);
    expect(parsed[0]).toBe("[EMAIL REDACTED]");
    expect(parsed[1]).toBe("[EMAIL REDACTED]");
  });

  test("handles nested serialized JSON (JSON within JSON)", () => {
    const inner = JSON.stringify({ name: "John Smith" });
    const outer = JSON.stringify({ data: inner, type: "patient" });
    const result = deepName.redact(outer, makeContext()) as string;
    const parsed = JSON.parse(result);
    // The inner serialized string should also be redacted
    const innerParsed = JSON.parse(parsed.data);
    expect(innerParsed.name).not.toBe("John Smith");
    expect(parsed.type).not.toBe("patient"); // single word gets name-redacted too
  });

  test("leaves non-JSON strings as plain strings", () => {
    const input = "This is just regular text, not JSON";
    const result = deepFreeText.redact(input, makeContext()) as string;
    expect(result).toBe("This is just regular text, not JSON");
  });

  test("handles serialized JSON with pretty printing", () => {
    const inner = { email: "patient@clinic.com", id: 42 };
    // Not valid to detect with leading whitespace before {
    // but the trim handles it
    const input = "  " + JSON.stringify(inner, null, 2) + "  ";
    const result = deepFreeText.redact(input, makeContext()) as string;
    const parsed = JSON.parse(result);
    expect(parsed.email).toBe("[EMAIL REDACTED]");
    expect(parsed.id).toBe(42);
  });

  test("does not parse strings that look like JSON but aren't", () => {
    const input = "{not actually json{{{";
    const result = deepFreeText.redact(input, makeContext()) as string;
    // Should fall through to inner strategy (free_text_scrub on plain string)
    expect(result).toBe("{not actually json{{{");
  });
});

describe("DeepRedactStrategy — PostgreSQL-realistic data shapes", () => {
  const deepFreeText = new DeepRedactStrategy(new FreeTextStrategy());
  const deepIdentifier = new DeepRedactStrategy(new IdentifierStrategy());

  test("JSONB with FHIR-like patient resource", () => {
    const fhirPatient = {
      resourceType: "Patient",
      id: "12345",
      name: [
        { family: "Simpson", given: ["Homer", "Jay"] },
      ],
      telecom: [
        { system: "phone", value: "555-123-4567" },
        { system: "email", value: "homer@springfield.com" },
      ],
      address: [
        {
          line: ["742 Evergreen Terrace"],
          city: "Springfield",
          state: "IL",
          postalCode: "62704",
        },
      ],
      birthDate: "1956-05-12",
    };
    const result = deepFreeText.redact(fhirPatient, makeContext()) as any;
    // Phone and email should be redacted
    expect(result.telecom[0].value).toContain("(XXX) XXX-XXXX");
    expect(result.telecom[1].value).toBe("[EMAIL REDACTED]");
    // resourceType should be unchanged (no PHI pattern)
    expect(result.resourceType).toBe("Patient");
  });

  test("JSONB with audit log containing embedded PHI", () => {
    const auditLog = {
      action: "UPDATE",
      timestamp: "2024-01-15T10:30:00Z",
      changes: {
        before: { email: "real.patient@hospital.com" },
        after: { email: "new.email@hospital.com" },
      },
      performedBy: "admin",
      ip: "192.168.1.100",
    };
    const result = deepFreeText.redact(auditLog, makeContext()) as any;
    expect(result.changes.before.email).toBe("[EMAIL REDACTED]");
    expect(result.changes.after.email).toBe("[EMAIL REDACTED]");
    expect(result.ip).toBe("X.X.X.X");
    expect(result.action).toBe("UPDATE");
    expect(result.performedBy).toBe("admin");
  });

  test("JSONB array of identifiers (like multi-valued MRNs)", () => {
    const input = ["MRN-001234", "MRN-005678", "MRN-009012"];
    const result = deepIdentifier.redact(input, makeContext()) as string[];
    expect(result.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(result[i]).not.toBe(input[i]);
      // Format should be preserved: XXX-XXXXXX
      expect(result[i]).toMatch(/^...-......$/);
    }
  });

  test("empty JSONB object", () => {
    const result = deepFreeText.redact({}, makeContext());
    expect(result).toEqual({});
  });

  test("empty JSONB array", () => {
    const result = deepFreeText.redact([], makeContext());
    expect(result).toEqual([]);
  });

  test("JSONB with Date objects (edge case — PG can return these)", () => {
    const input = { createdAt: new Date("2024-01-15"), note: "Call 555-111-2222" };
    const result = deepFreeText.redact(input, makeContext()) as any;
    // Date objects should pass through unchanged
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.note).toContain("(XXX) XXX-XXXX");
  });

  test("JSONB with Buffer (binary data)", () => {
    const input = { photo: Buffer.from("binarydata"), label: "Patient photo" };
    const result = deepFreeText.redact(input, makeContext()) as any;
    // Buffer should pass through unchanged
    expect(Buffer.isBuffer(result.photo)).toBe(true);
    expect(result.label).toBe("Patient photo");
  });
});
