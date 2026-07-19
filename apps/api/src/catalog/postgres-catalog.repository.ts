import { Injectable } from '@nestjs/common';
import type {
  CategorySummary,
  ProfessionalCard,
  ProfessionalProfile,
  ServiceSummary,
  VerificationBadge,
} from '@marido/contracts';
import type { QueryResultRow } from 'pg';

import { DatabaseService } from '../database/database.service';
import {
  CatalogRepository,
  type SearchProfessionalsInput,
  type SearchProfessionalsResult,
} from './catalog.repository';

interface CategoryRow extends QueryResultRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconKey: string;
  availableProfessionals: number;
}

interface ProfessionalCardRow extends QueryResultRow {
  id: string;
  slug: string;
  displayName: string;
  initials: string;
  headline: string;
  city: string;
  state: string;
  ratingAverage: number | null;
  reviewCount: number;
  completedServices: number;
  responseTimeLabel: string;
  availabilityLabel: string;
  badges: VerificationBadge[];
  primaryService: ServiceSummary;
  total: number;
}

interface ProfessionalProfileRow extends ProfessionalCardRow {
  bio: string;
  cancellationPolicy: string;
  guaranteePolicy: string | null;
  serviceAreas: string[];
}

interface ServiceRow extends QueryResultRow {
  id: string;
  slug: string;
  name: string;
  summary: string;
  pricingModel: ServiceSummary['pricing']['model'];
  priceFromMinor: number | null;
  unitLabel: string;
  modalities: ServiceSummary['modalities'];
  durationMinutes: number | null;
  categorySlug: string;
  categoryName: string;
}

interface CursorValue {
  offset: number;
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }

  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorValue;
    return Number.isInteger(value.offset) && value.offset >= 0 ? value.offset : 0;
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function toCard(row: ProfessionalCardRow): ProfessionalCard {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    initials: row.initials,
    headline: row.headline,
    regionLabel: `${row.city}, ${row.state}`,
    rating: {
      average: row.ratingAverage === null ? null : Number(row.ratingAverage),
      count: Number(row.reviewCount),
    },
    completedServices: Number(row.completedServices),
    responseTimeLabel: row.responseTimeLabel,
    availabilityLabel: row.availabilityLabel,
    badges: row.badges,
    primaryService: row.primaryService,
  };
}

@Injectable()
export class PostgresCatalogRepository extends CatalogRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async listCategories(): Promise<CategorySummary[]> {
    const result = await this.database.query<CategoryRow>(`
      SELECT
        category.id,
        category.slug,
        category.name,
        category.description,
        category.icon_key AS "iconKey",
        COUNT(DISTINCT profile.id)::int AS "availableProfessionals"
      FROM catalog.categories category
      LEFT JOIN catalog.services service
        ON service.category_id = category.id
        AND service.status = 'PUBLISHED'
      LEFT JOIN catalog.professional_profiles profile
        ON profile.id = service.professional_id
        AND profile.status = 'PUBLISHED'
      WHERE category.status = 'ACTIVE'
      GROUP BY category.id
      ORDER BY category.display_order, category.id
    `);
    return result.rows;
  }

  async searchProfessionals(input: SearchProfessionalsInput): Promise<SearchProfessionalsResult> {
    const values: unknown[] = [];
    const conditions = [`profile.status = 'PUBLISHED'`];
    let categoryPlaceholder: string | undefined;

    if (input.category) {
      values.push(input.category);
      categoryPlaceholder = `$${values.length}`;
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM catalog.services eligible_service
          JOIN catalog.categories eligible_category
            ON eligible_category.id = eligible_service.category_id
          WHERE eligible_service.professional_id = profile.id
            AND eligible_service.status = 'PUBLISHED'
            AND eligible_category.status = 'ACTIVE'
            AND eligible_category.slug = ${categoryPlaceholder}
        )
      `);
    } else {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM catalog.services eligible_service
          WHERE eligible_service.professional_id = profile.id
            AND eligible_service.status = 'PUBLISHED'
        )
      `);
    }

    if (input.city) {
      values.push(`%${input.city.trim()}%`);
      conditions.push(`unaccent(profile.city) ILIKE unaccent($${values.length})`);
    }

    if (input.q) {
      values.push(`%${input.q.trim()}%`);
      const queryPlaceholder = `$${values.length}`;
      conditions.push(`
        (
          unaccent(profile.display_name) ILIKE unaccent(${queryPlaceholder})
          OR unaccent(profile.headline) ILIKE unaccent(${queryPlaceholder})
          OR EXISTS (
            SELECT 1
            FROM catalog.services matching_service
            JOIN catalog.categories matching_category
              ON matching_category.id = matching_service.category_id
            WHERE matching_service.professional_id = profile.id
              AND matching_service.status = 'PUBLISHED'
              AND (
                unaccent(matching_service.name) ILIKE unaccent(${queryPlaceholder})
                OR unaccent(matching_category.name) ILIKE unaccent(${queryPlaceholder})
              )
          )
        )
      `);
    }

    const offset = decodeCursor(input.cursor);
    values.push(input.limit + 1);
    const limitPlaceholder = `$${values.length}`;
    values.push(offset);
    const offsetPlaceholder = `$${values.length}`;
    const serviceCategoryCondition = categoryPlaceholder
      ? `AND primary_category.slug = ${categoryPlaceholder}`
      : '';

    const result = await this.database.query<ProfessionalCardRow>(
      `
        SELECT
          profile.id,
          profile.slug,
          profile.display_name AS "displayName",
          profile.initials,
          profile.headline,
          profile.city,
          profile.state,
          profile.rating_average::float8 AS "ratingAverage",
          profile.review_count AS "reviewCount",
          profile.completed_services AS "completedServices",
          profile.response_time_label AS "responseTimeLabel",
          profile.availability_label AS "availabilityLabel",
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object('code', badge.code, 'label', badge.label)
                ORDER BY badge.code
              )
              FROM catalog.professional_badges badge
              WHERE badge.professional_id = profile.id
                AND badge.status = 'ACTIVE'
                AND (badge.expires_at IS NULL OR badge.expires_at > now())
            ),
            '[]'::jsonb
          ) AS badges,
          (
            SELECT jsonb_build_object(
              'id', primary_service.id,
              'slug', primary_service.slug,
              'name', primary_service.name,
              'category', jsonb_build_object(
                'slug', primary_category.slug,
                'name', primary_category.name
              ),
              'pricing', jsonb_build_object(
                'model', primary_service.pricing_model,
                'from', CASE
                  WHEN primary_service.price_from_minor IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'amountMinor', primary_service.price_from_minor,
                    'currency', primary_service.currency
                  )
                END,
                'unitLabel', primary_service.unit_label
              ),
              'modalities', to_jsonb(primary_service.modalities),
              'durationMinutes', primary_service.duration_minutes,
              'summary', primary_service.summary
            )
            FROM catalog.services primary_service
            JOIN catalog.categories primary_category
              ON primary_category.id = primary_service.category_id
            WHERE primary_service.professional_id = profile.id
              AND primary_service.status = 'PUBLISHED'
              AND primary_category.status = 'ACTIVE'
              ${serviceCategoryCondition}
            ORDER BY primary_service.is_featured DESC, primary_service.created_at, primary_service.id
            LIMIT 1
          ) AS "primaryService",
          (COUNT(*) OVER())::int AS total
        FROM catalog.professional_profiles profile
        WHERE ${conditions.join(' AND ')}
        ORDER BY
          profile.rating_average DESC NULLS LAST,
          profile.completed_services DESC,
          profile.id
        LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
      `,
      values,
    );

    const total = result.rows[0]?.total ?? 0;
    const hasMore = result.rows.length > input.limit;
    const rows = hasMore ? result.rows.slice(0, input.limit) : result.rows;

    return {
      items: rows.map(toCard),
      total,
      ...(hasMore ? { nextCursor: encodeCursor(offset + input.limit) } : {}),
    };
  }

  async findProfessionalBySlug(slug: string): Promise<ProfessionalProfile | null> {
    const profileResult = await this.database.query<ProfessionalProfileRow>(
      `
        SELECT
          profile.id,
          profile.slug,
          profile.display_name AS "displayName",
          profile.initials,
          profile.headline,
          profile.bio,
          profile.city,
          profile.state,
          profile.rating_average::float8 AS "ratingAverage",
          profile.review_count AS "reviewCount",
          profile.completed_services AS "completedServices",
          profile.response_time_label AS "responseTimeLabel",
          profile.availability_label AS "availabilityLabel",
          profile.cancellation_policy AS "cancellationPolicy",
          profile.guarantee_policy AS "guaranteePolicy",
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object('code', badge.code, 'label', badge.label)
                ORDER BY badge.code
              )
              FROM catalog.professional_badges badge
              WHERE badge.professional_id = profile.id
                AND badge.status = 'ACTIVE'
                AND (badge.expires_at IS NULL OR badge.expires_at > now())
            ),
            '[]'::jsonb
          ) AS badges,
          COALESCE(
            (
              SELECT array_agg(area.region_label ORDER BY area.region_label)
              FROM catalog.service_areas area
              WHERE area.professional_id = profile.id
                AND area.status = 'ACTIVE'
            ),
            ARRAY[]::text[]
          ) AS "serviceAreas",
          NULL::jsonb AS "primaryService",
          1 AS total
        FROM catalog.professional_profiles profile
        WHERE profile.slug = $1
          AND profile.status = 'PUBLISHED'
        LIMIT 1
      `,
      [slug],
    );

    const row = profileResult.rows[0];
    if (!row) {
      return null;
    }

    const servicesResult = await this.database.query<ServiceRow>(
      `
        SELECT
          service.id,
          service.slug,
          service.name,
          service.summary,
          service.pricing_model AS "pricingModel",
          service.price_from_minor AS "priceFromMinor",
          service.unit_label AS "unitLabel",
          service.modalities,
          service.duration_minutes AS "durationMinutes",
          category.slug AS "categorySlug",
          category.name AS "categoryName"
        FROM catalog.services service
        JOIN catalog.categories category ON category.id = service.category_id
        WHERE service.professional_id = $1
          AND service.status = 'PUBLISHED'
          AND category.status = 'ACTIVE'
        ORDER BY service.is_featured DESC, service.created_at, service.id
      `,
      [row.id],
    );

    const services: ServiceSummary[] = servicesResult.rows.map((service) => ({
      id: service.id,
      slug: service.slug,
      name: service.name,
      category: {
        slug: service.categorySlug,
        name: service.categoryName,
      },
      pricing: {
        model: service.pricingModel,
        from:
          service.priceFromMinor === null
            ? null
            : { amountMinor: Number(service.priceFromMinor), currency: 'BRL' },
        unitLabel: service.unitLabel,
      },
      modalities: service.modalities,
      durationMinutes: service.durationMinutes,
      summary: service.summary,
    }));

    const [primaryService] = services;
    if (!primaryService) {
      return null;
    }

    return {
      ...toCard({ ...row, primaryService }),
      bio: row.bio,
      serviceAreas: row.serviceAreas,
      services,
      policies: {
        cancellation: row.cancellationPolicy,
        guarantee: row.guaranteePolicy,
      },
    };
  }
}
