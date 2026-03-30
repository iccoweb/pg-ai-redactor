import type { ClassificationRequest } from "./types.ts";

const MAX_SAMPLE_VALUE_LENGTH = 200;

function truncateValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  const str = String(value);
  if (str.length > MAX_SAMPLE_VALUE_LENGTH) {
    return str.slice(0, MAX_SAMPLE_VALUE_LENGTH) + "...";
  }
  return str;
}

export function buildClassificationPrompt(request: ClassificationRequest): string {
  const tableDescriptions = request.tables.map((table) => {
    const columnDefs = table.columns
      .map((col) => {
        const parts = [
          `  - ${col.name} (${col.dataType}${col.maxLength ? `(${col.maxLength})` : ""})`,
        ];
        if (col.isPrimaryKey) parts.push("[PK]");
        if (col.isForeignKey && col.foreignKeyRef) {
          parts.push(`[FK -> ${col.foreignKeyRef.table}.${col.foreignKeyRef.column}]`);
        }
        if (!col.isNullable) parts.push("[NOT NULL]");
        return parts.join(" ");
      })
      .join("\n");

    const sampleData =
      table.sampleRows.length > 0
        ? table.sampleRows
            .slice(0, 5)
            .map((row) => {
              const values = Object.entries(row)
                .map(([k, v]) => `${k}: ${truncateValue(v)}`)
                .join(", ");
              return `  {${values}}`;
            })
            .join("\n")
        : "  (no sample data available)";

    return `### Table: ${table.schema}.${table.name}
Columns:
${columnDefs}

Sample data:
${sampleData}`;
  });

  return `You are a HIPAA compliance analyst. Analyze the following database schema and sample data to classify which columns contain Protected Health Information (PHI) according to the HIPAA Safe Harbor de-identification standard (45 CFR §164.514(b)(2)).

The 18 Safe Harbor identifier categories are:
(A) Names
(B) Geographic subdivisions smaller than a state (street address, city, county, ZIP code)
(C) Dates directly related to an individual (birth date, admission date, discharge date, death date) and all ages over 89
(D) Telephone numbers
(E) Fax numbers
(F) Email addresses
(G) Social Security numbers
(H) Medical record numbers
(I) Health plan beneficiary numbers
(J) Account numbers
(K) Certificate/license numbers
(L) Vehicle identifiers and serial numbers, including license plate numbers
(M) Device identifiers and serial numbers
(N) Web URLs
(O) IP addresses
(P) Biometric identifiers (fingerprints, voiceprints)
(Q) Full-face photographs and comparable images
(R) Any other unique identifying number, characteristic, or code

For each column, determine:
1. Whether it contains PHI (and which type)
2. Your confidence level (0.0 to 1.0)
3. Brief reasoning for your classification
4. Suggested redaction strategy

PHI types to use: name, address, date, phone, fax, email, ssn, medical_record_number, health_plan_id, account_number, license_number, vehicle_id, device_id, url, ip_address, biometric, photograph, other_unique_id, free_text

Suggested strategies: faker_name, faker_address, date_shift, format_preserve_phone, faker_email, format_preserve_ssn, consistent_hash, url_redact, ip_randomize, null_replace, free_text_scrub

Important guidelines:
- Primary key columns that are auto-incrementing integers are generally NOT PHI
- Foreign key columns should NOT be redacted (they maintain referential integrity)
- Columns with names like "created_at", "updated_at" are system timestamps, not patient dates
- Only classify columns as PHI if they could identify an individual
- "free_text" type is for unstructured text fields that may contain embedded PHI

${tableDescriptions.join("\n\n")}

Respond with ONLY valid JSON matching this exact structure (no markdown, no extra text):
{
  "tables": [
    {
      "schema": "schema_name",
      "name": "table_name",
      "columns": [
        {
          "name": "column_name",
          "phiType": "name" | null,
          "confidence": 0.95,
          "reasoning": "Brief explanation",
          "suggestedStrategy": "faker_name" | "none"
        }
      ]
    }
  ]
}`;
}
