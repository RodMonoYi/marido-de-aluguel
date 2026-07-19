CREATE OR REPLACE VIEW marketplace.private_match_eligibility AS
SELECT DISTINCT
  request.id AS request_id,
  profile.id AS professional_id
FROM marketplace.service_requests request
JOIN catalog.categories category
  ON category.id = request.category_id
JOIN catalog.services service
  ON service.category_id = request.category_id
  AND service.status = 'PUBLISHED'
JOIN catalog.professional_profiles profile
  ON profile.id = service.professional_id
  AND profile.status = 'PUBLISHED'
JOIN catalog.service_areas service_area
  ON service_area.professional_id = profile.id
  AND service_area.status = 'ACTIVE'
WHERE request.visibility = 'PRIVATE_MATCHED'
  AND category.status = 'ACTIVE'
  AND category.risk_level IN ('LOW', 'MODERATE')
  AND LOWER(BTRIM(service_area.city)) = LOWER(BTRIM(request.location_city))
  AND UPPER(BTRIM(service_area.state)) = UPPER(BTRIM(request.location_state))
  AND EXISTS (
    SELECT 1
    FROM identity.demo_actors actor
    WHERE actor.professional_id = profile.id
      AND actor.role = 'PROFESSIONAL'
      AND actor.status = 'ACTIVE'
  );

CREATE INDEX IF NOT EXISTS service_areas_active_location_professional_idx
  ON catalog.service_areas (
    LOWER(BTRIM(city)),
    UPPER(BTRIM(state)),
    professional_id
  )
  WHERE status = 'ACTIVE';

ALTER TABLE marketplace.opportunity_recipients
  DROP CONSTRAINT IF EXISTS opportunity_recipients_eligibility_reason_check;

DELETE FROM marketplace.opportunity_recipients recipient
WHERE NOT EXISTS (
  SELECT 1
  FROM marketplace.private_match_eligibility eligibility
  WHERE eligibility.request_id = recipient.request_id
    AND eligibility.professional_id = recipient.professional_id
);

UPDATE marketplace.opportunity_recipients
SET eligibility_reason = 'CATEGORY_AND_SERVICE_AREA_MATCH'
WHERE eligibility_reason <> 'CATEGORY_AND_SERVICE_AREA_MATCH';

ALTER TABLE marketplace.opportunity_recipients
  ADD CONSTRAINT opportunity_recipients_eligibility_reason_check
  CHECK (eligibility_reason = 'CATEGORY_AND_SERVICE_AREA_MATCH');
