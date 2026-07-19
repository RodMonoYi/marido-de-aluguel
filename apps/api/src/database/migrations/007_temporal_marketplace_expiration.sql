CREATE INDEX IF NOT EXISTS service_requests_temporal_expiration_idx
  ON marketplace.service_requests (proposal_deadline, id)
  WHERE status = 'PUBLISHED';
