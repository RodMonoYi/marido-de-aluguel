CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS marketplace;
CREATE SCHEMA IF NOT EXISTS contracting;
CREATE SCHEMA IF NOT EXISTS scheduling;
CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE OR REPLACE FUNCTION platform.reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TABLE IF NOT EXISTS identity.demo_actors (
  id uuid PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('CLIENT', 'PROFESSIONAL')),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  professional_id uuid REFERENCES catalog.professional_profiles(id),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (role = 'CLIENT' AND professional_id IS NULL)
    OR (role = 'PROFESSIONAL' AND professional_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS demo_actors_professional_idx
  ON identity.demo_actors (professional_id)
  WHERE professional_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS marketplace.service_requests (
  id uuid PRIMARY KEY,
  customer_actor_id uuid NOT NULL REFERENCES identity.demo_actors(id),
  category_id uuid NOT NULL REFERENCES catalog.categories(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 10 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 20 AND 2000),
  sanitized_title text NOT NULL CHECK (char_length(sanitized_title) >= 1),
  sanitized_description text NOT NULL CHECK (char_length(sanitized_description) >= 1),
  location_city text NOT NULL CHECK (char_length(location_city) BETWEEN 2 AND 80),
  location_state char(2) NOT NULL CHECK (location_state ~ '^[A-Z]{2}$'),
  location_district text CHECK (
    location_district IS NULL OR char_length(location_district) BETWEEN 2 AND 80
  ),
  desired_starts_at timestamptz NOT NULL,
  desired_ends_at timestamptz NOT NULL,
  desired_timezone text NOT NULL CHECK (char_length(desired_timezone) BETWEEN 1 AND 80),
  urgency text NOT NULL CHECK (urgency IN ('FLEXIBLE', 'WITHIN_7_DAYS', 'URGENT')),
  budget_min_minor bigint CHECK (
    budget_min_minor IS NULL
    OR budget_min_minor BETWEEN 0 AND 9007199254740991
  ),
  budget_max_minor bigint CHECK (
    budget_max_minor IS NULL
    OR budget_max_minor BETWEEN 0 AND 9007199254740991
  ),
  budget_provided boolean NOT NULL DEFAULT false,
  currency char(3) NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  visibility text NOT NULL CHECK (visibility = 'PRIVATE_MATCHED'),
  status text NOT NULL CHECK (
    status IN ('DRAFT', 'PUBLISHED', 'CONVERTED', 'CANCELLED', 'EXPIRED')
  ),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  proposal_deadline timestamptz NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (desired_ends_at > desired_starts_at),
  CHECK (proposal_deadline < desired_starts_at),
  CHECK (
    budget_min_minor IS NULL
    OR budget_max_minor IS NULL
    OR budget_min_minor <= budget_max_minor
  ),
  CHECK (
    budget_provided
    OR (budget_min_minor IS NULL AND budget_max_minor IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS service_requests_customer_idx
  ON marketplace.service_requests (customer_actor_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS service_requests_match_idx
  ON marketplace.service_requests (category_id, proposal_deadline, id)
  WHERE status = 'PUBLISHED';

CREATE TABLE IF NOT EXISTS marketplace.opportunity_recipients (
  request_id uuid NOT NULL REFERENCES marketplace.service_requests(id),
  professional_id uuid NOT NULL REFERENCES catalog.professional_profiles(id),
  eligibility_reason text NOT NULL CHECK (eligibility_reason = 'CATEGORY_MATCH'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, professional_id)
);

CREATE INDEX IF NOT EXISTS opportunity_recipients_professional_idx
  ON marketplace.opportunity_recipients (professional_id, created_at DESC, request_id);

CREATE TABLE IF NOT EXISTS marketplace.proposals (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES marketplace.service_requests(id),
  professional_id uuid NOT NULL REFERENCES catalog.professional_profiles(id),
  status text NOT NULL CHECK (
    status IN (
      'SENT',
      'VIEWED',
      'NEGOTIATING',
      'REVISED',
      'CONVERTED',
      'REJECTED',
      'EXPIRED',
      'CANCELLED'
    )
  ),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  current_revision_id uuid,
  accepted_revision_id uuid,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, professional_id),
  CHECK (
    (status = 'CONVERTED' AND accepted_revision_id IS NOT NULL AND converted_at IS NOT NULL)
    OR status <> 'CONVERTED'
  )
);

CREATE TABLE IF NOT EXISTS marketplace.proposal_revisions (
  id uuid PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES marketplace.proposals(id),
  version integer NOT NULL CHECK (version > 0),
  scope text NOT NULL CHECK (char_length(scope) BETWEEN 20 AND 4000),
  included text[] NOT NULL CHECK (cardinality(included) BETWEEN 1 AND 20),
  excluded text[] NOT NULL CHECK (cardinality(excluded) <= 20),
  labor_minor bigint NOT NULL CHECK (labor_minor BETWEEN 0 AND 9007199254740991),
  materials_minor bigint NOT NULL CHECK (materials_minor BETWEEN 0 AND 9007199254740991),
  travel_minor bigint NOT NULL CHECK (travel_minor BETWEEN 0 AND 9007199254740991),
  customer_platform_fee_minor bigint NOT NULL DEFAULT 0 CHECK (
    customer_platform_fee_minor BETWEEN 0 AND 9007199254740991
  ),
  professional_commission_minor bigint NOT NULL CHECK (
    professional_commission_minor BETWEEN 0 AND 9007199254740991
  ),
  customer_total_minor bigint NOT NULL CHECK (
    customer_total_minor BETWEEN 0 AND 9007199254740991
  ),
  professional_net_estimate_minor bigint NOT NULL CHECK (
    professional_net_estimate_minor BETWEEN 0 AND 9007199254740991
  ),
  currency char(3) NOT NULL CHECK (currency = 'BRL'),
  commercial_policy_code text NOT NULL,
  commercial_policy_version integer NOT NULL CHECK (commercial_policy_version > 0),
  commercial_policy_development_only boolean NOT NULL CHECK (
    commercial_policy_development_only
  ),
  scheduled_starts_at timestamptz NOT NULL,
  scheduled_ends_at timestamptz NOT NULL,
  scheduled_timezone text NOT NULL CHECK (char_length(scheduled_timezone) BETWEEN 1 AND 80),
  valid_until timestamptz NOT NULL,
  cancellation_policy_code text NOT NULL,
  cancellation_policy_version integer NOT NULL CHECK (cancellation_policy_version > 0),
  cancellation_policy_label text NOT NULL,
  guarantee_offer text,
  snapshot_hash char(64) NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, version),
  UNIQUE (id, proposal_id),
  CHECK (scheduled_ends_at > scheduled_starts_at),
  CHECK (valid_until < scheduled_starts_at),
  CHECK (
    customer_total_minor
      = labor_minor + materials_minor + travel_minor + customer_platform_fee_minor
  ),
  CHECK (
    professional_net_estimate_minor
      = labor_minor + materials_minor + travel_minor - professional_commission_minor
  ),
  CHECK (
    professional_commission_minor <= labor_minor + materials_minor + travel_minor
  )
);

ALTER TABLE marketplace.proposals
  DROP CONSTRAINT IF EXISTS proposals_current_revision_fk;
ALTER TABLE marketplace.proposals
  ADD CONSTRAINT proposals_current_revision_fk
  FOREIGN KEY (current_revision_id, id)
  REFERENCES marketplace.proposal_revisions(id, proposal_id);

ALTER TABLE marketplace.proposals
  DROP CONSTRAINT IF EXISTS proposals_accepted_revision_fk;
ALTER TABLE marketplace.proposals
  ADD CONSTRAINT proposals_accepted_revision_fk
  FOREIGN KEY (accepted_revision_id, id)
  REFERENCES marketplace.proposal_revisions(id, proposal_id);

DROP TRIGGER IF EXISTS proposal_revisions_immutable
  ON marketplace.proposal_revisions;
CREATE TRIGGER proposal_revisions_immutable
  BEFORE UPDATE OR DELETE ON marketplace.proposal_revisions
  FOR EACH ROW EXECUTE FUNCTION platform.reject_immutable_mutation();

CREATE INDEX IF NOT EXISTS proposals_request_idx
  ON marketplace.proposals (request_id, created_at, id);

CREATE TABLE IF NOT EXISTS contracting.contracts (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE REFERENCES marketplace.service_requests(id),
  proposal_id uuid NOT NULL UNIQUE REFERENCES marketplace.proposals(id),
  accepted_revision_id uuid NOT NULL REFERENCES marketplace.proposal_revisions(id),
  customer_actor_id uuid NOT NULL REFERENCES identity.demo_actors(id),
  professional_actor_id uuid NOT NULL REFERENCES identity.demo_actors(id),
  professional_id uuid NOT NULL REFERENCES catalog.professional_profiles(id),
  status text NOT NULL CHECK (status IN ('AWAITING_PAYMENT', 'CANCELLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  snapshot jsonb NOT NULL,
  snapshot_hash char(64) NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  acceptance_text_version text NOT NULL CHECK (
    acceptance_text_version = 'DEMO-CONTRACT-PTBR-1'
  ),
  accepted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contracts_customer_idx
  ON contracting.contracts (customer_actor_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS contracts_professional_idx
  ON contracting.contracts (professional_actor_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS scheduling.calendar_resources (
  id uuid PRIMARY KEY,
  professional_id uuid NOT NULL UNIQUE REFERENCES catalog.professional_profiles(id),
  timezone text NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 80),
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity = 1),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduling.calendar_reservations (
  id uuid PRIMARY KEY,
  resource_id uuid NOT NULL REFERENCES scheduling.calendar_resources(id),
  contract_id uuid NOT NULL UNIQUE REFERENCES contracting.contracts(id)
    DEFERRABLE INITIALLY DEFERRED,
  proposal_revision_id uuid NOT NULL REFERENCES marketplace.proposal_revisions(id),
  kind text NOT NULL CHECK (kind = 'HOLD'),
  status text NOT NULL CHECK (
    status IN ('HOLD_ACTIVE', 'HOLD_EXPIRED', 'HOLD_RELEASED')
  ),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 80),
  period tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (expires_at > created_at)
);

ALTER TABLE scheduling.calendar_reservations
  DROP CONSTRAINT IF EXISTS calendar_reservations_no_overlap;
ALTER TABLE scheduling.calendar_reservations
  ADD CONSTRAINT calendar_reservations_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    period WITH &&
  )
  WHERE (status = 'HOLD_ACTIVE');

CREATE INDEX IF NOT EXISTS calendar_reservations_expiry_idx
  ON scheduling.calendar_reservations (expires_at, id)
  WHERE status = 'HOLD_ACTIVE';

CREATE TABLE IF NOT EXISTS payments.payment_orders (
  id uuid PRIMARY KEY,
  contract_id uuid NOT NULL UNIQUE REFERENCES contracting.contracts(id),
  purpose text NOT NULL CHECK (purpose = 'CONTRACT'),
  sequence integer NOT NULL DEFAULT 1 CHECK (sequence = 1),
  status text NOT NULL CHECK (status IN ('AWAITING_PAYMENT', 'EXPIRED', 'CANCELLED')),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 0 AND 9007199254740991),
  currency char(3) NOT NULL CHECK (currency = 'BRL'),
  checkout_available boolean NOT NULL DEFAULT false CHECK (NOT checkout_available),
  breakdown jsonb NOT NULL,
  provider text,
  captured_minor bigint NOT NULL DEFAULT 0 CHECK (captured_minor = 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, purpose, sequence)
);

CREATE TABLE IF NOT EXISTS platform.idempotency_records (
  actor_id uuid,
  operation text NOT NULL,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 128),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
  response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (actor_id, operation, idempotency_key),
  CHECK (
    (status = 'IN_PROGRESS' AND response_payload IS NULL AND completed_at IS NULL)
    OR (status = 'COMPLETED' AND response_payload IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS audit.audit_logs (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('CLIENT', 'PROFESSIONAL', 'SYSTEM')),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  idempotency_key text,
  after_digest char(64) CHECK (
    after_digest IS NULL OR after_digest ~ '^[0-9a-f]{64}$'
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_actor_consistency CHECK (
    (actor_role = 'SYSTEM' AND actor_id IS NULL)
    OR (actor_role <> 'SYSTEM' AND actor_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS audit_logs_resource_idx
  ON audit.audit_logs (resource_type, resource_id, created_at);

CREATE INDEX IF NOT EXISTS audit_logs_correlation_idx
  ON audit.audit_logs (correlation_id, created_at);

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit.audit_logs;
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit.audit_logs
  FOR EACH ROW EXECUTE FUNCTION platform.reject_immutable_mutation();

CREATE TABLE IF NOT EXISTS platform.outbox_events (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  event_version integer NOT NULL CHECK (event_version > 0),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
  correlation_id uuid NOT NULL,
  causation_id uuid,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'PUBLISHED', 'FAILED')
  ),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  occurred_at timestamptz NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aggregate_type, aggregate_id, aggregate_version, event_type)
);

CREATE INDEX IF NOT EXISTS outbox_events_pending_idx
  ON platform.outbox_events (created_at, id)
  WHERE status = 'PENDING';
