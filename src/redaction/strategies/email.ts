import { faker } from "@faker-js/faker";
import type { RedactionStrategy, RedactionContext } from "./strategy.ts";

export class EmailStrategy implements RedactionStrategy {
  readonly name = "faker_email";

  redact(value: unknown, context: RedactionContext): unknown {
    if (value === null || value === undefined) return value;

    return context.consistencyMap.getOrSet(this.name, value, () => {
      const str = String(value);
      // Preserve the general structure: user@domain.tld
      if (str.includes("@")) {
        const firstName = faker.person.firstName().toLowerCase();
        const lastName = faker.person.lastName().toLowerCase();
        return `${firstName}.${lastName}@example.com`;
      }
      return faker.internet.email();
    });
  }
}
