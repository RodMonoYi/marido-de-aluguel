INSERT INTO identity.demo_actors
  (id, role, display_name, professional_id, status)
VALUES
  (
    '019b0000-0000-7000-8000-000000000401',
    'CLIENT',
    'Marina Souza',
    NULL,
    'ACTIVE'
  ),
  (
    '019b0000-0000-7000-8000-000000000402',
    'PROFESSIONAL',
    'Casa em Ordem',
    '019b0000-0000-7000-8000-000000000102',
    'ACTIVE'
  ),
  (
    '019b0000-0000-7000-8000-000000000403',
    'CLIENT',
    'Rafael Nunes',
    NULL,
    'ACTIVE'
  ),
  (
    '019b0000-0000-7000-8000-000000000404',
    'PROFESSIONAL',
    'Ana Reis',
    '019b0000-0000-7000-8000-000000000101',
    'ACTIVE'
  )
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name,
  professional_id = EXCLUDED.professional_id,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO scheduling.calendar_resources
  (id, professional_id, timezone, capacity, status)
VALUES
  (
    '019b0000-0000-7000-8000-000000000501',
    '019b0000-0000-7000-8000-000000000102',
    'America/Bahia',
    1,
    'ACTIVE'
  ),
  (
    '019b0000-0000-7000-8000-000000000502',
    '019b0000-0000-7000-8000-000000000101',
    'America/Bahia',
    1,
    'ACTIVE'
  )
ON CONFLICT (id) DO UPDATE SET
  professional_id = EXCLUDED.professional_id,
  timezone = EXCLUDED.timezone,
  capacity = EXCLUDED.capacity,
  status = EXCLUDED.status,
  updated_at = now();
