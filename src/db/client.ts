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

/** One factory for every consumer (app, seed, contention test). `max` = pool size (default 10). */
export function createPoolDb(url: string, max = POOL_MAX): AppDb {
  if (isLocalDatabaseUrl(url)) {
    return drizzleNodePg(
      guardConnectionErrors(new PgPool({ connectionString: url, max })),
      { schema },
    );
  }
  return drizzleNeonPool(
    guardConnectionErrors(new NeonPool({ connectionString: url, max })),
    { schema },
  );
}

type ErrorEmitter = {
  on(event: "error", listener: (error: Error) => void): unknown;
};

const logConnectionError = (error: Error) =>
  console.error("Database connection failed:", error);

// A dropped connection (e.g. Neon closing the WebSocket) emits "error" on the pool when idle and on
// the client when checked out; unhandled, either crashes the process. With listeners the pending
// query rejects instead and the pool replaces the client.
function guardConnectionErrors<
  P extends ErrorEmitter & {
    on(event: "connect", listener: (client: ErrorEmitter) => void): unknown;
  },
>(pool: P): P {
  pool.on("error", logConnectionError);
  pool.on("connect", (client) => client.on("error", logConnectionError));
  return pool;
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
