import { z } from 'zod';

export const DEMO_COMMERCIAL_POLICY = {
  code: 'DEMO_COMMISSION_15_PERCENT',
  version: 1,
  developmentOnly: true,
  professionalCommissionRateBps: 1_500,
  customerPlatformFeeMinor: 0,
  currency: 'BRL',
  rounding: 'HALF_UP',
} as const;

export const DEMO_ACCEPTANCE_POLICY = {
  version: 'DEMO-CONTRACT-PTBR-1',
  text: 'Declaro que li e aceito o escopo, os itens incluídos e excluídos, a composição do preço, a agenda, a política de cancelamento e a garantia da revisão selecionada. Entendo que este aceite cria um contrato aguardando pagamento, sem realizar cobrança nem confirmar a reserva do serviço.',
  textHash: '4b248e93828ef5204ffc74e98d3b5ea87dcd1f9a2175f87f4406430de5f2b3c3',
} as const;

export const DEMO_CANCELLATION_POLICY = {
  code: 'DEMO_CANCELLATION_NO_CHARGE',
  version: 1,
  label: 'Demonstração sem cobrança: cancelamentos não geram taxa.',
} as const;

export const minorAmountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const moneySchema = z.object({
  amountMinor: minorAmountSchema,
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
  modalities: z.array(z.enum(['AT_CLIENT', 'AT_PROFESSIONAL', 'REMOTE'])).min(1),
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
  services: z.array(serviceSummarySchema).min(1),
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

export const actorRoleSchema = z.enum(['CLIENT', 'PROFESSIONAL']);

export const demoActorSchema = z.discriminatedUnion('role', [
  z.object({
    id: z.string().uuid(),
    role: z.literal('CLIENT'),
    displayName: z.string().min(1),
    professionalId: z.null(),
  }),
  z.object({
    id: z.string().uuid(),
    role: z.literal('PROFESSIONAL'),
    displayName: z.string().min(1),
    professionalId: z.string().uuid(),
  }),
]);

export const requestStatusSchema = z.enum([
  'DRAFT',
  'PUBLISHED',
  'CONVERTED',
  'CANCELLED',
  'EXPIRED',
]);

export const proposalStatusSchema = z.enum([
  'SENT',
  'VIEWED',
  'NEGOTIATING',
  'REVISED',
  'CONVERTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);

export const contractStatusSchema = z.enum(['AWAITING_PAYMENT', 'CANCELLED']);
export const paymentOrderStatusSchema = z.enum(['AWAITING_PAYMENT', 'EXPIRED', 'CANCELLED']);

export const approximateLocationSchema = z
  .object({
    city: z.string().trim().min(2).max(80),
    state: z.string().regex(/^[A-Z]{2}$/),
    district: z.string().trim().min(2).max(80).nullable().optional(),
  })
  .strict();

export const desiredWindowSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(80),
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'A data final deve ser posterior à data inicial.',
      });
    }
  });

export const requestBudgetSchema = z
  .object({
    minMinor: minorAmountSchema.nullable().optional(),
    maxMinor: minorAmountSchema.nullable().optional(),
    currency: z.literal('BRL'),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.minMinor !== null &&
      value.minMinor !== undefined &&
      value.maxMinor !== null &&
      value.maxMinor !== undefined &&
      value.minMinor > value.maxMinor
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maxMinor'],
        message: 'O orçamento máximo deve ser maior ou igual ao mínimo.',
      });
    }
  });

export const createServiceRequestInputSchema = z
  .object({
    categoryId: z.string().uuid(),
    title: z.string().trim().min(10).max(120),
    description: z.string().trim().min(20).max(2_000),
    locationApprox: approximateLocationSchema,
    desiredWindow: desiredWindowSchema,
    urgency: z.enum(['FLEXIBLE', 'WITHIN_7_DAYS', 'URGENT']),
    budget: requestBudgetSchema.nullable().optional(),
    visibility: z.literal('PRIVATE_MATCHED'),
    proposalDeadline: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.proposalDeadline) >= Date.parse(value.desiredWindow.startsAt)) {
      context.addIssue({
        code: 'custom',
        path: ['proposalDeadline'],
        message: 'O prazo de propostas deve terminar antes do início desejado.',
      });
    }
  });

export const serviceRequestSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  category: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
  }),
  locationApprox: approximateLocationSchema,
  desiredWindow: desiredWindowSchema,
  urgency: z.enum(['FLEXIBLE', 'WITHIN_7_DAYS', 'URGENT']),
  budget: requestBudgetSchema.nullable(),
  visibility: z.literal('PRIVATE_MATCHED'),
  status: requestStatusSchema,
  version: z.number().int().positive(),
  proposalDeadline: z.string().datetime({ offset: true }),
  proposalCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
});

export const proposalAmountsSchema = z
  .object({
    laborMinor: minorAmountSchema,
    materialsMinor: minorAmountSchema,
    travelMinor: minorAmountSchema,
    currency: z.literal('BRL'),
  })
  .strict();

export const proposalRevisionInputSchema = z
  .object({
    scope: z.string().trim().min(20).max(4_000),
    included: z.array(z.string().trim().min(2).max(240)).min(1).max(20),
    excluded: z.array(z.string().trim().min(2).max(240)).max(20),
    amounts: proposalAmountsSchema,
    schedule: desiredWindowSchema,
    validUntil: z.string().datetime({ offset: true }),
    guaranteeOffer: z.string().trim().min(10).max(1_000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.validUntil) <= Date.now()) {
      context.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: 'A validade da proposta deve estar no futuro.',
      });
    }
  });

export const proposalBreakdownSchema = z.object({
  laborMinor: minorAmountSchema,
  materialsMinor: minorAmountSchema,
  travelMinor: minorAmountSchema,
  customerPlatformFeeMinor: minorAmountSchema,
  professionalCommissionMinor: minorAmountSchema,
  customerTotalMinor: minorAmountSchema,
  professionalNetEstimateMinor: minorAmountSchema,
  currency: z.literal('BRL'),
  policy: z.object({
    code: z.string(),
    version: z.number().int().positive(),
    developmentOnly: z.boolean(),
  }),
});

export function calculateDemoProposalBreakdown(
  amounts: z.infer<typeof proposalAmountsSchema>,
): z.infer<typeof proposalBreakdownSchema> {
  const input = proposalAmountsSchema.parse(amounts);
  const labor = BigInt(input.laborMinor);
  const materials = BigInt(input.materialsMinor);
  const travel = BigInt(input.travelMinor);
  const gross = labor + materials + travel;
  const commissionRate = BigInt(DEMO_COMMERCIAL_POLICY.professionalCommissionRateBps);
  const commission = (gross * commissionRate + 5_000n) / 10_000n;
  const customerPlatformFee = BigInt(DEMO_COMMERCIAL_POLICY.customerPlatformFeeMinor);
  const customerTotal = gross + customerPlatformFee;
  const professionalNet = gross - commission;
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);

  if (
    gross > maximum ||
    commission > maximum ||
    customerTotal > maximum ||
    professionalNet < 0n ||
    professionalNet > maximum
  ) {
    throw new RangeError('Proposal breakdown exceeds the supported safe integer range');
  }

  return {
    laborMinor: Number(labor),
    materialsMinor: Number(materials),
    travelMinor: Number(travel),
    customerPlatformFeeMinor: Number(customerPlatformFee),
    professionalCommissionMinor: Number(commission),
    customerTotalMinor: Number(customerTotal),
    professionalNetEstimateMinor: Number(professionalNet),
    currency: DEMO_COMMERCIAL_POLICY.currency,
    policy: {
      code: DEMO_COMMERCIAL_POLICY.code,
      version: DEMO_COMMERCIAL_POLICY.version,
      developmentOnly: DEMO_COMMERCIAL_POLICY.developmentOnly,
    },
  };
}

export const proposalRevisionSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  scope: z.string(),
  included: z.array(z.string()),
  excluded: z.array(z.string()),
  breakdown: proposalBreakdownSchema,
  schedule: desiredWindowSchema,
  validUntil: z.string().datetime({ offset: true }),
  policies: z.object({
    cancellation: z.object({
      code: z.string(),
      version: z.number().int().positive(),
      label: z.string(),
    }),
    guarantee: z
      .object({
        offeredBy: z.literal('PROFESSIONAL'),
        text: z.string(),
      })
      .nullable(),
  }),
  createdAt: z.string().datetime({ offset: true }),
});

export const proposalSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  professional: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    displayName: z.string(),
  }),
  status: proposalStatusSchema,
  version: z.number().int().positive(),
  currentRevision: proposalRevisionSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const paymentOrderSchema = z.object({
  id: z.string().uuid(),
  contractId: z.string().uuid(),
  status: paymentOrderStatusSchema,
  amount: moneySchema,
  checkoutAvailable: z.literal(false),
  createdAt: z.string().datetime({ offset: true }),
});

export const contractSnapshotSchema = z.object({
  request: z.object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    title: z.string(),
    description: z.string(),
    category: z.object({
      id: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
    }),
    locationApprox: approximateLocationSchema,
    desiredWindow: desiredWindowSchema,
    urgency: z.enum(['FLEXIBLE', 'WITHIN_7_DAYS', 'URGENT']),
    budget: requestBudgetSchema.nullable(),
  }),
  parties: z.object({
    customerActorId: z.string().uuid(),
    professionalActorId: z.string().uuid(),
    professionalProfileId: z.string().uuid(),
  }),
  proposal: z.object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    revision: proposalRevisionSchema,
  }),
  acceptance: z.object({
    textVersion: z.literal(DEMO_ACCEPTANCE_POLICY.version),
    text: z.literal(DEMO_ACCEPTANCE_POLICY.text),
    textHash: z.literal(DEMO_ACCEPTANCE_POLICY.textHash),
    acceptedAt: z.string().datetime({ offset: true }),
  }),
});

export const contractSchema = z
  .object({
    id: z.string().uuid(),
    requestId: z.string().uuid(),
    proposalId: z.string().uuid(),
    acceptedRevisionId: z.string().uuid(),
    status: contractStatusSchema,
    version: z.number().int().positive(),
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
    acceptanceTextVersion: z.literal(DEMO_ACCEPTANCE_POLICY.version),
    acceptedAt: z.string().datetime({ offset: true }),
    snapshot: contractSnapshotSchema,
  })
  .superRefine((value, context) => {
    const equalities: Array<[boolean, string, string]> = [
      [
        value.requestId === value.snapshot.request.id,
        'requestId',
        'Pedido divergente do snapshot.',
      ],
      [
        value.proposalId === value.snapshot.proposal.id,
        'proposalId',
        'Proposta divergente do snapshot.',
      ],
      [
        value.acceptedRevisionId === value.snapshot.proposal.revision.id,
        'acceptedRevisionId',
        'Revisão divergente do snapshot.',
      ],
      [
        value.acceptedAt === value.snapshot.acceptance.acceptedAt,
        'acceptedAt',
        'Instante de aceite divergente do snapshot.',
      ],
      [
        value.acceptanceTextVersion === value.snapshot.acceptance.textVersion,
        'acceptanceTextVersion',
        'Versão do texto de aceite divergente do snapshot.',
      ],
    ];

    for (const [valid, path, message] of equalities) {
      if (!valid) {
        context.addIssue({ code: 'custom', path: [path], message });
      }
    }
  });

export const bookingHoldSchema = z.object({
  id: z.string().uuid(),
  contractId: z.string().uuid(),
  status: z.enum(['HOLD_ACTIVE', 'HOLD_EXPIRED', 'HOLD_RELEASED']),
  schedule: desiredWindowSchema,
  expiresAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
});

export const proposalAcceptanceSchema = z
  .object({
    contract: contractSchema,
    paymentOrder: paymentOrderSchema,
    bookingHold: bookingHoldSchema,
  })
  .superRefine((value, context) => {
    if (value.paymentOrder.contractId !== value.contract.id) {
      context.addIssue({
        code: 'custom',
        path: ['paymentOrder', 'contractId'],
        message: 'Ordem de pagamento divergente do contrato.',
      });
    }
    if (value.bookingHold.contractId !== value.contract.id) {
      context.addIssue({
        code: 'custom',
        path: ['bookingHold', 'contractId'],
        message: 'Hold divergente do contrato.',
      });
    }

    const active =
      value.contract.status === 'AWAITING_PAYMENT' &&
      value.paymentOrder.status === 'AWAITING_PAYMENT' &&
      value.bookingHold.status === 'HOLD_ACTIVE';
    const expired =
      value.contract.status === 'CANCELLED' &&
      value.paymentOrder.status === 'EXPIRED' &&
      value.bookingHold.status === 'HOLD_EXPIRED';
    const cancelled =
      value.contract.status === 'CANCELLED' &&
      value.paymentOrder.status === 'CANCELLED' &&
      value.bookingHold.status === 'HOLD_RELEASED';

    if (!active && !expired && !cancelled) {
      context.addIssue({
        code: 'custom',
        path: ['contract', 'status'],
        message: 'Estados de contrato, ordem e hold são incompatíveis.',
      });
    }

    const acceptedRevision = value.contract.snapshot.proposal.revision;
    if (
      value.paymentOrder.amount.amountMinor !== acceptedRevision.breakdown.customerTotalMinor ||
      value.paymentOrder.amount.currency !== acceptedRevision.breakdown.currency
    ) {
      context.addIssue({
        code: 'custom',
        path: ['paymentOrder', 'amount'],
        message: 'Valor da ordem diverge da revisão aceita.',
      });
    }

    if (
      value.bookingHold.schedule.startsAt !== acceptedRevision.schedule.startsAt ||
      value.bookingHold.schedule.endsAt !== acceptedRevision.schedule.endsAt ||
      value.bookingHold.schedule.timezone !== acceptedRevision.schedule.timezone
    ) {
      context.addIssue({
        code: 'custom',
        path: ['bookingHold', 'schedule'],
        message: 'Agenda do hold diverge da revisão aceita.',
      });
    }
  });

export const acceptProposalInputSchema = z
  .object({
    revisionId: z.string().uuid(),
    acceptanceTextVersion: z.literal(DEMO_ACCEPTANCE_POLICY.version),
  })
  .strict();

export const apiMetaSchema = z.object({
  correlation_id: z.string().uuid(),
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
export type ActorRole = z.infer<typeof actorRoleSchema>;
export type DemoActor = z.infer<typeof demoActorSchema>;
export type ServiceRequestStatus = z.infer<typeof requestStatusSchema>;
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;
export type ContractStatus = z.infer<typeof contractStatusSchema>;
export type PaymentOrderStatus = z.infer<typeof paymentOrderStatusSchema>;
export type ApproximateLocation = z.infer<typeof approximateLocationSchema>;
export type DesiredWindow = z.infer<typeof desiredWindowSchema>;
export type RequestBudget = z.infer<typeof requestBudgetSchema>;
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestInputSchema>;
export type ServiceRequest = z.infer<typeof serviceRequestSchema>;
export type ProposalAmounts = z.infer<typeof proposalAmountsSchema>;
export type ProposalRevisionInput = z.infer<typeof proposalRevisionInputSchema>;
export type ProposalBreakdown = z.infer<typeof proposalBreakdownSchema>;
export type ProposalRevision = z.infer<typeof proposalRevisionSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type PaymentOrder = z.infer<typeof paymentOrderSchema>;
export type ContractSnapshot = z.infer<typeof contractSnapshotSchema>;
export type Contract = z.infer<typeof contractSchema>;
export type BookingHold = z.infer<typeof bookingHoldSchema>;
export type ProposalAcceptance = z.infer<typeof proposalAcceptanceSchema>;
export type AcceptProposalInput = z.infer<typeof acceptProposalInputSchema>;

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
