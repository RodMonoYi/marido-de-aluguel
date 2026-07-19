import type { ServiceSummary } from '@marido/contracts';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatServicePrice(service: ServiceSummary): string {
  if (!service.pricing.from) {
    return 'Preço sob orçamento';
  }

  const amount = currency.format(service.pricing.from.amountMinor / 100);
  return service.pricing.model === 'STARTING_AT'
    ? `A partir de ${amount} ${service.pricing.unitLabel}`
    : `${amount} ${service.pricing.unitLabel}`;
}

export function modalityLabel(modality: ServiceSummary['modalities'][number]): string {
  const labels = {
    AT_CLIENT: 'No endereço do cliente',
    AT_PROFESSIONAL: 'No local do profissional',
    REMOTE: 'Atendimento remoto',
  } as const;
  return labels[modality];
}
