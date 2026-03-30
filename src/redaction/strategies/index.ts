import type { RedactionStrategy } from "./strategy.ts";
import type { PHIType } from "../../ai/types.ts";
import { NameStrategy } from "./name.ts";
import { AddressStrategy } from "./address.ts";
import { DateStrategy } from "./date.ts";
import { PhoneStrategy } from "./phone.ts";
import { EmailStrategy } from "./email.ts";
import { SSNStrategy } from "./ssn.ts";
import { IdentifierStrategy } from "./identifier.ts";
import { IPAddressStrategy } from "./ip-address.ts";
import { URLStrategy } from "./url.ts";
import { NullReplaceStrategy } from "./null-replace.ts";
import { FreeTextStrategy } from "./free-text.ts";
import { DeepRedactStrategy } from "./deep-redact.ts";

const scalarStrategies: Record<string, RedactionStrategy> = {
  faker_name: new NameStrategy(),
  faker_address: new AddressStrategy(),
  date_shift: new DateStrategy(),
  format_preserve_phone: new PhoneStrategy(),
  faker_email: new EmailStrategy(),
  format_preserve_ssn: new SSNStrategy(),
  consistent_hash: new IdentifierStrategy(),
  ip_randomize: new IPAddressStrategy(),
  url_redact: new URLStrategy(),
  null_replace: new NullReplaceStrategy(),
  free_text_scrub: new FreeTextStrategy(),
};

// Wrap each scalar strategy with DeepRedactStrategy for JSONB/array/serialized JSON support
const strategies: Record<string, RedactionStrategy> = {};
for (const [name, strategy] of Object.entries(scalarStrategies)) {
  strategies[name] = new DeepRedactStrategy(strategy);
}
// Also register the raw scalar versions under "scalar_" prefix for direct access
for (const [name, strategy] of Object.entries(scalarStrategies)) {
  strategies[`scalar_${name}`] = strategy;
}

/** Map PHI types to their default strategy */
const PHI_TYPE_TO_STRATEGY: Record<PHIType, string> = {
  name: "faker_name",
  address: "faker_address",
  date: "date_shift",
  phone: "format_preserve_phone",
  fax: "format_preserve_phone",
  email: "faker_email",
  ssn: "format_preserve_ssn",
  medical_record_number: "consistent_hash",
  health_plan_id: "consistent_hash",
  account_number: "consistent_hash",
  license_number: "consistent_hash",
  vehicle_id: "consistent_hash",
  device_id: "consistent_hash",
  url: "url_redact",
  ip_address: "ip_randomize",
  biometric: "null_replace",
  photograph: "null_replace",
  other_unique_id: "consistent_hash",
  free_text: "free_text_scrub",
};

export function getStrategy(strategyName: string): RedactionStrategy {
  const strategy = strategies[strategyName];
  if (!strategy) {
    throw new Error(`Unknown redaction strategy: ${strategyName}`);
  }
  return strategy;
}

export function getStrategyForPHIType(phiType: PHIType): RedactionStrategy {
  const strategyName = PHI_TYPE_TO_STRATEGY[phiType];
  return getStrategy(strategyName);
}

export function getDefaultStrategyName(phiType: PHIType): string {
  return PHI_TYPE_TO_STRATEGY[phiType];
}
