import { describe, test, expect, beforeEach } from "bun:test";
import { executeRedaction } from "../../src/redaction/engine.ts";
import { buildRedactionPlan } from "../../src/redaction/plan.ts";
import type { DatabaseAdapter } from "../../src/db/adapter.ts";
import type { TableInfo, ColumnInfo, BatchUpdate, DatabaseConfig, Transaction } from "../../src/db/types.ts";
import type { ClassificationResponse } from "../../src/ai/types.ts";
import type { AppConfig } from "../../src/config/schema.ts";

// ─── Mock Database Adapter ──────────────────────────────────────────────────

type Row = Record<string, unknown>;

class MockDatabaseAdapter implements DatabaseAdapter {
  tables: Map<string, Row[]> = new Map();
  appliedUpdates: Array<{ table: string; updates: BatchUpdate }> = [];
  committed = 0;
  rolledBack = 0;

  async connect(_config: DatabaseConfig): Promise<void> {}
  async disconnect(): Promise<void> {}

  async getTables(): Promise<TableInfo[]> {
    return [...this.tables.keys()].map((name) => ({
      schema: "public",
      name,
      fullName: `public.${name}`,
      rowCount: this.tables.get(name)!.length,
    }));
  }

  async getColumns(_tableName: string, _schema?: string): Promise<ColumnInfo[]> {
    return []; // Not needed for engine tests
  }

  async getSampleRows(
    tableName: string,
    _columns: string[],
    limit: number,
    _schema?: string,
  ): Promise<Row[]> {
    return (this.tables.get(tableName) ?? []).slice(0, limit);
  }

  async getRowCount(tableName: string, _schema?: string): Promise<number> {
    return this.tables.get(tableName)?.length ?? 0;
  }

  async beginTransaction(): Promise<Transaction> {
    return { id: "mock-tx", _client: null };
  }

  async batchUpdate(
    _tx: Transaction,
    tableName: string,
    _schema: string,
    updates: BatchUpdate,
  ): Promise<number> {
    this.appliedUpdates.push({ table: tableName, updates });

    // Actually apply updates to the in-memory table
    const rows = this.tables.get(tableName) ?? [];
    for (const update of updates.updates) {
      const row = rows.find((r) => r[updates.primaryKeyColumn] === update.pk);
      if (row) {
        Object.assign(row, update.values);
      }
    }

    return updates.updates.length;
  }

  async commitTransaction(_tx: Transaction): Promise<void> {
    this.committed++;
  }

  async rollbackTransaction(_tx: Transaction): Promise<void> {
    this.rolledBack++;
  }

  async *streamRows(
    tableName: string,
    _columns: string[],
    _primaryKey: string,
    chunkSize: number,
    _schema?: string,
  ): AsyncIterable<Row[]> {
    const rows = this.tables.get(tableName) ?? [];
    for (let i = 0; i < rows.length; i += chunkSize) {
      yield rows.slice(i, i + chunkSize);
    }
  }
}

// ─── Test Config ────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    database: {
      type: "postgres",
      host: "localhost",
      port: 5432,
      database: "test",
      username: "test",
      password: "test",
    },
    ai: { provider: "openai", maxTokens: 4096, sampleRows: 10 },
    redaction: { chunkSize: 100, concurrency: 2, consistentMapping: true },
    allowlist: { tables: [], columns: [] },
    denylist: { columns: [] },
    overrides: [],
    cache: { directory: "/tmp/test-cache", enabled: false },
    audit: { enabled: false, outputPath: "/tmp/test-audit", format: "jsonl" as const },
    ...overrides,
  };
}

// ─── Test Data ──────────────────────────────────────────────────────────────

/** Realistic patient table with various column types */
const PATIENT_ROWS: Row[] = [
  {
    id: 1,
    first_name: "John",
    last_name: "Smith",
    email: "john.smith@hospital.com",
    ssn: "123-45-6789",
    phone: "(555) 123-4567",
    date_of_birth: "1985-03-15",
    ip_address: "192.168.1.100",
    mrn: "MRN-001234",
    // JSONB: contact info
    contact_info: {
      home_phone: "555-987-6543",
      work_email: "jsmith@work.com",
      emergency: { name: "Jane Smith", phone: "555-111-2222" },
    },
    // JSONB: array of addresses
    addresses: [
      { type: "home", street: "123 Main St", city: "Springfield", zip: "62704" },
      { type: "work", street: "456 Oak Ave", city: "Shelbyville", zip: "62705" },
    ],
    // Serialized JSON string (text column storing JSON)
    metadata_json: JSON.stringify({
      referral_source: "Dr. Johnson",
      insurance_id: "INS-98765",
      notes: "Patient called from 555-444-3333",
    }),
    // Free text clinical note
    clinical_notes: "Patient John Smith (SSN: 234-56-7890) presented on 01/15/2024. Contact: john@email.com. Referred by https://portal.hospital.org/patient/789. IP logged: 10.0.0.1",
    // Binary-like column
    photo_blob: null,
  },
  {
    id: 2,
    first_name: "Alice",
    last_name: "Johnson",
    email: "alice.j@clinic.org",
    ssn: "987-65-4321",
    phone: "555.999.8888",
    date_of_birth: "1932-07-22", // age > 89 — should be aggregated
    ip_address: "2001:0db8:85a3::8a2e:0370:7334",
    mrn: "MRN-005678",
    contact_info: {
      home_phone: "555-222-3333",
      work_email: null,
      emergency: null,
    },
    addresses: [],
    metadata_json: JSON.stringify({ referral_source: null, insurance_id: "INS-11111" }),
    clinical_notes: null,
    photo_blob: null,
  },
];

const CLASSIFICATION: ClassificationResponse = {
  tables: [
    {
      schema: "public",
      name: "patients",
      columns: [
        { name: "id", phiType: null, confidence: 0.99, reasoning: "PK", suggestedStrategy: "none" },
        { name: "first_name", phiType: "name", confidence: 0.95, reasoning: "Patient first name", suggestedStrategy: "faker_name" },
        { name: "last_name", phiType: "name", confidence: 0.95, reasoning: "Patient last name", suggestedStrategy: "faker_name" },
        { name: "email", phiType: "email", confidence: 0.98, reasoning: "Email address", suggestedStrategy: "faker_email" },
        { name: "ssn", phiType: "ssn", confidence: 0.99, reasoning: "Social security number", suggestedStrategy: "format_preserve_ssn" },
        { name: "phone", phiType: "phone", confidence: 0.97, reasoning: "Phone number", suggestedStrategy: "format_preserve_phone" },
        { name: "date_of_birth", phiType: "date", confidence: 0.96, reasoning: "Birth date", suggestedStrategy: "date_shift" },
        { name: "ip_address", phiType: "ip_address", confidence: 0.95, reasoning: "IP address", suggestedStrategy: "ip_randomize" },
        { name: "mrn", phiType: "medical_record_number", confidence: 0.99, reasoning: "Medical record number", suggestedStrategy: "consistent_hash" },
        { name: "contact_info", phiType: "free_text", confidence: 0.90, reasoning: "JSONB with contact PHI", suggestedStrategy: "free_text_scrub" },
        { name: "addresses", phiType: "address", confidence: 0.85, reasoning: "JSONB addresses", suggestedStrategy: "free_text_scrub" },
        { name: "metadata_json", phiType: "free_text", confidence: 0.85, reasoning: "Serialized JSON with PHI", suggestedStrategy: "free_text_scrub" },
        { name: "clinical_notes", phiType: "free_text", confidence: 0.95, reasoning: "Clinical notes with embedded PHI", suggestedStrategy: "free_text_scrub" },
        { name: "photo_blob", phiType: "photograph", confidence: 0.90, reasoning: "Photo blob", suggestedStrategy: "null_replace" },
      ],
    },
  ],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Redaction engine — full pipeline with mixed data types", () => {
  let db: MockDatabaseAdapter;
  let config: AppConfig;

  beforeEach(() => {
    db = new MockDatabaseAdapter();
    // Deep-clone the patient rows so each test starts fresh
    db.tables.set("patients", JSON.parse(JSON.stringify(PATIENT_ROWS)));
    config = makeConfig();
  });

  function buildPlan() {
    return buildRedactionPlan(
      CLASSIFICATION,
      config,
      "test-fingerprint",
      new Map([["public.patients", "id"]]),
      new Map([["public.patients", PATIENT_ROWS.length]]),
    );
  }

  test("plan includes only PHI columns (not id)", () => {
    const plan = buildPlan();
    expect(plan.tables.length).toBe(1);
    const colNames = plan.tables[0]!.columns.map((c) => c.name);
    expect(colNames).not.toContain("id");
    expect(colNames).toContain("first_name");
    expect(colNames).toContain("ssn");
    expect(colNames).toContain("contact_info");
    expect(colNames).toContain("metadata_json");
    expect(colNames).toContain("clinical_notes");
  });

  test("executes redaction and returns summary", async () => {
    const plan = buildPlan();
    const summary = await executeRedaction(db, plan, config);

    expect(summary.tablesProcessed).toBe(1);
    expect(summary.rowsRedacted).toBe(2);
    expect(summary.errors).toHaveLength(0);
    expect(db.committed).toBeGreaterThan(0);
    expect(db.rolledBack).toBe(0);
  });

  test("redacts scalar string columns correctly", async () => {
    const plan = buildPlan();
    await executeRedaction(db, plan, config);

    const rows = db.tables.get("patients")!;
    const row1 = rows[0]!;
    const row2 = rows[1]!;

    // Names changed
    expect(row1.first_name).not.toBe("John");
    expect(row1.last_name).not.toBe("Smith");
    expect(typeof row1.first_name).toBe("string");

    // Emails redacted to example.com
    expect(row1.email).toContain("@example.com");
    expect(row1.email).not.toContain("hospital.com");

    // SSN format preserved
    expect(row1.ssn).toMatch(/^\d{3}-\d{2}-\d{4}$/);
    expect(row1.ssn).not.toBe("123-45-6789");

    // Phone format preserved
    const phone1 = row1.phone as string;
    expect(phone1).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
    expect(phone1).not.toBe("(555) 123-4567");

    // Dotted phone format preserved
    const phone2 = row2.phone as string;
    expect(phone2).toMatch(/^\d{3}\.\d{3}\.\d{4}$/);

    // MRN changed but format preserved
    expect(row1.mrn).not.toBe("MRN-001234");
    expect((row1.mrn as string).length).toBe("MRN-001234".length);
  });

  test("date shifting works — preserves format, handles age > 89", async () => {
    const plan = buildPlan();
    await executeRedaction(db, plan, config);

    const rows = db.tables.get("patients")!;

    // Row 1: normal date, shifted but still ISO format
    const dob1 = rows[0]!.date_of_birth as string;
    expect(dob1).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dob1).not.toBe("1985-03-15");

    // Row 2: age > 89 (born 1932) — should be aggregated to ~90 years ago
    const dob2 = rows[1]!.date_of_birth as string;
    expect(dob2).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const resultAge = (Date.now() - new Date(dob2).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    expect(resultAge).toBeCloseTo(90, 0);
  });

  test("IP address redaction — IPv4 and IPv6", async () => {
    const plan = buildPlan();
    await executeRedaction(db, plan, config);

    const rows = db.tables.get("patients")!;

    // IPv4
    const ip1 = rows[0]!.ip_address as string;
    expect(ip1).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    expect(ip1).not.toBe("192.168.1.100");

    // IPv6
    const ip2 = rows[1]!.ip_address as string;
    expect(ip2).toContain(":");
    expect(ip2).not.toBe("2001:0db8:85a3::8a2e:0370:7334");
  });

  test("JSONB object: contact_info — phone and email redacted inside", async () => {
    const plan = buildPlan();
    await executeRedaction(db, plan, config);

    const rows = db.tables.get("patients")!;
    const contact = rows[0]!.contact_info as Record<string, unknown>;

    // The deep strategy should have redacted phone numbers and emails inside the JSONB
    expect(typeof contact).toBe("object");
    const homePhone = (contact as any).home_phone as string;
    expect(homePhone).toContain("(XXX) XXX-XXXX");

    const workEmail = (contact as any).work_email as string;
    expect(workEmail).toBe("[EMAIL REDACTED]");

    // Nested emergency contact
    const emergency = (contact as any).emergency as Record<string, unknown>;
    expect((emergency.phone as string)).toContain("(XXX) XXX-XXXX");
  });

  test("JSONB array: addresses — preserves structure", async () => {
    const plan = buildPlan();
    await executeRedaction(db, plan, config);

    const rows = db.tables.get("patients")!;
    const addresses = rows[0]!.addresses;

    // Should still be an array
    expect(Array.isArray(addresses)).toBe(true);
    const addrs = addresses as any[];
    expect(addrs.length).toBe(2);
    // Structure preserved — still has type, street, city, zip fields
    expect(addrs[0]).toHaveProperty("type");
    expect(addrs[0]).toHaveProperty("street");
    expect(addrs[0]).toHaveProperty("city");
    expect(addrs[0]).toHaveProperty("zip");
  });

  test("serialized JSON string: metadata_json — parsed, redacted, re-serialized", async () => {
    const plan = buildPlan();
    await executeRedaction(db, plan, config);

    const rows = db.tables.get("patients")!;
    const metaStr = rows[0]!.metadata_json as string;

    // Should still be a valid JSON string
    expect(typeof metaStr).toBe("string");
    const meta = JSON.parse(metaStr);

    // Phone inside the notes field should be scrubbed
    expect(meta.notes).toContain("(XXX) XXX-XXXX");
    expect(meta.notes).not.toContain("555-444-3333");
  });

  test("free text: clinical_notes — multiple PHI types scrubbed", async () => {
    const plan = buildPlan();
    await executeRedaction(db, plan, config);

    const rows = db.tables.get("patients")!;
    const notes = rows[0]!.clinical_notes as string;

    // SSN scrubbed
    expect(notes).not.toContain("234-56-7890");
    expect(notes).toContain("XXX-XX-XXXX");

    // Date scrubbed
    expect(notes).not.toContain("01/15/2024");
    expect(notes).toContain("[DATE REDACTED]");

    // Email scrubbed
    expect(notes).not.toContain("john@email.com");
    expect(notes).toContain("[EMAIL REDACTED]");

    // URL scrubbed
    expect(notes).not.toContain("https://portal.hospital.org");
    expect(notes).toContain("[URL REDACTED]");

    // IP scrubbed
    expect(notes).not.toContain("10.0.0.1");
    expect(notes).toContain("X.X.X.X");
  });

  test("null values pass through unchanged", async () => {
    const plan = buildPlan();
    await executeRedaction(db, plan, config);

    const rows = db.tables.get("patients")!;
    // Row 2 has null clinical_notes and null photo_blob
    expect(rows[1]!.photo_blob).toBeNull();
    // clinical_notes was null — should still be null (not redacted)
  });

  test("photo_blob is set to null via null_replace strategy", async () => {
    // Add a non-null photo to test null_replace
    const rows = db.tables.get("patients")!;
    rows[0]!.photo_blob = "base64encodedphotodata";

    const plan = buildPlan();
    await executeRedaction(db, plan, config);

    const updatedRows = db.tables.get("patients")!;
    expect(updatedRows[0]!.photo_blob).toBeNull();
  });

  test("MRN consistency: same MRN in different rows maps to same output", async () => {
    // Give both rows the same MRN to test consistency
    const rows = db.tables.get("patients")!;
    rows[1]!.mrn = "MRN-001234"; // same as row 1

    const plan = buildPlan();
    await executeRedaction(db, plan, config);

    const updated = db.tables.get("patients")!;
    // Same original → same redacted value
    expect(updated[0]!.mrn).toBe(updated[1]!.mrn);
    expect(updated[0]!.mrn).not.toBe("MRN-001234");
  });

  test("tables without primary key are skipped gracefully", async () => {
    const plan = buildRedactionPlan(
      CLASSIFICATION,
      config,
      "test-fingerprint",
      new Map(), // No primary keys
      new Map([["public.patients", 2]]),
    );

    const summary = await executeRedaction(db, plan, config);
    expect(summary.tablesProcessed).toBe(1); // Counted but 0 rows actually redacted
    expect(summary.rowsRedacted).toBe(0);
    expect(summary.errors).toHaveLength(0);
  });

  test("chunking works with small chunk size", async () => {
    config = makeConfig({ redaction: { chunkSize: 1, concurrency: 1, consistentMapping: true } });
    const plan = buildPlan();
    const summary = await executeRedaction(db, plan, config);

    // Should process both rows via 2 separate chunks
    expect(summary.rowsRedacted).toBe(2);
    expect(db.committed).toBe(2); // One commit per chunk
  });

  test("strategy overrides from config are respected", async () => {
    config = makeConfig({
      overrides: [
        {
          table: "public.patients",
          column: "date_of_birth",
          strategy: "date_shift",
          config: { maxShiftDays: 1 },
        },
      ],
    });
    const plan = buildPlan();
    expect(plan.tables[0]!.columns.find((c) => c.name === "date_of_birth")!.config).toEqual({
      maxShiftDays: 1,
    });
  });
});

describe("Redaction engine — edge cases", () => {
  test("empty plan with no tables", async () => {
    const db = new MockDatabaseAdapter();
    const config = makeConfig();
    const emptyPlan = {
      generatedAt: new Date().toISOString(),
      schemaFingerprint: "empty",
      tables: [],
      totalColumnsToRedact: 0,
      totalRowsAffected: 0,
    };

    const summary = await executeRedaction(db, emptyPlan, config);
    expect(summary.tablesProcessed).toBe(0);
    expect(summary.rowsRedacted).toBe(0);
    expect(summary.errors).toHaveLength(0);
  });

  test("table with all null values", async () => {
    const db = new MockDatabaseAdapter();
    db.tables.set("empty_data", [
      { id: 1, name: null, email: null, ssn: null },
      { id: 2, name: null, email: null, ssn: null },
    ]);

    const classification: ClassificationResponse = {
      tables: [{
        schema: "public",
        name: "empty_data",
        columns: [
          { name: "name", phiType: "name", confidence: 0.9, reasoning: "Name", suggestedStrategy: "faker_name" },
          { name: "email", phiType: "email", confidence: 0.9, reasoning: "Email", suggestedStrategy: "faker_email" },
          { name: "ssn", phiType: "ssn", confidence: 0.9, reasoning: "SSN", suggestedStrategy: "format_preserve_ssn" },
        ],
      }],
    };

    const plan = buildRedactionPlan(
      classification,
      makeConfig(),
      "null-test",
      new Map([["public.empty_data", "id"]]),
      new Map([["public.empty_data", 2]]),
    );

    const summary = await executeRedaction(db, plan, makeConfig());
    // No actual changes since all values are null
    expect(summary.rowsRedacted).toBe(0);
    expect(summary.errors).toHaveLength(0);
  });

  test("row with empty strings", async () => {
    const db = new MockDatabaseAdapter();
    db.tables.set("sparse", [
      { id: 1, name: "", email: "", ssn: "" },
    ]);

    const classification: ClassificationResponse = {
      tables: [{
        schema: "public",
        name: "sparse",
        columns: [
          { name: "name", phiType: "name", confidence: 0.9, reasoning: "Name", suggestedStrategy: "faker_name" },
          { name: "email", phiType: "email", confidence: 0.9, reasoning: "Email", suggestedStrategy: "faker_email" },
          { name: "ssn", phiType: "ssn", confidence: 0.9, reasoning: "SSN", suggestedStrategy: "format_preserve_ssn" },
        ],
      }],
    };

    const plan = buildRedactionPlan(
      classification,
      makeConfig(),
      "empty-string-test",
      new Map([["public.sparse", "id"]]),
      new Map([["public.sparse", 1]]),
    );

    const summary = await executeRedaction(db, plan, makeConfig());
    // Empty strings should be handled gracefully (not throw)
    expect(summary.errors).toHaveLength(0);
  });

  test("very long text field", async () => {
    const db = new MockDatabaseAdapter();
    const longText = "Patient contacted at 555-000-1234. " + "A".repeat(10000) + " End note. SSN: 111-22-3333.";
    db.tables.set("notes", [{ id: 1, body: longText }]);

    const classification: ClassificationResponse = {
      tables: [{
        schema: "public",
        name: "notes",
        columns: [
          { name: "body", phiType: "free_text", confidence: 0.95, reasoning: "Notes", suggestedStrategy: "free_text_scrub" },
        ],
      }],
    };

    const plan = buildRedactionPlan(
      classification,
      makeConfig(),
      "long-text-test",
      new Map([["public.notes", "id"]]),
      new Map([["public.notes", 1]]),
    );

    const summary = await executeRedaction(db, plan, makeConfig());
    expect(summary.errors).toHaveLength(0);

    const body = db.tables.get("notes")![0]!.body as string;
    expect(body).not.toContain("555-000-1234");
    expect(body).not.toContain("111-22-3333");
    expect(body).toContain("XXX-XX-XXXX");
    // Length should be roughly similar (replacements are similar length)
    expect(body.length).toBeGreaterThan(10000);
  });

  test("special characters in strings don't break redaction", async () => {
    const db = new MockDatabaseAdapter();
    db.tables.set("special", [
      { id: 1, name: "O'Brien-Smith", email: "o'brien@test.com", note: "Unicode: résumé 日本語 emoji 🏥" },
    ]);

    const classification: ClassificationResponse = {
      tables: [{
        schema: "public",
        name: "special",
        columns: [
          { name: "name", phiType: "name", confidence: 0.9, reasoning: "Name", suggestedStrategy: "faker_name" },
          { name: "email", phiType: "email", confidence: 0.9, reasoning: "Email", suggestedStrategy: "faker_email" },
          { name: "note", phiType: "free_text", confidence: 0.8, reasoning: "Notes", suggestedStrategy: "free_text_scrub" },
        ],
      }],
    };

    const plan = buildRedactionPlan(
      classification,
      makeConfig(),
      "special-char-test",
      new Map([["public.special", "id"]]),
      new Map([["public.special", 1]]),
    );

    const summary = await executeRedaction(db, plan, makeConfig());
    expect(summary.errors).toHaveLength(0);
    expect(summary.rowsRedacted).toBe(1);

    const row = db.tables.get("special")![0]!;
    expect(row.name).not.toBe("O'Brien-Smith");
    expect((row.email as string)).toContain("@example.com");
  });

  test("numeric-only columns classified as PHI", async () => {
    const db = new MockDatabaseAdapter();
    db.tables.set("accounts", [
      { id: 1, account_num: 9876543210, policy_id: 1234567 },
    ]);

    const classification: ClassificationResponse = {
      tables: [{
        schema: "public",
        name: "accounts",
        columns: [
          { name: "account_num", phiType: "account_number", confidence: 0.95, reasoning: "Account number", suggestedStrategy: "consistent_hash" },
          { name: "policy_id", phiType: "health_plan_id", confidence: 0.90, reasoning: "Policy ID", suggestedStrategy: "consistent_hash" },
        ],
      }],
    };

    const plan = buildRedactionPlan(
      classification,
      makeConfig(),
      "numeric-test",
      new Map([["public.accounts", "id"]]),
      new Map([["public.accounts", 1]]),
    );

    const summary = await executeRedaction(db, plan, makeConfig());
    expect(summary.errors).toHaveLength(0);

    const row = db.tables.get("accounts")![0]!;
    // Numeric values get converted to string by the identifier strategy
    expect(row.account_num).not.toBe(9876543210);
    expect(row.policy_id).not.toBe(1234567);
  });
});
