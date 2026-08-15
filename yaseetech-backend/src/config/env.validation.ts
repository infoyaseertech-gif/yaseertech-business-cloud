interface EnvConfig {
  NODE_ENV: string;
  PORT: string;
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  REFRESH_TOKEN_EXPIRES_IN_DAYS: string;
}

const REQUIRED_KEYS: (keyof EnvConfig)[] = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
];

// Nest calls this once at startup (see ConfigModule.forRoot in app.module.ts).
// Failing fast here with a clear message beats a cryptic "undefined is not
// a function" three requests into local testing.
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED_KEYS.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Copy .env.example to .env and fill these in before starting the app.`,
    );
  }

  if (
    config.JWT_ACCESS_SECRET === 'replace_with_a_long_random_string'
  ) {
    throw new Error(
      'JWT_ACCESS_SECRET is still set to the placeholder value from .env.example. ' +
        'Generate a real secret, e.g. `openssl rand -base64 48`, and set it in .env.',
    );
  }

  return config;
}
