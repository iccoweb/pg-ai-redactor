import { faker } from "@faker-js/faker";
import type { RedactionStrategy, RedactionContext } from "./strategy.ts";

// ZIP codes where first 3 digits have population <= 20,000 (must be zeroed per HIPAA)
// This is a simplified set — in production, load from Census Bureau data
const SMALL_POPULATION_ZIP_PREFIXES = new Set([
  "036", "059", "063", "102", "203", "556", "692", "790", "821", "823",
  "830", "831", "878", "879", "884", "890", "893",
]);

export class AddressStrategy implements RedactionStrategy {
  readonly name = "faker_address";

  redact(value: unknown, context: RedactionContext): unknown {
    if (value === null || value === undefined) return value;

    return context.consistencyMap.getOrSet(this.name, value, () => {
      const colLower = context.columnName.toLowerCase();

      if (colLower.includes("zip") || colLower.includes("postal")) {
        return this.redactZip(String(value));
      }
      if (colLower.includes("state")) {
        return faker.location.state({ abbreviated: String(value).length <= 2 });
      }
      if (colLower.includes("city")) {
        return faker.location.city();
      }
      if (colLower.includes("county")) {
        return faker.location.county();
      }
      if (colLower.includes("street") || colLower.includes("address") || colLower.includes("addr")) {
        return faker.location.streetAddress();
      }

      // Generic address — return full street address
      return faker.location.streetAddress();
    });
  }

  private redactZip(original: string): string {
    const cleaned = original.replace(/[^0-9]/g, "");
    if (cleaned.length >= 3) {
      const prefix = cleaned.slice(0, 3);
      if (SMALL_POPULATION_ZIP_PREFIXES.has(prefix)) {
        // HIPAA requires these to be set to "000"
        return "000" + cleaned.slice(3).replace(/./g, () => String(Math.floor(Math.random() * 10)));
      }
      // Keep first 3, randomize the rest
      return prefix + cleaned.slice(3).replace(/./g, () => String(Math.floor(Math.random() * 10)));
    }
    return faker.location.zipCode();
  }
}
