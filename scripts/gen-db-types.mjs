#!/usr/bin/env node
/**
 * Generates Supabase-compatible TypeScript types (same shape as
 * `supabase gen types typescript`) by introspecting a PostgreSQL database
 * that has the migrations applied. Works without Docker or the Supabase CLI.
 *
 *   DATABASE_URL=postgres://postgres@127.0.0.1:54322/postgres npm run db:types
 *
 * With the Supabase CLI you can use the official generator instead:
 *   supabase gen types typescript --local > apps/mobile/src/types/database.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? join(root, 'apps/mobile/src/types/database.ts');
const url = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54322/postgres';
const SCHEMA = 'public';

const client = new pg.Client({ connectionString: url });
await client.connect();

const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const enums = await q(
  `select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
     from pg_type t join pg_enum e on e.enumtypid = t.oid
     join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = $1 group by t.typname order by t.typname`,
  [SCHEMA],
);
const enumNames = new Set(enums.map((e) => e.name));

const scalar = (udt) => {
  const base = udt.replace(/^_/, '');
  const isArray = udt.startsWith('_');
  let ts;
  if (enumNames.has(base)) ts = `Database["${SCHEMA}"]["Enums"]["${base}"]`;
  else if (['int2', 'int4', 'int8', 'float4', 'float8', 'numeric'].includes(base)) ts = 'number';
  else if (base === 'bool') ts = 'boolean';
  else if (['json', 'jsonb'].includes(base)) ts = 'Json';
  else if (base === 'void') ts = 'undefined';
  else if (base === 'record') ts = 'Record<string, unknown>';
  else ts = 'string';
  return isArray ? `${ts}[]` : ts;
};

const columns = await q(
  `select c.table_name, c.column_name, c.udt_name, c.is_nullable = 'YES' as nullable,
          (c.column_default is not null or c.is_identity = 'YES') as has_default,
          c.is_identity = 'YES' and c.identity_generation = 'ALWAYS' as always_identity,
          t.table_type
     from information_schema.columns c
     join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = $1
    order by c.table_name, c.ordinal_position`,
  [SCHEMA],
);

const fks = await q(
  `select con.conname, rel.relname as table_name, frel.relname as ref_table,
          array(select a.attname::text from unnest(con.conkey) with ordinality k(n, i)
                  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i) as cols,
          array(select a.attname::text from unnest(con.confkey) with ordinality k(n, i)
                  join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i) as ref_cols,
          exists (
            select 1 from pg_index ix
             where ix.indrelid = con.conrelid and ix.indisunique
               and (select array_agg(x order by x) from unnest(ix.indkey::int2[]) x)
                   = (select array_agg(x order by x) from unnest(con.conkey) x)
          ) as one_to_one
     from pg_constraint con
     join pg_class rel on rel.oid = con.conrelid
     join pg_class frel on frel.oid = con.confrelid
     join pg_namespace n on n.oid = rel.relnamespace
     join pg_namespace fn on fn.oid = frel.relnamespace
    where con.contype = 'f' and n.nspname = $1 and fn.nspname = $1
    order by rel.relname, con.conname`,
  [SCHEMA],
);

const functions = await q(
  `select p.proname as name, p.proretset as returns_set, p.pronargdefaults as n_defaults,
          coalesce(p.proargnames::text[], '{}') as arg_names, coalesce(p.proargmodes::text[], '{}') as arg_modes,
          array(select ty.typname::text
                  from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality u(t, i)
                  join pg_type ty on ty.oid = u.t order by u.i) as arg_udts,
          rt.typname as return_udt
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     join pg_type rt on rt.oid = p.prorettype
    where n.nspname = $1 and p.prokind = 'f'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and rt.typname <> 'trigger'
    order by p.proname`,
  [SCHEMA],
);

const byTable = new Map();
for (const c of columns) {
  if (!byTable.has(c.table_name)) byTable.set(c.table_name, { type: c.table_type, cols: [] });
  byTable.get(c.table_name).cols.push(c);
}

const indent = (s, n) => s.split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n');

const relationships = (table) => {
  const list = fks.filter((f) => f.table_name === table);
  if (!list.length) return '[]';
  return `[\n${list
    .map(
      (f) => `  {
    foreignKeyName: "${f.conname}"
    columns: [${f.cols.map((c) => `"${c}"`).join(', ')}]
    isOneToOne: ${f.one_to_one}
    referencedRelation: "${f.ref_table}"
    referencedColumns: [${f.ref_cols.map((c) => `"${c}"`).join(', ')}]
  }`,
    )
    .join(',\n')}\n]`;
};

const tableBlock = (name, { cols }) => {
  const row = cols.map((c) => `${c.column_name}: ${scalar(c.udt_name)}${c.nullable ? ' | null' : ''}`).join('\n');
  const insert = cols
    .filter((c) => !c.always_identity)
    .map((c) => `${c.column_name}${c.nullable || c.has_default ? '?' : ''}: ${scalar(c.udt_name)}${c.nullable ? ' | null' : ''}`)
    .join('\n');
  const update = cols
    .filter((c) => !c.always_identity)
    .map((c) => `${c.column_name}?: ${scalar(c.udt_name)}${c.nullable ? ' | null' : ''}`)
    .join('\n');
  return `${name}: {
  Row: {
${indent(row, 4)}
  }
  Insert: {
${indent(insert, 4)}
  }
  Update: {
${indent(update, 4)}
  }
  Relationships: ${indent(relationships(name), 2).trimStart()}
}`;
};

const viewBlock = (name, { cols }) => `${name}: {
  Row: {
${indent(cols.map((c) => `${c.column_name}: ${scalar(c.udt_name)} | null`).join('\n'), 4)}
  }
  Relationships: []
}`;

const functionBlock = (f) => {
  const ins = [];
  const outs = [];
  const nInputs = f.arg_modes.length ? f.arg_modes.filter((m) => m === 'i' || m === 'b').length : f.arg_udts.length;
  let inputIndex = 0;
  f.arg_udts.forEach((udt, i) => {
    const mode = f.arg_modes[i] ?? 'i';
    const name = f.arg_names[i] ?? `arg${i}`;
    if (mode === 'i' || mode === 'b') {
      const optional = inputIndex >= nInputs - f.n_defaults;
      ins.push(`${name}${optional ? '?' : ''}: ${scalar(udt)}`);
      inputIndex += 1;
    }
    if (mode === 't' || mode === 'o' || mode === 'b') outs.push(`${name}: ${scalar(udt)}`);
  });
  const args = ins.length ? `{\n${indent(ins.join('\n'), 2)}\n}` : 'never';
  let returns;
  if (outs.length) returns = `{\n${indent(outs.join('\n'), 2)}\n}${f.returns_set ? '[]' : ''}`;
  else returns = `${scalar(f.return_udt)}${f.returns_set ? '[]' : ''}`;
  return `${f.name}: {
  Args: ${indent(args, 2).trimStart()}
  Returns: ${indent(returns, 2).trimStart()}
}`;
};

const tables = [...byTable].filter(([, v]) => v.type === 'BASE TABLE');
const views = [...byTable].filter(([, v]) => v.type === 'VIEW');

const body = `// AUTO-GENERATED by scripts/gen-db-types.mjs from the migrated database.
// Do not edit by hand — run \`npm run db:types\` after changing migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12.2.3"
  }
  ${SCHEMA}: {
    Tables: {
${indent(tables.map(([n, v]) => tableBlock(n, v)).join('\n'), 6)}
    }
    Views: {
${indent(views.map(([n, v]) => viewBlock(n, v)).join('\n'), 6)}
    }
    Functions: {
${indent(functions.map(functionBlock).join('\n'), 6)}
    }
    Enums: {
${indent(enums.map((e) => `${e.name}: ${e.labels.map((l) => `"${l}"`).join(' | ')}`).join('\n'), 6)}
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
};

type PublicSchema = Database["${SCHEMA}"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
export type RpcArgs<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T]["Args"];
export type RpcReturns<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T]["Returns"];
`;

writeFileSync(out, body);
await client.end();
console.log(`Wrote ${tables.length} tables, ${views.length} views, ${functions.length} functions, ${enums.length} enums to ${out}`);
