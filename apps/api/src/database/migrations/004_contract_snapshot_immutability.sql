CREATE OR REPLACE FUNCTION contracting.protect_contract_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contracts are immutable evidence and cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.request_id IS DISTINCT FROM NEW.request_id
    OR OLD.proposal_id IS DISTINCT FROM NEW.proposal_id
    OR OLD.accepted_revision_id IS DISTINCT FROM NEW.accepted_revision_id
    OR OLD.customer_actor_id IS DISTINCT FROM NEW.customer_actor_id
    OR OLD.professional_actor_id IS DISTINCT FROM NEW.professional_actor_id
    OR OLD.professional_id IS DISTINCT FROM NEW.professional_id
    OR OLD.snapshot IS DISTINCT FROM NEW.snapshot
    OR OLD.snapshot_hash IS DISTINCT FROM NEW.snapshot_hash
    OR OLD.acceptance_text_version IS DISTINCT FROM NEW.acceptance_text_version
    OR OLD.accepted_at IS DISTINCT FROM NEW.accepted_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'contract evidence is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_evidence_immutable
  ON contracting.contracts;
CREATE TRIGGER contracts_evidence_immutable
  BEFORE UPDATE OR DELETE ON contracting.contracts
  FOR EACH ROW EXECUTE FUNCTION contracting.protect_contract_evidence();
