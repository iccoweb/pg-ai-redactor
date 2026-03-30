import type { RedactionStrategy, RedactionContext } from "./strategy.ts";

export class SSNStrategy implements RedactionStrategy {
  readonly name = "format_preserve_ssn";

  redact(value: unknown, context: RedactionContext): unknown {
    if (value === null || value === undefined) return value;

    return context.consistencyMap.getOrSet(this.name, value, () => {
      const str = String(value);

      // Detect if formatted (XXX-XX-XXXX) or unformatted (XXXXXXXXX)
      if (/^\d{3}-\d{2}-\d{4}$/.test(str)) {
        return `${this.randomArea()}-${this.randomDigits(2)}-${this.randomDigits(4)}`;
      }
      if (/^\d{9}$/.test(str)) {
        return `${this.randomArea()}${this.randomDigits(2)}${this.randomDigits(4)}`;
      }

      // Fallback: replace digits preserving format
      return str.replace(/\d/g, () => String(Math.floor(Math.random() * 10)));
    });
  }

  /** Generate a valid SSN area number (avoids 000, 666, 900-999) */
  private randomArea(): string {
    let area: number;
    do {
      area = Math.floor(Math.random() * 899) + 1; // 001-899
    } while (area === 666);
    return String(area).padStart(3, "0");
  }

  private randomDigits(count: number): string {
    let result = "";
    for (let i = 0; i < count; i++) {
      result += String(Math.floor(Math.random() * 10));
    }
    return result;
  }
}
