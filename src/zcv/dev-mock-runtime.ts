import { PGlite } from "@electric-sql/pglite";

import { fromPgLite, ZCV_SCHEMA_SQL, type SqlClient } from "./sql";
import type { ObjectStorage } from "./types";

export interface DevMockAdapters {
  sql: SqlClient;
  storage: ObjectStorage;
}

type RuntimeGlobal = typeof globalThis & {
  __zcvDevMockRuntime?: Promise<DevMockAdapters>;
};

function getRuntime(): Promise<DevMockAdapters> {
  const runtimeGlobal = globalThis as RuntimeGlobal;
  if (!runtimeGlobal.__zcvDevMockRuntime) {
    runtimeGlobal.__zcvDevMockRuntime = (async () => {
      const client = new PGlite();
      await client.exec(ZCV_SCHEMA_SQL);
      const files = new Map<string, Buffer>();
      return {
        sql: fromPgLite(client),
        storage: {
          async put(key, body) {
            files.set(key, Buffer.from(body));
          },
          async get(key) {
            const body = files.get(key);
            if (!body) throw new Error(`Missing local mock object: ${key}`);
            return Buffer.from(body);
          },
        },
      };
    })();
  }
  return runtimeGlobal.__zcvDevMockRuntime;
}

export async function getDevMockAdapters(): Promise<DevMockAdapters> {
  return getRuntime();
}
