CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS discovery;

CREATE TABLE IF NOT EXISTS catalog.categories (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  icon_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED')),
  risk_level text NOT NULL CHECK (risk_level IN ('LOW', 'MODERATE', 'HIGH', 'PROHIBITED')),
  display_order integer NOT NULL CHECK (display_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.professional_profiles (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  initials varchar(3) NOT NULL,
  headline text NOT NULL,
  bio text NOT NULL,
  city text NOT NULL,
  state char(2) NOT NULL,
  rating_average numeric(3, 2) CHECK (
    rating_average IS NULL OR rating_average BETWEEN 1 AND 5
  ),
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  completed_services integer NOT NULL DEFAULT 0 CHECK (completed_services >= 0),
  response_time_label text NOT NULL,
  availability_label text NOT NULL,
  cancellation_policy text NOT NULL,
  guarantee_policy text,
  status text NOT NULL CHECK (status IN ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'PAUSED', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (review_count = 0 AND rating_average IS NULL)
    OR (review_count > 0 AND rating_average IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS catalog.services (
  id uuid PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES catalog.professional_profiles(id),
  category_id uuid NOT NULL REFERENCES catalog.categories(id),
  slug text NOT NULL,
  name text NOT NULL,
  summary text NOT NULL,
  pricing_model text NOT NULL CHECK (
    pricing_model IN ('FIXED', 'HOURLY', 'DAILY', 'STARTING_AT', 'CUSTOM_QUOTE')
  ),
  price_from_minor integer CHECK (price_from_minor IS NULL OR price_from_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  unit_label text NOT NULL,
  modalities text[] NOT NULL,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  is_featured boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'PAUSED', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, slug),
  CHECK (
    modalities <@ ARRAY['AT_CLIENT', 'AT_PROFESSIONAL', 'REMOTE']::text[]
    AND cardinality(modalities) > 0
  ),
  CHECK (
    (pricing_model = 'CUSTOM_QUOTE' AND price_from_minor IS NULL)
    OR pricing_model <> 'CUSTOM_QUOTE'
  )
);

CREATE TABLE IF NOT EXISTS catalog.professional_badges (
  professional_id uuid NOT NULL REFERENCES catalog.professional_profiles(id),
  code text NOT NULL CHECK (
    code IN ('IDENTITY_CONFIRMED', 'PHONE_CONFIRMED', 'PAYOUT_ACCOUNT_CONFIRMED')
  ),
  label text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
  verified_at timestamptz NOT NULL,
  expires_at timestamptz,
  PRIMARY KEY (professional_id, code)
);

CREATE TABLE IF NOT EXISTS catalog.service_areas (
  id uuid PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES catalog.professional_profiles(id),
  region_label text NOT NULL,
  city text NOT NULL,
  state char(2) NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, region_label)
);

CREATE TABLE IF NOT EXISTS discovery.restricted_intents (
  id uuid PRIMARY KEY,
  action text NOT NULL CHECK (action = 'REQUEST_QUOTE'),
  professional_id uuid NOT NULL REFERENCES catalog.professional_profiles(id),
  service_id uuid NOT NULL REFERENCES catalog.services(id),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'CONSUMED', 'EXPIRED', 'INVALIDATED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS categories_active_order_idx
  ON catalog.categories (display_order, id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS professionals_public_order_idx
  ON catalog.professional_profiles (rating_average DESC NULLS LAST, completed_services DESC, id)
  WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS professionals_name_trgm_idx
  ON catalog.professional_profiles USING gin (display_name gin_trgm_ops)
  WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS professionals_city_idx
  ON catalog.professional_profiles (lower(city), state)
  WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS services_public_category_idx
  ON catalog.services (category_id, professional_id, is_featured DESC)
  WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS services_name_trgm_idx
  ON catalog.services USING gin (name gin_trgm_ops)
  WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS restricted_intents_expiry_idx
  ON discovery.restricted_intents (expires_at)
  WHERE status = 'ACTIVE';
