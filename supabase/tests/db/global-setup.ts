import pg from 'pg';
import { STUB_FILE, TEMPLATE_DB, adminUrl, migrationFiles, runSqlFile } from './harness';

/**
 * Builds a template database once per test run: platform stub + every
 * migration in order. Each test file then clones it, so tests are isolated
 * and fast.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const root = new pg.Client({ connectionString: adminUrl() });
  await root.connect();
  await root.query(`drop database if exists ${TEMPLATE_DB} with (force)`);
  await root.query(`create database ${TEMPLATE_DB}`);
  await root.end();

  const db = new pg.Client({ connectionString: adminUrl(TEMPLATE_DB) });
  await db.connect();
  await runSqlFile(db, STUB_FILE);
  for (const file of migrationFiles()) {
    await runSqlFile(db, file);
  }
  await db.end();

  return async () => {
    const c = new pg.Client({ connectionString: adminUrl() });
    await c.connect();
    await c.query(`drop database if exists ${TEMPLATE_DB} with (force)`);
    await c.end();
  };
}
