import type { ServiceRequest } from '@marido/contracts';

import { formatDate, formatDateTime, formatMoney } from '@/lib/format';

import { StatusChip } from './status-chip';

interface ServiceRequestSummaryProps {
  request: ServiceRequest;
  compact?: boolean;
}

const URGENCY_LABELS = {
  FLEXIBLE: 'Data flexível',
  WITHIN_7_DAYS: 'Necessidade em até 7 dias',
  URGENT: 'Urgente',
} as const;

export function ServiceRequestSummary({ request, compact = false }: ServiceRequestSummaryProps) {
  const location = [
    request.locationApprox.district,
    request.locationApprox.city,
    request.locationApprox.state,
  ]
    .filter(Boolean)
    .join(', ');
  const budget =
    request.budget?.minMinor !== null && request.budget?.minMinor !== undefined
      ? request.budget.maxMinor !== null && request.budget.maxMinor !== undefined
        ? `${formatMoney(request.budget.minMinor)} a ${formatMoney(request.budget.maxMinor)}`
        : `A partir de ${formatMoney(request.budget.minMinor)}`
      : request.budget?.maxMinor !== null && request.budget?.maxMinor !== undefined
        ? `Até ${formatMoney(request.budget.maxMinor)}`
        : 'Não informado';

  return (
    <article className={`request-summary ${compact ? 'request-summary-compact' : ''}`}>
      <div className="request-summary-heading">
        <div>
          <p className="service-kicker">{request.category.name}</p>
          <h2>{request.title}</h2>
        </div>
        <StatusChip status={request.status} />
      </div>
      <p className="request-description">{request.description}</p>
      <dl className="request-facts">
        <div>
          <dt>Região aproximada</dt>
          <dd>{location}</dd>
        </div>
        <div>
          <dt>Data desejada</dt>
          <dd>
            {formatDate(request.desiredWindow.startsAt)}
            {!compact
              ? `, a partir de ${formatDateTime(
                  request.desiredWindow.startsAt,
                  request.desiredWindow.timezone,
                )}`
              : ''}
          </dd>
        </div>
        <div>
          <dt>Urgência</dt>
          <dd>{URGENCY_LABELS[request.urgency]}</dd>
        </div>
        <div>
          <dt>Faixa de orçamento</dt>
          <dd>{budget}</dd>
        </div>
        {!compact ? (
          <>
            <div>
              <dt>Propostas até</dt>
              <dd>{formatDateTime(request.proposalDeadline, request.desiredWindow.timezone)}</dd>
            </div>
            <div>
              <dt>Propostas recebidas</dt>
              <dd>{request.proposalCount}</dd>
            </div>
          </>
        ) : null}
      </dl>
    </article>
  );
}
