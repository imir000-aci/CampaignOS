import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

export type DrizzleClient = ReturnType<typeof drizzle>;

const clients = new Map<string, DrizzleClient>();

export function getDb(connectionString: string, schema?: Record<string, unknown>): DrizzleClient {
  let client = clients.get(connectionString);
  if (client) return client;

  const sql = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  client = schema ? drizzle(sql, { schema }) : drizzle(sql);
  clients.set(connectionString, client);
  return client;
}

export function getServiceDb(
  envVar: string,
  schema?: Record<string, unknown>
): DrizzleClient {
  const url = process.env[envVar];
  if (!url) throw new Error(`Missing environment variable: ${envVar}`);
  return getDb(url, schema);
}
