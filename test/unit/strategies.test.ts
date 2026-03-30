import { describe, test, expect } from "bun:test";
import { ConsistencyMap } from "../../src/redaction/consistency-map.ts";
import { NameStrategy } from "../../src/redaction/strategies/name.ts";
import { AddressStrategy } from "../../src/redaction/strategies/address.ts";
import { DateStrategy } from "../../src/redaction/strategies/date.ts";
import { PhoneStrategy } from "../../src/redaction/strategies/phone.ts";
import { EmailStrategy } from "../../src/redaction/strategies/email.ts";
import { SSNStrategy } from "../../src/redaction/strategies/ssn.ts";
import { IdentifierStrategy } from "../../src/redaction/strategies/identifier.ts";
import { IPAddressStrategy } from "../../src/redaction/strategies/ip-address.ts";
import { URLStrategy } from "../../src/redaction/strategies/url.ts";
import { NullReplaceStrategy } from "../../src/redaction/strategies/null-replace.ts";
import { FreeTextStrategy } from "../../src/redaction/strategies/free-text.ts";
import type { RedactionContext } from "../../src/redaction/strategies/strategy.ts";

function makeContext(overrides?: Partial<RedactionContext>): RedactionContext {
  return {
    tableName: "public.test",
    columnName: "test_col",
    dataType: "varchar",
    consistencyMap: new ConsistencyMap(),
    ...overrides,
  };
}

describe("ConsistencyMap", () => {
  test("returns same value for same key", () => {
    const map = new ConsistencyMap();
    let callCount = 0;
    const gen = () => { callCount++; return "fake"; };
    const v1 = map.getOrSet("strategy", "original", gen);
    const v2 = map.getOrSet("strategy", "original", gen);
    expect(v1).toBe(v2);
    expect(callCount).toBe(1);
  });

  test("different keys produce different calls", () => {
    const map = new ConsistencyMap();
    let callCount = 0;
    const gen = () => `fake-${++callCount}`;
    map.getOrSet("s", "a", gen);
    map.getOrSet("s", "b", gen);
    expect(map.size).toBe(2);
    expect(callCount).toBe(2);
  });
});

describe("NameStrategy", () => {
  const strategy = new NameStrategy();

  test("returns null for null input", () => {
    expect(strategy.redact(null, makeContext())).toBeNull();
  });

  test("generates a fake name", () => {
    const result = strategy.redact("John Smith", makeContext());
    expect(typeof result).toBe("string");
    expect(result).not.toBe("John Smith");
    expect((result as string).split(" ").length).toBe(2);
  });

  test("consistency: same input produces same output", () => {
    const ctx = makeContext();
    const r1 = strategy.redact("Jane Doe", ctx);
    const r2 = strategy.redact("Jane Doe", ctx);
    expect(r1).toBe(r2);
  });

  test("handles Last, First format", () => {
    const result = strategy.redact("Doe, John", makeContext()) as string;
    expect(result).toContain(",");
  });
});

describe("AddressStrategy", () => {
  const strategy = new AddressStrategy();

  test("redacts ZIP codes preserving format", () => {
    const result = strategy.redact("10001", makeContext({ columnName: "zip_code" })) as string;
    expect(result).toMatch(/^\d{5}$/);
    expect(result.startsWith("100")).toBe(true); // prefix preserved (pop > 20K)
  });

  test("city returns a string", () => {
    const result = strategy.redact("New York", makeContext({ columnName: "city" }));
    expect(typeof result).toBe("string");
    expect(result).not.toBe("New York");
  });
});

describe("DateStrategy", () => {
  const strategy = new DateStrategy();

  test("shifts dates preserving ISO format", () => {
    const result = strategy.redact("2020-06-15", makeContext()) as string;
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).not.toBe("2020-06-15");
  });

  test("shifts dates preserving US format", () => {
    const result = strategy.redact("06/15/2020", makeContext()) as string;
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  test("aggregates ages over 89 to 90", () => {
    // A date more than 89 years ago
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 95);
    const input = oldDate.toISOString().split("T")[0];
    const result = strategy.redact(input, makeContext()) as string;
    const resultDate = new Date(result!);
    const ageYears = (Date.now() - resultDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    expect(ageYears).toBeCloseTo(90, 0);
  });

  test("returns null for null input", () => {
    expect(strategy.redact(null, makeContext())).toBeNull();
  });
});

describe("PhoneStrategy", () => {
  const strategy = new PhoneStrategy();

  test("preserves phone format (XXX) XXX-XXXX", () => {
    const result = strategy.redact("(555) 123-4567", makeContext()) as string;
    expect(result).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
    expect(result).not.toBe("(555) 123-4567");
  });

  test("preserves format XXX-XXX-XXXX", () => {
    const result = strategy.redact("555-123-4567", makeContext()) as string;
    expect(result).toMatch(/^\d{3}-\d{3}-\d{4}$/);
  });
});

describe("EmailStrategy", () => {
  const strategy = new EmailStrategy();

  test("generates a valid-looking email", () => {
    const result = strategy.redact("john.doe@hospital.com", makeContext()) as string;
    expect(result).toContain("@example.com");
    expect(result).not.toBe("john.doe@hospital.com");
  });
});

describe("SSNStrategy", () => {
  const strategy = new SSNStrategy();

  test("preserves XXX-XX-XXXX format", () => {
    const result = strategy.redact("123-45-6789", makeContext()) as string;
    expect(result).toMatch(/^\d{3}-\d{2}-\d{4}$/);
    expect(result).not.toBe("123-45-6789");
    // Validate area number rules
    const area = parseInt(result.split("-")[0]!);
    expect(area).not.toBe(0);
    expect(area).not.toBe(666);
    expect(area).toBeLessThan(900);
  });

  test("preserves unformatted 9-digit format", () => {
    const result = strategy.redact("123456789", makeContext()) as string;
    expect(result).toMatch(/^\d{9}$/);
  });
});

describe("IdentifierStrategy", () => {
  const strategy = new IdentifierStrategy();

  test("preserves numeric ID length", () => {
    const result = strategy.redact("12345678", makeContext()) as string;
    expect(result).toMatch(/^\d{8}$/);
    expect(result).not.toBe("12345678");
  });

  test("deterministic: same input always gives same output", () => {
    const r1 = strategy.redact("MRN-001234", makeContext());
    const r2 = strategy.redact("MRN-001234", makeContext());
    expect(r1).toBe(r2);
  });

  test("preserves uppercase alphanumeric format", () => {
    const result = strategy.redact("ABC123", makeContext()) as string;
    expect(result).toMatch(/^[A-Z0-9]{6}$/);
  });
});

describe("IPAddressStrategy", () => {
  const strategy = new IPAddressStrategy();

  test("generates valid IPv4", () => {
    const result = strategy.redact("192.168.1.1", makeContext()) as string;
    const parts = result.split(".");
    expect(parts.length).toBe(4);
    for (const part of parts) {
      const num = parseInt(part);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThanOrEqual(255);
    }
  });

  test("generates IPv6 for IPv6 input", () => {
    const result = strategy.redact("2001:0db8:85a3::8a2e:0370:7334", makeContext()) as string;
    expect(result).toContain(":");
  });
});

describe("URLStrategy", () => {
  const strategy = new URLStrategy();

  test("redacts to example.com", () => {
    const result = strategy.redact("https://hospital.org/patients/123", makeContext()) as string;
    expect(result).toContain("example.com");
    expect(result).not.toContain("hospital.org");
  });
});

describe("NullReplaceStrategy", () => {
  const strategy = new NullReplaceStrategy();

  test("always returns null", () => {
    expect(strategy.redact("anything", makeContext())).toBeNull();
    expect(strategy.redact(Buffer.from("binary"), makeContext())).toBeNull();
  });
});

describe("FreeTextStrategy", () => {
  const strategy = new FreeTextStrategy();

  test("scrubs SSNs from text", () => {
    const result = strategy.redact(
      "Patient SSN is 123-45-6789 in our records",
      makeContext(),
    ) as string;
    expect(result).not.toContain("123-45-6789");
    expect(result).toContain("XXX-XX-XXXX");
  });

  test("scrubs phone numbers from text", () => {
    const result = strategy.redact(
      "Call patient at (555) 123-4567",
      makeContext(),
    ) as string;
    expect(result).not.toContain("(555) 123-4567");
  });

  test("scrubs emails from text", () => {
    const result = strategy.redact(
      "Contact: john.doe@hospital.com for details",
      makeContext(),
    ) as string;
    expect(result).toContain("[EMAIL REDACTED]");
  });

  test("scrubs URLs from text", () => {
    const result = strategy.redact(
      "See https://portal.hospital.org/patient/123",
      makeContext(),
    ) as string;
    expect(result).toContain("[URL REDACTED]");
  });

  test("scrubs dates from text", () => {
    const result = strategy.redact(
      "Admitted on 01/15/2024 and discharged",
      makeContext(),
    ) as string;
    expect(result).toContain("[DATE REDACTED]");
  });

  test("preserves non-PHI text", () => {
    const result = strategy.redact(
      "Normal blood pressure reading was 120/80",
      makeContext(),
    ) as string;
    expect(result).toBe("Normal blood pressure reading was 120/80");
  });
});
