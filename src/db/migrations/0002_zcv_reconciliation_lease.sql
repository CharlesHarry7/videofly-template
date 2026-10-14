-- Fenced, expiring ownership for provider reconciliation jobs.
ALTER TABLE zcv_jobs
  ADD COLUMN IF NOT EXISTS reconciliation_token TEXT,
  ADD COLUMN IF NOT EXISTS reconciliation_lease_until TIMESTAMPTZ;
