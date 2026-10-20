import { Pool, type PoolClient } from "pg";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type { Pool, PoolClient };

export const TEST_DB_DEFAULT = "sos_sales_v3_test";
export const TEST_PORT_DEFAULT = "55440";
export const TEST_HOSTS_ALLOWED = ["localhost", "127.0.0.1", "::1"];
export const TEST_DB_COMMENT_MARKER = "MCT_TEST_ISOLATED_DB";

/**
 * Sanitizes any PostgreSQL connection string or URL, ensuring no credentials or passwords leak.
 */
export function sanitizeDatabaseUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "<empty>";
  }
  const masked = rawUrl.replace(
    /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^:]+):([^@]+)@/g,
    "$1$2:***@"
  );
  try {
    const parsed = new URL(masked);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return masked;
  }
}

export interface ParsedTestDatabaseUrl {
  protocol: string;
  host: string;
  port: string;
  database: string;
  username: string;
  sanitizedUrl: string;
}

/**
 * Strict static validation of a test database URL before opening any network connection.
 * Fails closed on remote hosts, invalid protocols, unexpected ports, production/lab databases,
 * or arbitrary database names lacking the governed test prefix.
 */
export function validateTestDatabaseUrl(urlStr: string, expectedRole?: string): ParsedTestDatabaseUrl {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL SAFETY VIOLATION: Test database helpers must never run in production environment."
    );
  }

  if (!urlStr || typeof urlStr !== "string") {
    throw new Error(
      "FATAL SAFETY VIOLATION: Database connection string is required and must be non-empty."
    );
  }

  const sanitized = sanitizeDatabaseUrl(urlStr);

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`FATAL SAFETY VIOLATION: Malformed database connection URL: ${sanitized}`);
  }

  // 1. Protocol validation: must be postgresql: or postgres:
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      `FATAL SAFETY VIOLATION: Invalid database protocol '${parsed.protocol}'. Only postgresql:// or postgres:// is permitted for test database: ${sanitized}`
    );
  }

  // 2. Host validation: strictly local authorized hosts
  const host = parsed.hostname.toLowerCase();
  if (!TEST_HOSTS_ALLOWED.includes(host)) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Remote database hosts are strictly forbidden in test suites. Received '${host}' in ${sanitized}`
    );
  }

  // 3. Port validation: must match expected test port
  const expectedPort = process.env.TEST_DB_PORT || TEST_PORT_DEFAULT;
  const port = parsed.port || "5432";
  if (port !== expectedPort) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Unexpected port '${port}'. Test database must strictly use port '${expectedPort}': ${sanitized}`
    );
  }

  // 4. Database name validation: strictly governed test database names
  const dbName = parsed.pathname.replace(/^\//, "").split("?")[0]!;
  const isValidTestDb =
    dbName === TEST_DB_DEFAULT ||
    /^sos_sales_v3_test_[a-zA-Z0-9_-]+$/.test(dbName);

  if (!isValidTestDb) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Target database '${dbName}' is NOT an authorized test database. Must be '${TEST_DB_DEFAULT}' or match pattern 'sos_sales_v3_test_*'. Target in ${sanitized}`
    );
  }

  // 5. Role validation if specified
  const username = parsed.username;
  if (expectedRole && username !== expectedRole) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Expected role '${expectedRole}', but received '${username}' in ${sanitized}`
    );
  }

  return {
    protocol: parsed.protocol,
    host,
    port,
    database: dbName,
    username,
    sanitizedUrl: sanitized,
  };
}

/**
 * Validates an administrative test maintenance URL (pointing to the maintenance 'postgres' database).
 * Fails closed before any connection is made.
 */
export function validateTestAdminDatabaseUrl(urlStr: string): ParsedTestDatabaseUrl {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL SAFETY VIOLATION: Test database admin helpers must never run in production environment."
    );
  }

  if (!urlStr || typeof urlStr !== "string") {
    throw new Error(
      "FATAL SAFETY VIOLATION: Admin database connection string is required and must be non-empty."
    );
  }

  const sanitized = sanitizeDatabaseUrl(urlStr);

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`FATAL SAFETY VIOLATION: Malformed admin connection URL: ${sanitized}`);
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      `FATAL SAFETY VIOLATION: Invalid database protocol '${parsed.protocol}'. Only postgresql:// or postgres:// is permitted: ${sanitized}`
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (!TEST_HOSTS_ALLOWED.includes(host)) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Remote database hosts are strictly forbidden for administrative test operations. Received '${host}' in ${sanitized}`
    );
  }

  const expectedPort = process.env.TEST_DB_PORT || TEST_PORT_DEFAULT;
  const port = parsed.port || "5432";
  if (port !== expectedPort) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Unexpected port '${port}'. Admin connection must strictly use port '${expectedPort}': ${sanitized}`
    );
  }

  const dbName = parsed.pathname.replace(/^\//, "").split("?")[0]!;
  if (dbName !== "postgres") {
    throw new Error(
      `FATAL SAFETY VIOLATION: Admin maintenance connection must target 'postgres' maintenance database, but received '${dbName}': ${sanitized}`
    );
  }

  return {
    protocol: parsed.protocol,
    host,
    port,
    database: dbName,
    username: parsed.username,
    sanitizedUrl: sanitized,
  };
}

/**
 * Asserts that runtime and migration destinations point to the exact same host, port, and database,
 * while utilizing distinctly configured roles (sos_app_user vs sos_migration_owner).
 */
export function assertEquivalentTestDestinations(appUrlStr: string, migrationUrlStr: string): void {
  const appTarget = validateTestDatabaseUrl(appUrlStr, "sos_app_user");
  const migrationTarget = validateTestDatabaseUrl(migrationUrlStr, "sos_migration_owner");

  if (
    appTarget.host !== migrationTarget.host ||
    appTarget.port !== migrationTarget.port ||
    appTarget.database !== migrationTarget.database
  ) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Divergent test database destinations. Application targets '${appTarget.sanitizedUrl}', while Migration targets '${migrationTarget.sanitizedUrl}'. Both must target the same local test database.`
    );
  }

  if (appTarget.username === migrationTarget.username) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Application and migration connections must use distinct roles (sos_app_user vs sos_migration_owner). Found '${appTarget.username}' on both.`
    );
  }
}

/**
 * Asserts explicit opt-in for administrative database operations (create/drop).
 */
export function assertAdministrativeOptIn(action: string, targetDb: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL SAFETY VIOLATION: Administrative operations on test databases are strictly forbidden in production."
    );
  }

  const optIn = process.env.ALLOW_TEST_DB_ADMIN_OPERATIONS === "true";
  if (!optIn) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Administrative database operation '${action}' on '${targetDb}' requires explicit opt-in (ALLOW_TEST_DB_ADMIN_OPERATIONS=true).`
    );
  }

  const isValidTestDb =
    targetDb === TEST_DB_DEFAULT ||
    /^sos_sales_v3_test_[a-zA-Z0-9_-]+$/.test(targetDb);

  if (!isValidTestDb) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Refusing administrative operation '${action}' on non-test database '${targetDb}'.`
    );
  }
}

/**
 * Generates an isolated test database name for a single runner execution.
 */
export function generateTestRunDatabaseName(prefix = "sos_sales_v3_test"): { dbName: string; runId: string } {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const runId = `run_${timestamp}_${randomSuffix}`;
  const dbName = `${prefix}_${runId}`;
  return { dbName, runId };
}

/**
 * Retrieves the administrative database URL used exclusively for provisioning/dropping test databases.
 * Does NOT require modifying or elevating the application's migration role (sos_migration_owner).
 */
export function getTestAdminDatabaseUrl(): string {
  const host = process.env.TEST_DB_HOST || "localhost";
  const port = process.env.TEST_DB_PORT || TEST_PORT_DEFAULT;
  const adminUser = process.env.TEST_ADMIN_USER || process.env.POSTGRES_USER || "sos_user";
  const adminPassword = process.env.TEST_ADMIN_PASSWORD || process.env.POSTGRES_PASSWORD || "sos_secret_lab_2026";

  const adminUrl =
    process.env.TEST_ADMIN_DATABASE_URL ||
    `postgresql://${adminUser}:${adminPassword}@${host}:${port}/postgres?sslmode=disable`;

  // Static pre-flight validation
  validateTestAdminDatabaseUrl(adminUrl);
  return adminUrl;
}

/**
 * Validates server-side context after connection: current_database, current_role and privileges.
 */
export async function confirmTestDatabaseContext(
  pool: Pool,
  expectedDbName: string,
  expectedRole?: string
): Promise<void> {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        current_database() as current_db,
        current_user as current_role,
        (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) as is_superuser,
        (SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user) as can_createdb
    `);

    const row = res.rows[0];
    if (!row) {
      throw new Error("FATAL: Could not verify database context from PostgreSQL.");
    }

    if (row.current_db !== expectedDbName) {
      throw new Error(
        `FATAL SAFETY VIOLATION: Server reports current_database() = '${row.current_db}', expected '${expectedDbName}'. Connection aborted.`
      );
    }

    if (expectedRole && row.current_role !== expectedRole) {
      throw new Error(
        `FATAL SAFETY VIOLATION: Server reports current_user = '${row.current_role}', expected '${expectedRole}'. Connection aborted.`
      );
    }

    // Strict runtime role safety: sos_app_user must NEVER be superuser or have createdb
    if (row.current_role === "sos_app_user") {
      if (row.is_superuser) {
        throw new Error("FATAL PRIVILEGE VIOLATION: sos_app_user has SUPERUSER privilege! Must be restricted.");
      }
      if (row.can_createdb) {
        throw new Error("FATAL PRIVILEGE VIOLATION: sos_app_user has CREATEDB privilege! Must be restricted.");
      }
    }
  } finally {
    client.release();
  }
}

/**
 * Safely executes a negative DDL test statement within a transaction that guarantees ROLLBACK.
 * Even if the DDL statement unexpectedly succeeds, the transaction is rolled back immediately,
 * preventing any destruction of tables or schema before reporting the privilege regression.
 */
export async function runSafeNegativeDdlTest(client: PoolClient, dangerousSql: string): Promise<void> {
  await client.query("BEGIN;");
  let succeededUnexpectedly = false;
  try {
    await client.query(dangerousSql);
    succeededUnexpectedly = true;
  } catch (err) {
    // Expected error, roll back the transaction
    await client.query("ROLLBACK;");
    // Re-throw so the caller test can assert expected permission denied error
    throw err;
  }

  if (succeededUnexpectedly) {
    await client.query("ROLLBACK;");
    throw new Error(
      `PRIVILEGE REGRESSION DETECTED: The statement '${dangerousSql}' executed successfully when it should have been blocked by PostgreSQL privileges!`
    );
  }
}

export function getTestDatabaseUrls(targetDb = TEST_DB_DEFAULT): {
  appDatabaseUrl: string;
  migrationDatabaseUrl: string;
  ingressDatabaseUrl: string;
  workerDatabaseUrl: string;
} {
  const host = process.env.TEST_DB_HOST || "localhost";
  const port = process.env.TEST_DB_PORT || TEST_PORT_DEFAULT;
  const dbName = process.env.TEST_DB_NAME || targetDb;

  const appUrl =
    process.env.TEST_DATABASE_URL ||
    `postgresql://sos_app_user:sos_app_secret_2026@${host}:${port}/${dbName}?sslmode=disable`;

  const migrationUrl =
    process.env.TEST_MIGRATION_DATABASE_URL ||
    `postgresql://sos_migration_owner:sos_migration_secret_2026@${host}:${port}/${dbName}?sslmode=disable`;

  const ingressUrl =
    process.env.TEST_INGRESS_DATABASE_URL ||
    `postgresql://sos_ingress_user:sos_ingress_secret_2026@${host}:${port}/${dbName}?sslmode=disable`;

  const workerUrl =
    process.env.TEST_WORKER_DATABASE_URL ||
    `postgresql://sos_worker_user:sos_worker_secret_2026@${host}:${port}/${dbName}?sslmode=disable`;

  // Validate URLs statically
  validateTestDatabaseUrl(appUrl, "sos_app_user");
  validateTestDatabaseUrl(migrationUrl, "sos_migration_owner");
  assertEquivalentTestDestinations(appUrl, migrationUrl);

  // In test environments, safely route pools to test database
  if (process.env.NODE_ENV === "test" || !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = appUrl;
    process.env.MIGRATION_DATABASE_URL = migrationUrl;
    process.env.INGRESS_DATABASE_URL = ingressUrl;
    process.env.WORKER_DATABASE_URL = workerUrl;
  }

  return {
    appDatabaseUrl: appUrl,
    migrationDatabaseUrl: migrationUrl,
    ingressDatabaseUrl: ingressUrl,
    workerDatabaseUrl: workerUrl,
  };
}

export function createTestDatabasePools(targetDb = TEST_DB_DEFAULT) {
  const { appDatabaseUrl, migrationDatabaseUrl, ingressDatabaseUrl, workerDatabaseUrl } =
    getTestDatabaseUrls(targetDb);

  const appPool = new Pool({
    connectionString: appDatabaseUrl,
    max: 10,
    idleTimeoutMillis: 5000,
  });

  const ownerPool = new Pool({
    connectionString: migrationDatabaseUrl,
    max: 5,
    idleTimeoutMillis: 5000,
  });

  const ingressPool = new Pool({
    connectionString: ingressDatabaseUrl,
    max: 10,
    idleTimeoutMillis: 5000,
  });

  const workerPool = new Pool({
    connectionString: workerDatabaseUrl,
    max: 10,
    idleTimeoutMillis: 5000,
  });

  return {
    appPool,
    ownerPool,
    ingressPool,
    workerPool,
    appDatabaseUrl,
    migrationDatabaseUrl,
    ingressDatabaseUrl,
    workerDatabaseUrl,
  };
}

/**
 * Locates the migration files directory across different execution contexts.
 */
function findMigrationsDirectory(): string {
  const candidates = [
    path.resolve(process.cwd(), "packages/database/migrations"),
    path.resolve(process.cwd(), "migrations"),
    path.resolve(__dirname, "../migrations"),
    path.resolve(__dirname, "../../database/migrations"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  throw new Error("FATAL: Could not locate database migrations directory.");
}

/**
 * Idempotently bootstraps a test database, applying all migrations and setting test markers.
 */
export async function bootstrapTestDatabase(
  dbName = TEST_DB_DEFAULT,
  options: { dropExisting?: boolean; runId?: string } = {}
): Promise<void> {
  assertAdministrativeOptIn("CREATE/BOOTSTRAP DATABASE", dbName);

  const host = process.env.TEST_DB_HOST || "localhost";
  const port = process.env.TEST_DB_PORT || TEST_PORT_DEFAULT;

  // Statically validate target database URL before any network operation
  validateTestDatabaseUrl(
    `postgresql://sos_migration_owner:sos_migration_secret_2026@${host}:${port}/${dbName}?sslmode=disable`
  );

  // Use isolated admin maintenance connection to check/create database
  const maintenanceUrl = getTestAdminDatabaseUrl();
  const maintenancePool = new Pool({
    connectionString: maintenanceUrl,
    max: 2,
  });

  const effectiveRunId = options.runId || process.env.TEST_RUN_ID || "default";
  const markerComment = `${TEST_DB_COMMENT_MARKER}:run_id=${effectiveRunId}:created_at=${Date.now()}`;

  let needsMigrations = true;

  try {
    await maintenancePool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sos_migration_owner') THEN
          CREATE ROLE sos_migration_owner WITH LOGIN PASSWORD 'sos_migration_secret_2026' CREATEROLE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'sos_migration_owner' AND rolcreaterole = true
        ) THEN
          ALTER ROLE sos_migration_owner WITH CREATEROLE;
        END IF;
      END $$;
    `);

    const existsRes = await maintenancePool.query(
      `SELECT d.oid, pg_catalog.shobj_description(d.oid, 'pg_database') as description
       FROM pg_database d WHERE d.datname = $1;`,
      [dbName]
    );

    if (existsRes.rowCount && existsRes.rowCount > 0) {
      const description = existsRes.rows[0]?.description || "";

      // If dropExisting is requested, verify that the existing database actually has our test marker!
      // Do NOT drop or re-mark an arbitrary database that lacks our test marker,
      // and refuse deletion if runId does not match the current execution.
      if (options.dropExisting) {
        if (!description.includes(TEST_DB_COMMENT_MARKER)) {
          throw new Error(
            `FATAL SAFETY VIOLATION: Existing database '${dbName}' lacks test comment marker '${TEST_DB_COMMENT_MARKER}'. Refusing to drop unverified database.`
          );
        }

        const existingRunIdMatch = description.match(/run_id=([^:]+)/);
        const existingRunId = existingRunIdMatch ? existingRunIdMatch[1] : null;
        const requestedRunId = options.runId ?? effectiveRunId;

        if (existingRunId && existingRunId !== requestedRunId && options.runId !== "bootstrap") {
          throw new Error(
            `FATAL SAFETY VIOLATION: Existing database '${dbName}' runId mismatch. Expected run_id='${requestedRunId}', but found '${existingRunId}'. Refusing to drop database owned by another execution.`
          );
        }

        await maintenancePool.query(
          `
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = $1 AND pid <> pg_backend_pid();
        `,
          [dbName]
        );
        await maintenancePool.query(`DROP DATABASE IF EXISTS "${dbName}";`);

        // Create fresh
        await maintenancePool.query(`CREATE DATABASE "${dbName}" OWNER sos_migration_owner;`);
        await maintenancePool.query(`COMMENT ON DATABASE "${dbName}" IS '${markerComment}';`);
      }
      // If exists and !dropExisting, verify test marker and runId
      else if (!description.includes(TEST_DB_COMMENT_MARKER)) {
        throw new Error(
          `FATAL SAFETY VIOLATION: Existing database '${dbName}' lacks test comment marker '${TEST_DB_COMMENT_MARKER}'. Refusing to use unverified database.`
        );
      } else {
        const existingRunIdMatch = description.match(/run_id=([^:]+)/);
        const existingRunId = existingRunIdMatch ? existingRunIdMatch[1] : null;
        if (options.runId && existingRunId && existingRunId !== options.runId) {
          throw new Error(
            `FATAL SAFETY VIOLATION: Existing database '${dbName}' runId mismatch. Expected run_id='${options.runId}', but found '${existingRunId}'. Refusing to attach to database owned by another execution.`
          );
        }
        // Database already exists with valid test marker; do not re-run migrations or overwrite comment
        needsMigrations = false;
      }
    } else {
      // Database does not exist: create test database owned by migration owner
      await maintenancePool.query(`CREATE DATABASE "${dbName}" OWNER sos_migration_owner;`);
      await maintenancePool.query(`COMMENT ON DATABASE "${dbName}" IS '${markerComment}';`);
    }
  } finally {
    await maintenancePool.end();
  }

  if (!needsMigrations) {
    return;
  }

  // Connect to the target test database as migration owner to apply migrations
  const targetUrl = `postgresql://sos_migration_owner:sos_migration_secret_2026@${host}:${port}/${dbName}?sslmode=disable`;
  const targetPool = new Pool({
    connectionString: targetUrl,
    max: 2,
  });

  try {
    const migrationsDir = findMigrationsDirectory();
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");
      await targetPool.query(sql);
    }

    // Provision disposable credentials for test runner roles only (outside production migration)
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await targetPool.query(`
          DO $$
          BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sos_ingress_user' AND NOT rolcanlogin) THEN
              ALTER ROLE sos_ingress_user WITH LOGIN PASSWORD 'sos_ingress_secret_2026';
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sos_worker_user' AND NOT rolcanlogin) THEN
              ALTER ROLE sos_worker_user WITH LOGIN PASSWORD 'sos_worker_secret_2026';
            END IF;
          END $$;
        `);
        break;
      } catch (roleErr: any) {
        if (roleErr?.message?.includes("tuple concurrently updated") && attempt < 4) {
          await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
          continue;
        }
        break;
      }
    }

    // PostgreSQL 16 can auto-create memberships with SET FALSE for role creators.
    // Test fixtures explicitly exercise SET ROLE; enable only on the isolated test server.
    const roleAdminPool = new Pool({ connectionString: getTestAdminDatabaseUrl(), max: 1 });
    try {
      await roleAdminPool.query("GRANT sos_ingress_user, sos_worker_user TO sos_migration_owner WITH SET TRUE;");
    } finally { await roleAdminPool.end(); }

    // Apply test marker comment
    await targetPool.query(`
      COMMENT ON DATABASE "${dbName}" IS '${markerComment}';
    `);
  } finally {
    await targetPool.end();
  }
}

/**
 * Safely disposes a test-only database, terminating active connections and dropping the database.
 * Strictly verifies test-only prefix, administrative opt-in, and presence of the test comment marker.
 */
export async function disposeTestDatabase(
  dbName: string,
  options: { expectedRunId?: string } = {}
): Promise<void> {
  assertAdministrativeOptIn("DROP DATABASE", dbName);

  const host = process.env.TEST_DB_HOST || "localhost";
  const port = process.env.TEST_DB_PORT || TEST_PORT_DEFAULT;

  // Statically validate target database URL before any network operation
  validateTestDatabaseUrl(
    `postgresql://sos_migration_owner:sos_migration_secret_2026@${host}:${port}/${dbName}?sslmode=disable`
  );

  // Validate admin maintenance connection statically
  const maintenanceUrl = getTestAdminDatabaseUrl();
  const maintenancePool = new Pool({
    connectionString: maintenanceUrl,
    max: 2,
  });

  try {
    // 1. Verify existence and marker on PostgreSQL server before attempting DROP
    const existsRes = await maintenancePool.query(
      `SELECT d.oid, pg_catalog.shobj_description(d.oid, 'pg_database') as description
       FROM pg_database d WHERE d.datname = $1;`,
      [dbName]
    );

    if (existsRes.rowCount === 0) {
      // Nothing to dispose
      return;
    }

    const description = existsRes.rows[0]?.description || "";
    if (!description.includes(TEST_DB_COMMENT_MARKER)) {
      throw new Error(
        `FATAL SAFETY VIOLATION: Database '${dbName}' exists but lacks the required test marker '${TEST_DB_COMMENT_MARKER}'. Refusing to drop unverified database.`
      );
    }

    if (options.expectedRunId && !description.includes(`run_id=${options.expectedRunId}`)) {
      throw new Error(
        `FATAL SAFETY VIOLATION: Database '${dbName}' runId mismatch. Expected run_id='${options.expectedRunId}', but found '${description}'. Refusing to drop.`
      );
    }

    // 2. Terminate existing connections to test database
    await maintenancePool.query(
      `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid();
    `,
      [dbName]
    );

    // 3. Drop database
    await maintenancePool.query(`DROP DATABASE IF EXISTS "${dbName}";`);
  } finally {
    await maintenancePool.end();
  }
}

/**
 * Safely cleans up any orphaned test-run databases created by crashed or SIGKILLed test runners.
 * TEMPORARILY DISABLED: Age alone does not authorize database deletion without verifiable proof of runner process termination.
 */
export async function cleanOrphanTestDatabases(_options: { maxAgeMs?: number } = {}): Promise<string[]> {
  assertAdministrativeOptIn("CLEAN ORPHAN DATABASES", TEST_DB_DEFAULT);

  throw new Error(
    "SAFETY POLICY: Automated orphan cleanup based on age is temporarily disabled until active runner process verification is implemented. Age alone does not authorize deletion."
  );
}

export interface TestRunnerSessionOptions {
  targetDb?: string;
  runId?: string;
  spawnRunner?: (targetDb: string, runId: string) => Promise<number>;
  simulateSignalDuringBootstrap?: "SIGINT" | "SIGTERM";
  registerSignalHandlers?: boolean;
}

export interface TestRunnerSessionResult {
  exitCode: number;
  dbName: string;
  runId: string;
  abortedBeforeSpawn: boolean;
  spawned: boolean;
  disposed: boolean;
}

/**
 * Orchestrates a complete, safe test runner session:
 * 1. Generates or validates an isolated test database with unique runId.
 * 2. Bootstraps schema and test markers.
 * 3. Checks for termination signals (SIGINT/SIGTERM) BEFORE spawning child process.
 *    If cancelled, never spawns child process and jumps directly to safe disposal.
 * 4. Disposes the test database guaranteed in finally.
 */
export async function executeTestRunnerSession(
  options: TestRunnerSessionOptions = {}
): Promise<TestRunnerSessionResult> {
  assertAdministrativeOptIn("EXECUTE TEST RUNNER SESSION", TEST_DB_DEFAULT);

  let targetDb: string;
  let runId: string;

  if (options.targetDb) {
    targetDb = options.targetDb;
    runId = options.runId || `custom_${options.targetDb}`;
  } else {
    const generated = generateTestRunDatabaseName("sos_sales_v3_test");
    targetDb = generated.dbName;
    runId = generated.runId;
  }

  console.log(`[test-db-runner] Assigned isolated run database '${targetDb}' (runId: '${runId}').`);

  let isTerminating = false;
  let terminationSignal: string | null = null;
  let activeChild: ChildProcess | null = null;

  const signalHandler = (signal: string) => {
    terminationSignal = signal;
    if (isTerminating) return;
    isTerminating = true;
    console.warn(`[test-db-runner] Received ${signal}. Initiating safe disposal and shutdown...`);
    if (activeChild && !activeChild.killed) {
      activeChild.kill(signal as NodeJS.Signals);
    }
  };

  const registerHandlers = options.registerSignalHandlers ?? false;
  const sigintListener = () => signalHandler("SIGINT");
  const sigtermListener = () => signalHandler("SIGTERM");

  if (registerHandlers) {
    process.on("SIGINT", sigintListener);
    process.on("SIGTERM", sigtermListener);
  }

  let spawned = false;
  let abortedBeforeSpawn = false;
  let disposed = false;
  let exitCode = 1;

  try {
    // Immediate pre-bootstrap check
    if (isTerminating) {
      abortedBeforeSpawn = true;
      throw new Error(`Execution aborted by ${terminationSignal || "signal"} before database bootstrap.`);
    }

    // 1. Bootstrap fresh test database
    console.log(`[test-db-runner] Bootstrapping fresh test database '${targetDb}'...`);
    await bootstrapTestDatabase(targetDb, { dropExisting: true, runId });
    console.log(`[test-db-runner] Database '${targetDb}' ready with test marker.`);

    // Hook for testing signal delivery during bootstrap
    if (options.simulateSignalDuringBootstrap) {
      signalHandler(options.simulateSignalDuringBootstrap);
    }

    // 2. CRITICAL SIGNAL GUARD: Check if cancelled during bootstrap BEFORE spawning child
    if (isTerminating) {
      abortedBeforeSpawn = true;
      console.warn(
        `[test-db-runner] Execution aborted by ${terminationSignal || "signal"} during bootstrap. Child process will NOT be spawned.`
      );
      throw new Error(
        `Execution aborted by ${terminationSignal || "signal"} during bootstrap. Aborting before test runner spawn.`
      );
    }

    // 3. Spawn test runner child process
    spawned = true;
    if (options.spawnRunner) {
      exitCode = await options.spawnRunner(targetDb, runId);
    } else {
      exitCode = await new Promise<number>((resolve, reject) => {
        if (isTerminating) {
          reject(new Error(`Execution aborted by ${terminationSignal || "signal"} before spawn.`));
          return;
        }

        const extraArgs = process.env.VITEST_ARGS
          ? process.env.VITEST_ARGS.split(" ").filter(Boolean)
          : [];

        const vitest = spawn("pnpm", ["vitest", "run", "--no-file-parallelism", ...extraArgs], {
          stdio: "inherit",
          env: {
            ...process.env,
            TEST_DB_NAME: targetDb,
            TEST_RUN_ID: runId,
            NODE_ENV: "test",
          },
        });

        activeChild = vitest;

        vitest.on("error", (err) => {
          console.error("[test-db-runner] Failed to spawn vitest process:", err.message);
          reject(err);
        });

        vitest.on("close", (code) => {
          activeChild = null;
          resolve(code ?? 1);
        });
      });
    }
  } catch (_err) {
    if (terminationSignal === "SIGINT") {
      exitCode = 130;
    } else if (terminationSignal === "SIGTERM") {
      exitCode = 143;
    } else {
      exitCode = 1;
    }
  } finally {
    if (registerHandlers) {
      process.removeListener("SIGINT", sigintListener);
      process.removeListener("SIGTERM", sigtermListener);
    }

    // 4. Guaranteed safe disposal in finally block
    console.log(`[test-db-runner] Initiating disposal of test database '${targetDb}' (runId: '${runId}')...`);
    try {
      await disposeTestDatabase(targetDb, { expectedRunId: runId });
      disposed = true;
      console.log(`[test-db-runner] Database '${targetDb}' successfully disposed. No orphan resources remain.`);
    } catch (cleanupErr) {
      console.error(
        `[test-db-runner] CLEANUP FAILURE: Could not dispose database '${targetDb}':`,
        cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
      );
      if (exitCode === 0) {
        exitCode = 1;
      }
    }
  }

  return {
    exitCode,
    dbName: targetDb,
    runId,
    abortedBeforeSpawn,
    spawned,
    disposed,
  };
}

/**
 * Safely and deterministically resets all shared operational queues and delivery events:
 * 1. public.provider_delivery_events
 * 2. public.outbound_commands
 * 3. public.channel_webhook_inbox
 *
 * Runs inside a single transaction using the provided ownerPool (sos_migration_owner).
 * Releases the client connection immediately upon completion.
 * Fails closed if the operation cannot be completed.
 */
export async function resetTestQueueState(ownerPool: Pool): Promise<void> {
  const client = await ownerPool.connect();
  try {
    await client.query("BEGIN;");
    await client.query("DELETE FROM public.provider_delivery_events;");
    await client.query("DELETE FROM public.broadcast_message_tests;");
    await client.query("DELETE FROM public.outbound_commands;");
    await client.query("DELETE FROM public.channel_webhook_inbox;");
    await client.query("COMMIT;");
  } catch (err) {
    try {
      await client.query("ROLLBACK;");
    } catch {
      // rollback error suppressed to rethrow original error
    }
    throw new Error(
      `FATAL_QUEUE_RESET_FAILED: Failed to reset test queue state: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    client.release();
  }
}

