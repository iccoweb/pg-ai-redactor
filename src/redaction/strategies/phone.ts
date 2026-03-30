import type { RedactionStrategy, RedactionContext } from "./strategy.ts";

export class PhoneStrategy implements RedactionStrategy {
  readonly name = "format_preserve_phone";

  redact(value: unknown, context: RedactionContext): unknown {
    if (value === null || value === undefined) return value;

    return context.consistencyMap.getOrSet(this.name, value, () => {
      const str = String(value);
      // Replace each digit with a random digit, preserving all formatting characters
      return str.replace(/\d/g, () => String(Math.floor(Math.random() * 10)));
    });
  }
}
