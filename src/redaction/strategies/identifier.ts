import { createHmac, randomBytes } from "crypto";
import type { RedactionStrategy, RedactionContext } from "./strategy.ts";

// Module-level secret generated once per run
const RUN_SECRET = randomBytes(32).toString("hex");

export class IdentifierStrategy implements RedactionStrategy {
  readonly name = "consistent_hash";

  redact(value: unknown, context: RedactionContext): unknown {
    if (value === null || value === undefined) return value;

    const str = String(value);
    if (str.length === 0) return value;

    // HMAC is inherently deterministic — same input always gives same output
    // No need for the consistency map, but we use it for cross-strategy dedup
    const hmac = createHmac("sha256", RUN_SECRET)
      .update(str)
      .digest("hex");

    // Match the length and character set of the original
    if (/^\d+$/.test(str)) {
      // Numeric ID: produce numeric output of same length
      return this.hexToNumeric(hmac, str.length);
    }

    if (/^[A-Z0-9]+$/.test(str)) {
      // Uppercase alphanumeric
      return hmac.slice(0, str.length).toUpperCase();
    }

    if (/^[a-z0-9]+$/.test(str)) {
      // Lowercase alphanumeric
      return hmac.slice(0, str.length);
    }

    // Mixed or contains separators: preserve the format
    let hmacIndex = 0;
    return str.replace(/[a-zA-Z0-9]/g, (char) => {
      const h = hmac[hmacIndex % hmac.length]!;
      hmacIndex++;
      if (/\d/.test(char)) return String(parseInt(h, 16) % 10);
      if (/[A-Z]/.test(char)) return h.toUpperCase();
      return h;
    });
  }

  private hexToNumeric(hex: string, length: number): string {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += String(parseInt(hex[i % hex.length]!, 16) % 10);
    }
    // Ensure first digit isn't 0 for IDs that don't start with 0
    if (result[0] === "0" && length > 1) {
      result = String((parseInt(hex[0]!, 16) % 9) + 1) + result.slice(1);
    }
    return result;
  }
}
