import type { RedactionStrategy, RedactionContext } from "./strategy.ts";

export class IPAddressStrategy implements RedactionStrategy {
  readonly name = "ip_randomize";

  redact(value: unknown, context: RedactionContext): unknown {
    if (value === null || value === undefined) return value;

    return context.consistencyMap.getOrSet(this.name, value, () => {
      const str = String(value);

      // IPv6
      if (str.includes(":")) {
        return this.randomIPv6();
      }

      // IPv4
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(str)) {
        return this.randomIPv4();
      }

      return str;
    });
  }

  private randomIPv4(): string {
    const octets = [
      Math.floor(Math.random() * 223) + 1, // Avoid 0 and 224+ (multicast)
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 254) + 1, // Avoid .0 and .255
    ];
    return octets.join(".");
  }

  private randomIPv6(): string {
    const groups: string[] = [];
    for (let i = 0; i < 8; i++) {
      groups.push(Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0"));
    }
    return groups.join(":");
  }
}
