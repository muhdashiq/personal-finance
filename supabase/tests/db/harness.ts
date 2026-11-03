import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(here, '..', '..', 'migrations');
export const STUB_FILE = join(here, '..', 'platform-stub.sql');
export const TEMPLATE_DB = 'ff_test_template';

/** Admin connection string to a PostgreSQL 15+ server (not a Supabase project). */
export const adminUrl = (database = 'postgres'): string => {
  const base = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54322/postgres';
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
};

export const migrationFiles = (): string[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(MIGRATIONS_DIR, f));

export const runSqlFile = async (client: pg.Client, file: string): Promise<void> => {
  try {
    await client.query(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Failed applying ${file}: ${(error as Error).message}`);
  }
};

export type TestUser = { id: string; email: string; name: string };

export type TestDb = {
  pool: pg.Pool;
  name: string;
  /** Run statements as the postgres superuser (bypasses RLS). */
  admin: <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]) => Promise<T[]>;
  /** Run a callback inside a transaction as an authenticated user, like PostgREST does. */
  as: <T>(user: TestUser, fn: (q: Query) => Promise<T>) => Promise<T>;
  createUser: (name: string) => Promise<TestUser>;
  close: () => Promise<void>;
};

export type Query = <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]) => Promise<T[]>;

/** Creates an isolated database cloned from the migrated template. */
export const createTestDb = async (): Promise<TestDb> => {
  const name = `ff_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const root = new pg.Client({ connectionString: adminUrl() });
  await root.connect();
  await root.query(`create database ${name} template ${TEMPLATE_DB}`);
  await root.end();

  const pool = new pg.Pool({ connectionString: adminUrl(name), max: 4 });

  const admin: TestDb['admin'] = async (sql, params) => (await pool.query(sql, params)).rows;

  const as: TestDb['as'] = async (user, fn) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' }),
      ]);
      await client.query('set local role authenticated');
      const query: Query = async (sql, params) => (await client.query(sql, params)).rows;
      const result = await fn(query);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  };

  const createUser: TestDb['createUser'] = async (displayName) => {
    const id = randomUUID();
    const email = `${displayName.toLowerCase().replace(/\s+/g, '.')}.${id.slice(0, 6)}@example.test`;
    await admin(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      id,
      email,
      JSON.stringify({ display_name: displayName }),
    ]);
    return { id, email, name: displayName };
  };

  const close = async () => {
    await pool.end();
    const c = new pg.Client({ connectionString: adminUrl() });
    await c.connect();
    await c.query(`drop database if exists ${name} with (force)`);
    await c.end();
  };

  return { pool, name, admin, as, createUser, close };
};

/** Convenience: a user who has created a family. */
export const createFamilyFor = async (
  db: TestDb,
  user: TestUser,
  familyName = `${user.name}'s Family`,
): Promise<{ familyId: string; memberId: string }> =>
  db.as(user, async (q) => {
    const [row] = await q<{ id: string }>(`select public.create_family($1, 'INR') as id`, [familyName]);
    const familyId = row!.id;
    const [member] = await q<{ id: string }>(
      `select id from public.family_members where family_id = $1 and user_id = $2`,
      [familyId, user.id],
    );
    return { familyId, memberId: member!.id };
  });

export const categoryId = async (db: TestDb, familyId: string, name: string, parent?: string): Promise<string> => {
  const rows = parent
    ? await db.admin<{ id: string }>(
        `select c.id from public.transaction_categories c
           join public.transaction_categories p on p.id = c.parent_id
          where c.family_id = $1 and c.name = $2 and p.name = $3`,
        [familyId, name, parent],
      )
    : await db.admin<{ id: string }>(
        `select id from public.transaction_categories where family_id = $1 and name = $2 and parent_id is null`,
        [familyId, name],
      );
  if (!rows[0]) throw new Error(`Category ${name} not found`);
  return rows[0].id;
};

/** Asserts that a promise rejects with a Postgres error and returns its message. */
export const pgError = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('Expected the statement to fail, but it succeeded');
};
