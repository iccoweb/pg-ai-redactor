import { faker } from "@faker-js/faker";
import type { RedactionStrategy, RedactionContext } from "./strategy.ts";

export class NameStrategy implements RedactionStrategy {
  readonly name = "faker_name";

  redact(value: unknown, context: RedactionContext): unknown {
    if (value === null || value === undefined) return value;

    return context.consistencyMap.getOrSet(this.name, value, () => {
      const str = String(value);
      // Detect if it looks like "Last, First" or "First Last"
      if (str.includes(",")) {
        return `${faker.person.lastName()}, ${faker.person.firstName()}`;
      }
      const parts = str.trim().split(/\s+/);
      if (parts.length >= 3) {
        return `${faker.person.firstName()} ${faker.person.middleName()} ${faker.person.lastName()}`;
      }
      if (parts.length === 2) {
        return `${faker.person.firstName()} ${faker.person.lastName()}`;
      }
      // Single name — guess based on column name
      const colLower = context.columnName.toLowerCase();
      if (colLower.includes("last") || colLower.includes("surname")) {
        return faker.person.lastName();
      }
      return faker.person.firstName();
    });
  }
}
