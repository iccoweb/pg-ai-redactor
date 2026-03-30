import type { ColumnInfo } from "../db/types.ts";

export const PHI_TYPES = [
  "name",
  "address",
  "date",
  "phone",
  "fax",
  "email",
  "ssn",
  "medical_record_number",
  "health_plan_id",
  "account_number",
  "license_number",
  "vehicle_id",
  "device_id",
  "url",
  "ip_address",
  "biometric",
  "photograph",
  "other_unique_id",
  "free_text",
] as const;

export type PHIType = (typeof PHI_TYPES)[number];

export interface ClassificationRequest {
  tables: Array<{
    schema: string;
    name: string;
    columns: ColumnInfo[];
    sampleRows: Record<string, unknown>[];
  }>;
}

export interface ColumnClassification {
  name: string;
  phiType: PHIType | null;
  confidence: number;
  reasoning: string;
  suggestedStrategy: string;
}

export interface TableClassification {
  schema: string;
  name: string;
  columns: ColumnClassification[];
}

export interface ClassificationResponse {
  tables: TableClassification[];
}
