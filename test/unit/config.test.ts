import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { loadConfig } from "../../src/config/loader.ts";
import { resolveEnvVars, resolveEnvVarsDeep } from "../../src/utils/env.ts";

const TEST_CONFIG_PATH = "/tmp/test-redactor-config.yaml";

describe("env var resolution", () => {
  beforeEach(() => {
    process.env.TEST_VAR = "hello";
    process.env.DB_HOST_TEST = "localhost";
  });

  afterEach(() => {
    delete process.env.TEST_VAR;
    delete process.env.DB_HOST_TEST;
  });

  test("resolves $VAR syntax", () => {
    expect(resolveEnvVars("$TEST_VAR")).toBe("hello");
  });

  test("resolves ${VAR} syntax", () => {
    expect(resolveEnvVars("${TEST_VAR}")).toBe("hello");
  });

  test("throws on missing env var", () => {
    expect(() => resolveEnvVars("$NONEXISTENT_VAR_XYZ")).toThrow("not set");
  });

  test("resolves nested objects", () => {
    const result = resolveEnvVarsDeep({
      host: "$DB_HOST_TEST",
      nested: { value: "$TEST_VAR" },
      array: ["$TEST_VAR", "literal"],
      number: 42,
    });
    expect(result).toEqual({
      host: "localhost",
      nested: { value: "hello" },
      array: ["hello", "literal"],
      number: 42,
    });
  });

  test("does not resolve strings not starting with $", () => {
    expect(resolveEnvVarsDeep("no-var-here")).toBe("no-var-here");
  });
});

describe("config loader", () => {
  beforeEach(() => {
    process.env.DB_HOST_TEST = "localhost";
    process.env.DB_NAME_TEST = "testdb";
    process.env.DB_USER_TEST = "postgres";
    process.env.DB_PASS_TEST = "secret";
    process.env.AI_KEY_TEST = "sk-test-123";
  });

  afterEach(() => {
    delete process.env.DB_HOST_TEST;
    delete process.env.DB_NAME_TEST;
    delete process.env.DB_USER_TEST;
    delete process.env.DB_PASS_TEST;
    delete process.env.AI_KEY_TEST;
    if (existsSync(TEST_CONFIG_PATH)) unlinkSync(TEST_CONFIG_PATH);
  });

  test("loads valid config with env vars", () => {
    writeFileSync(
      TEST_CONFIG_PATH,
      `
database:
  host: $DB_HOST_TEST
  database: $DB_NAME_TEST
  username: $DB_USER_TEST
  password: $DB_PASS_TEST

ai:
  provider: openai
  apiKey: $AI_KEY_TEST
`,
    );

    const config = loadConfig(TEST_CONFIG_PATH);
    expect(config.database.host).toBe("localhost");
    expect(config.database.database).toBe("testdb");
    expect(config.database.type).toBe("postgres");
    expect(config.database.port).toBe(5432);
    expect(config.ai.provider).toBe("openai");
    expect(config.ai.apiKey).toBe("sk-test-123");
  });

  test("applies defaults for optional sections", () => {
    writeFileSync(
      TEST_CONFIG_PATH,
      `
database:
  host: $DB_HOST_TEST
  database: $DB_NAME_TEST
  username: $DB_USER_TEST
  password: $DB_PASS_TEST

ai:
  provider: anthropic
`,
    );

    const config = loadConfig(TEST_CONFIG_PATH);
    expect(config.redaction.chunkSize).toBe(5000);
    expect(config.redaction.concurrency).toBe(4);
    expect(config.allowlist.tables).toEqual([]);
    expect(config.cache.enabled).toBe(true);
    expect(config.audit.format).toBe("jsonl");
  });

  test("throws on missing config file", () => {
    expect(() => loadConfig("/tmp/nonexistent.yaml")).toThrow("not found");
  });

  test("throws on invalid YAML", () => {
    writeFileSync(TEST_CONFIG_PATH, "{{invalid yaml");
    expect(() => loadConfig(TEST_CONFIG_PATH)).toThrow();
  });

  test("throws on missing required fields", () => {
    writeFileSync(TEST_CONFIG_PATH, `
database:
  host: $DB_HOST_TEST
`);
    expect(() => loadConfig(TEST_CONFIG_PATH)).toThrow("Invalid configuration");
  });
});
