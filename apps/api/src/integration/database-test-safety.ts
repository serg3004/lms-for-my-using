const TEST_DATABASE_MARKER = 'test';
const LOCAL_DATABASE_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const FORBIDDEN_TARGET_MARKERS = ['prod', 'production', 'railway', 'staging'];

export type TestDatabaseSafetyOptions = {
  allowExternalHost?: boolean;
};

export function assertSafeTestDatabase(
  databaseUrl: string | undefined,
  options: TestDatabaseSafetyOptions = {},
): string {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for the database integration test');
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }

  if (parsedUrl.protocol !== 'postgresql:' && parsedUrl.protocol !== 'postgres:') {
    throw new Error('Database integration test requires a PostgreSQL URL');
  }

  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, '')).toLowerCase();
  const targetIdentity = `${parsedUrl.hostname}/${databaseName}`.toLowerCase();

  if (!databaseName.includes(TEST_DATABASE_MARKER)) {
    throw new Error('Database integration test requires a database name containing "test"');
  }

  if (FORBIDDEN_TARGET_MARKERS.some((marker) => targetIdentity.includes(marker))) {
    throw new Error('Database integration test refuses a production or staging target');
  }

  if (!options.allowExternalHost && !LOCAL_DATABASE_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
    throw new Error('Database integration test requires a local database host');
  }

  return databaseUrl;
}
