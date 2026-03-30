export const DEFAULT_CONFIG_YAML = `# pg-ai-redactor configuration
# Docs: https://github.com/your-org/pg-ai-redactor

database:
  type: postgres
  host: \$DB_HOST
  port: 5432
  database: \$DB_NAME
  username: \$DB_USER
  password: \$DB_PASSWORD
  ssl:
    enabled: false

ai:
  provider: openai              # openai | anthropic | ollama
  model: gpt-4o                 # Model name for the chosen provider
  apiKey: \$AI_API_KEY           # Always use env vars for secrets
  # baseUrl: http://localhost:11434  # Uncomment for Ollama
  sampleRows: 10                # Number of sample rows sent to AI for analysis

redaction:
  chunkSize: 5000               # Rows per batch UPDATE
  concurrency: 4                # Parallel tables to process
  consistentMapping: true       # Same input -> same output within a run

# Tables and columns to skip (never redact)
allowlist:
  tables: []
    # - public.migrations
    # - public.audit_log
  columns: []
    # - public.patients.id
    # - public.patients.created_at

# Tables and columns to force-redact
denylist:
  columns: []
    # - table: public.notes
    #   column: body
    #   phiType: free_text

# Override the AI-suggested strategy for specific columns
overrides: []
  # - table: public.patients
  #   column: date_of_birth
  #   strategy: date_shift
  #   config:
  #     maxShiftDays: 30

cache:
  directory: .pg-ai-redactor/cache
  enabled: true

audit:
  enabled: true
  outputPath: .pg-ai-redactor/audit/
  format: jsonl
`;
