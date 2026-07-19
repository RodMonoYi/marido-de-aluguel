ALTER TABLE platform.idempotency_records
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE platform.idempotency_records
SET expires_at = COALESCE(completed_at, created_at) + interval '24 hours'
WHERE expires_at IS NULL;

ALTER TABLE platform.idempotency_records
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours'),
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE platform.idempotency_records
  DROP CONSTRAINT IF EXISTS idempotency_records_expiry_check;
ALTER TABLE platform.idempotency_records
  ADD CONSTRAINT idempotency_records_expiry_check
  CHECK (expires_at > created_at);

CREATE INDEX IF NOT EXISTS idempotency_records_expiry_idx
  ON platform.idempotency_records (expires_at, actor_id, operation, idempotency_key);
