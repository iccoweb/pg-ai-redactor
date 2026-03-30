import type { RedactionStrategy, RedactionContext } from "./strategy.ts";

/**
 * Wraps any scalar RedactionStrategy to recursively apply it to:
 * - Plain objects (JSONB from PostgreSQL)
 * - Arrays
 * - Serialized JSON strings (detected, parsed, redacted, re-serialized)
 *
 * Scalar values are passed through to the inner strategy as-is.
 */
export class DeepRedactStrategy implements RedactionStrategy {
  readonly name: string;

  constructor(private inner: RedactionStrategy) {
    this.name = `deep_${inner.name}`;
  }

  redact(value: unknown, context: RedactionContext): unknown {
    // Top-level: always delegate to inner (handles scalars, numbers, strings)
    if (value === null || value === undefined) return value;
    if (Array.isArray(value) || (typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value))) {
      return this.redactDeep(value, context);
    }
    if (typeof value === "string") {
      const parsed = tryParseJSON(value);
      if (parsed !== undefined) {
        const redacted = this.redactDeep(parsed, context);
        return JSON.stringify(redacted);
      }
    }
    return this.inner.redact(value, context);
  }

  private redactDeep(value: unknown, context: RedactionContext): unknown {
    if (value === null || value === undefined) return value;

    // Array — redact each element
    if (Array.isArray(value)) {
      return value.map((item) => this.redactDeep(item, context));
    }

    // Plain object (JSONB from PG comes as parsed objects)
    if (typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        result[key] = this.redactDeep(val, context);
      }
      return result;
    }

    // String inside an object/array — check for serialized JSON, then delegate
    if (typeof value === "string") {
      const parsed = tryParseJSON(value);
      if (parsed !== undefined) {
        const redacted = this.redactDeep(parsed, context);
        return JSON.stringify(redacted);
      }
      return this.inner.redact(value, context);
    }

    // Booleans inside nested structures — always preserve
    // Numbers and other non-string primitives inside nested structures — preserve
    // (numeric PHI at the top level is handled by redact(), not here)
    return value;
  }
}

function tryParseJSON(str: string): unknown | undefined {
  const trimmed = str.trim();
  // Only attempt parse if it looks like JSON (starts with { or [)
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
