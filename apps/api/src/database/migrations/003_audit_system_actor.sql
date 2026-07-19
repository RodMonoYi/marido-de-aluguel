ALTER TABLE audit.audit_logs
  ALTER COLUMN actor_id DROP NOT NULL;

ALTER TABLE audit.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_actor_consistency;

ALTER TABLE audit.audit_logs
  ADD CONSTRAINT audit_logs_actor_consistency CHECK (
    (actor_role = 'SYSTEM' AND actor_id IS NULL)
    OR (actor_role <> 'SYSTEM' AND actor_id IS NOT NULL)
  );
