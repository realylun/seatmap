import { neon, Pool as NeonPool } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNeonPool } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

/** Driver-agnostic database: every driver below satisfies it. `$client.end()` closes the pool/connection. */
export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema> & {
  $client: { end(): Promise<void> };
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const POOL_MAX = 10;

/** Local Postgres (docker) talks plain TCP; Neon needs its HTTP/WebSocket drivers. */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** One factory for every consumer (app, seed, contention test). */
export function createPoolDb(url: string): AppDb {
  if (isLocalDatabaseUrl(url)) {
    return drizzleNodePg(new PgPool({ connectionString: url, max: POOL_MAX }), {
      schema,
    });
  }
  return drizzleNeonPool(new NeonPool({ connectionString: url }), {
    schema,
  });
}

function createHttpDb(url: string): AppDb {
  if (isLocalDatabaseUrl(url)) return createPoolDb(url);
  // neon-http has no pool: end() is a no-op
  return Object.assign(drizzleNeonHttp(neon(url), { schema }), {
    $client: { end: async () => {} },
  });
}

let httpDb: AppDb | undefined;
let poolDb: AppDb | undefined;

/** Single-statement queries (HTTP on Neon; shares the local pool otherwise). */
export function getDb(): AppDb {
  httpDb ??= isLocalDatabaseUrl(env.databaseUrl)
    ? getPoolDb()
    : createHttpDb(env.databaseUrl);
  return httpDb;
}

/** Supports interactive transactions. */
export function getPoolDb(): AppDb {
  poolDb ??= createPoolDb(env.databaseUrl);
  return poolDb;
}
