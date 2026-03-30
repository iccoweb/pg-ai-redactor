import type { RedactionStrategy, RedactionContext } from "./strategy.ts";

export class DateStrategy implements RedactionStrategy {
  readonly name = "date_shift";

  redact(value: unknown, context: RedactionContext): unknown {
    if (value === null || value === undefined) return value;

    return context.consistencyMap.getOrSet(this.name, value, () => {
      const maxShiftDays = (context.config?.maxShiftDays as number) ?? 30;

      let date: Date;
      if (value instanceof Date) {
        date = new Date(value.getTime());
      } else {
        date = new Date(String(value));
        if (isNaN(date.getTime())) return value; // Can't parse, return as-is
      }

      // HIPAA: ages over 89 must be aggregated to 90+
      const now = new Date();
      const ageMs = now.getTime() - date.getTime();
      const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
      if (ageYears > 89) {
        // Set to exactly 90 years ago from today
        const ninetyYearsAgo = new Date(now);
        ninetyYearsAgo.setFullYear(ninetyYearsAgo.getFullYear() - 90);
        ninetyYearsAgo.setMonth(0);
        ninetyYearsAgo.setDate(1);
        return this.formatLike(ninetyYearsAgo, value);
      }

      // Shift by a consistent random offset within ±maxShiftDays
      // Use a hash of the original value for deterministic offset
      const hash = simpleHash(String(value));
      const shiftDays = (hash % (maxShiftDays * 2 + 1)) - maxShiftDays;
      date.setDate(date.getDate() + shiftDays);

      return this.formatLike(date, value);
    });
  }

  private formatLike(date: Date, original: unknown): unknown {
    if (original instanceof Date) return date;

    // Try to match the original string format
    const str = String(original);

    // ISO format: 2024-01-15 or 2024-01-15T...
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const iso = date.toISOString();
      if (str.includes("T")) return iso;
      return iso.split("T")[0];
    }

    // US format: 01/15/2024
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${m}/${d}/${date.getFullYear()}`;
    }

    // Default to ISO date
    return date.toISOString().split("T")[0];
  }
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}
