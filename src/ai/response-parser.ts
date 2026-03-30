import { z } from "zod/v4";
import { PHI_TYPES } from "./types.ts";
import type { ClassificationResponse } from "./types.ts";

const columnClassificationSchema = z.object({
  name: z.string(),
  phiType: z.enum(PHI_TYPES).nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestedStrategy: z.string(),
});

const tableClassificationSchema = z.object({
  schema: z.string(),
  name: z.string(),
  columns: z.array(columnClassificationSchema),
});

const classificationResponseSchema = z.object({
  tables: z.array(tableClassificationSchema),
});

export function parseClassificationResponse(raw: string): ClassificationResponse {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `AI response is not valid JSON. First 200 chars: ${raw.slice(0, 200)}`,
    );
  }

  const result = classificationResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `AI response does not match expected schema: ${JSON.stringify(result.error.issues, null, 2)}`,
    );
  }

  return result.data;
}
