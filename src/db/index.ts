import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getHyperdriveConnectionString } from "@/lib/cloudflare-env";

import * as schema from "./schema";

const databaseUrl =
  process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || "";

const parseSslConfig = (url: string) => {
  const mode = (
    process.env.DATABASE_SSL_MODE ||
    process.env.DATABASE_SSL ||
    ""
  )
    .toLowerCase()
    .trim();

  if (mode === "disable" || mode === "false" || mode === "0" || mode === "off") {
    return undefined;
  }

  if (mode === "require" || mode === "true" || mode === "1" || mode === "on") {
    return "require" as const;
  }

  const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");
  return isLocalhost ? undefined : ("require" as const);
};

function createDb() {
  let connectionString = getHyperdriveConnectionString();
  
  if (connectionString) {
    // Hyperdrive connection
    const sql = postgres(connectionString, {
      max: 5,
      fetch_types: false
    });
    return drizzle(sql, { schema });
  } else {
    // Regular PostgreSQL connection
    if (!databaseUrl || !databaseUrl.startsWith("postgres")) {
      throw new Error(
        "Missing or invalid DATABASE_URL. Set a valid PostgreSQL connection string in your .env file.\n" +
          "Example: DATABASE_URL='postgresql://user:password@host:port/database'"
      );
    }
    const sql = postgres(databaseUrl, {
      max: 10,
      ssl: parseSslConfig(databaseUrl),
    });
    return drizzle(sql, { schema });
  }
}

let _db: ReturnType<typeof createDb> | undefined;
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop) {
    if (getHyperdriveConnectionString()) {
      const fresh = createDb();
      const value = Reflect.get(fresh, prop, fresh);
      return typeof value === "function" ? value.bind(fresh) : value;
    }
    if (!_db) {
      _db = createDb();
    }
    const value = Reflect.get(_db, prop, _db);
    return typeof value === "function" ? value.bind(_db) : value;
  },
});

export * from "./schema";
