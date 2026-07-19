import type { ServiceSummary } from '@marido/contracts';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const date = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Bahia',
});

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatMoney(amountMinor: number): string {
  return currency.format(amountMinor / 100);
}

export function formatDate(value: string): string {
  return date.format(new Date(value));
}

export function formatDateTime(value: string, timeZone = 'America/Bahia'): string {
  let formatter = dateTimeFormatters.get(timeZone);
  if (!formatter) {
    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
    };
    try {
      formatter = new Intl.DateTimeFormat('pt-BR', options);
      dateTimeFormatters.set(timeZone, formatter);
    } catch {
      formatter = new Intl.DateTimeFormat('pt-BR', {
        ...options,
        timeZone: 'America/Bahia',
      });
    }
  }
  return formatter.format(new Date(value));
}

export function formatServicePrice(service: ServiceSummary): string {
  if (!service.pricing.from) {
    return 'Preço sob orçamento';
  }

  const amount = formatMoney(service.pricing.from.amountMinor);
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
