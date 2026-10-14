export const ZCV_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS zcv_previews (
  id TEXT PRIMARY KEY,
  claim_secret_hash TEXT NOT NULL,
  owner_user_id TEXT,
  source_image_key TEXT NOT NULL,
  intermediate_image_key TEXT,
  preview_image_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  kie_image_task_id TEXT,
  image_cost_credits INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  rights_accepted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zcv_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  preview_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  paid_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  job_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS zcv_orders_preview_user_idx
  ON zcv_orders (preview_id, user_id);

CREATE TABLE IF NOT EXISTS zcv_jobs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  preview_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  moderation_status TEXT NOT NULL DEFAULT 'pending',
  phase TEXT NOT NULL DEFAULT 'video',
  kie_image_task_id TEXT,
  kie_video_task_id TEXT,
  image_cost_credits INTEGER NOT NULL DEFAULT 0,
  video_cost_credits INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  video_key TEXT,
  error_message TEXT,
  last_reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zcv_stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  order_id TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zcv_provider_logs (
  id SERIAL PRIMARY KEY,
  task_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL,
  cost_credits NUMERIC(12,4),
  order_id TEXT,
  preview_id TEXT,
  job_id TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zcv_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS zcv_daily_budget (
  day DATE PRIMARY KEY,
  preview_count INTEGER NOT NULL DEFAULT 0,
  preview_cost_credits INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS zcv_bot_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
`;

export type SqlRow = Record<string, unknown>;

export interface SqlClient {
  query<T extends SqlRow = SqlRow>(
    text: string,
    params?: unknown[]
  ): Promise<T[]>;
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
}

export function fromPgLite(client: {
  query: (
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: SqlRow[] }>;
  transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
}): SqlClient {
  const wrap = (inner: {
    query: (
      text: string,
      params?: unknown[]
    ) => Promise<{ rows: SqlRow[] }>;
    transaction?: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  }): SqlClient => ({
    async query<T extends SqlRow = SqlRow>(text: string, params: unknown[] = []) {
      const result = await inner.query(text, params);
      return result.rows as T[];
    },
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>) {
      if (!inner.transaction) {
        return fn(wrap(inner));
      }
      return inner.transaction(async (tx) =>
        fn(
          wrap(
            tx as {
              query: (
                text: string,
                params?: unknown[]
              ) => Promise<{ rows: SqlRow[] }>;
            }
          )
        )
      );
    },
  });
  return wrap(client);
}

export function fromPostgresJs(sql: {
  unsafe: (text: string, params?: never[]) => Promise<SqlRow[]>;
  begin: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
}): SqlClient {
  return {
    async query<T extends SqlRow = SqlRow>(text: string, params: unknown[] = []) {
      const rows = await sql.unsafe(text, params as never[]);
      return rows as T[];
    },
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>) {
      return sql.begin(async (tx) => {
        const scoped = tx as {
          unsafe: (text: string, params?: unknown[]) => Promise<SqlRow[]>;
        };
        return fn({
          async query<R extends SqlRow = SqlRow>(
            text: string,
            params: unknown[] = []
          ) {
            const rows = await scoped.unsafe(text, params);
            return rows as R[];
          },
          async transaction<R>(inner: (innerTx: SqlClient) => Promise<R>) {
            return inner(this);
          },
        });
      });
    },
  };
}
