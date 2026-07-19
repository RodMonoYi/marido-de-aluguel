import { z } from 'zod';

export const moneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.literal('BRL'),
});

export const categorySummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  iconKey: z.string(),
  availableProfessionals: z.number().int().nonnegative(),
});

export const verificationBadgeSchema = z.object({
  code: z.enum(['IDENTITY_CONFIRMED', 'PHONE_CONFIRMED', 'PAYOUT_ACCOUNT_CONFIRMED']),
  label: z.string(),
});

export const serviceSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  category: z.object({
    slug: z.string(),
    name: z.string(),
  }),
  pricing: z.object({
    model: z.enum(['FIXED', 'HOURLY', 'DAILY', 'STARTING_AT', 'CUSTOM_QUOTE']),
    from: moneySchema.nullable(),
    unitLabel: z.string(),
  }),
  modalities: z.array(z.enum(['AT_CLIENT', 'AT_PROFESSIONAL', 'REMOTE'])),
  durationMinutes: z.number().int().positive().nullable(),
  summary: z.string(),
});

export const professionalCardSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  displayName: z.string(),
  initials: z.string(),
  headline: z.string(),
  regionLabel: z.string(),
  rating: z.object({
    average: z.number().min(1).max(5).nullable(),
    count: z.number().int().nonnegative(),
  }),
  completedServices: z.number().int().nonnegative(),
  responseTimeLabel: z.string(),
  availabilityLabel: z.string(),
  badges: z.array(verificationBadgeSchema),
  primaryService: serviceSummarySchema,
});

export const professionalProfileSchema = professionalCardSchema.extend({
  bio: z.string(),
  serviceAreas: z.array(z.string()),
  services: z.array(serviceSummarySchema),
  policies: z.object({
    cancellation: z.string(),
    guarantee: z.string().nullable(),
  }),
});

export const intentSchema = z.object({
  id: z.string().uuid(),
  action: z.literal('REQUEST_QUOTE'),
  expiresAt: z.string().datetime({ offset: true }),
});

export const apiMetaSchema = z.object({
  correlation_id: z.string(),
  next_cursor: z.string().optional(),
  total: z.number().int().nonnegative().optional(),
});

export function apiEnvelopeSchema<Schema extends z.ZodType>(data: Schema) {
  return z.object({
    data,
    meta: apiMetaSchema,
  });
}

export type Money = z.infer<typeof moneySchema>;
export type CategorySummary = z.infer<typeof categorySummarySchema>;
export type VerificationBadge = z.infer<typeof verificationBadgeSchema>;
export type ServiceSummary = z.infer<typeof serviceSummarySchema>;
export type ProfessionalCard = z.infer<typeof professionalCardSchema>;
export type ProfessionalProfile = z.infer<typeof professionalProfileSchema>;
export type RestrictedIntent = z.infer<typeof intentSchema>;

export type ApiMeta = z.infer<typeof apiMetaSchema>;

export interface ApiEnvelope<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: Array<{ field: string; code: string }>;
    retryable: boolean;
  };
  meta: {
    correlation_id: string;
  };
}
