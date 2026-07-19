const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  CONVERTED: 'Convertido em contrato',
  CANCELLED: 'Cancelado',
  SENT: 'Enviada',
  VIEWED: 'Visualizada',
  NEGOTIATING: 'Em negociação',
  REVISED: 'Revisada',
  REJECTED: 'Recusada',
  EXPIRED: 'Prazo expirado',
  AWAITING_PAYMENT: 'Aguardando pagamento',
  HOLD_ACTIVE: 'Hold ativo',
  HOLD_EXPIRED: 'Hold expirado',
  HOLD_RELEASED: 'Hold liberado',
};

interface StatusChipProps {
  status: string;
}

export function StatusChip({ status }: StatusChipProps) {
  const normalized = status.toLowerCase().replaceAll('_', '-');
  return (
    <span className={`status-chip status-${normalized}`}>
      <span aria-hidden="true" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
